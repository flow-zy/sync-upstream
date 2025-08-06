import type { SimpleGit, SimpleGitProgressEvent } from 'simple-git'
import type { RetryConfig } from './retry'
import type { SyncOptions } from './types'
import path from 'node:path'
import chalk from 'chalk'
import fs from 'fs-extra'
import pLimit from 'p-limit'
import prompts from 'prompts'

import simpleGit from 'simple-git'
import { FsError, GitError, handleError, SyncProcessError, UserCancelError } from './errors'
import { getDirectoryHashes, getFileHash, loadHashes, saveHashes } from './hash'
import { loadIgnorePatterns, shouldIgnore } from './ignore'
import { logger, LogLevel } from './logger'

import { displaySummary } from './prompts'
import { withRetry } from './retry'
// 创建一个简单的进度条实现，因为 consola 3.x 移除了内置的 ProgressBar
class SimpleProgressBar {
  private total: number
  private value: number
  private format: string

  constructor(options: { format: string }) {
    this.total = 0
    this.value = 0
    this.format = options.format
  }

  update(params: { total: number, value: number }) {
    this.total = params.total
    this.value = params.value
    const percentage = Math.round((this.value / this.total) * 100)
    const barLength = 30
    const filledLength = Math.round((barLength * this.value) / this.total)
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
    console.log(
      `\r${this.format.replace('{bar}', bar).replace('{percentage}', percentage.toString())}`,
    )
  }

  stop() {
    console.log()
  }
}

export class UpstreamSyncer {
  private git: SimpleGit
  private tempDir: string
  private tempBranch: string
  private progressBar: SimpleProgressBar | null = null
  private stepCounter: number = 1
  private hashFile: string
  private concurrencyLimit = 5 // 并行处理的最大并发数
  private forceOverwrite: boolean

  constructor(private options: SyncOptions) {
    this.git = simpleGit({
      progress: this.handleProgress.bind(this),
      config: [
        `core.quiet=${options.silent ? 'true' : 'false'}`,
      ],
    })
    this.tempDir = path.join(process.cwd(), '.sync-temp')
    this.tempBranch = `temp-sync-${Date.now()}`
    this.hashFile = path.join(process.cwd(), '.sync-hashes.json')
    // 从选项中获取强制覆盖标志，如果没有提供则默认为true
    this.forceOverwrite = options.forceOverwrite !== undefined ? options.forceOverwrite : true

    // 配置日志级别
    if (options.verbose) {
      logger.setLevel(LogLevel.VERBOSE)
    }
    else if (options.silent) {
      logger.setLevel(LogLevel.ERROR)
    }
  }

  private logStep(message: string) {
    logger.step(this.stepCounter++, message)
  }

  private handleProgress(event: SimpleGitProgressEvent) {
    if (event.method === 'checkout' || event.method === 'fetch') {
      if (!this.progressBar) {
        this.progressBar = new SimpleProgressBar({
          format: `{bar} {percentage}% | ${chalk.cyan(event.method)}`,
        })
      }

      if (event.total) {
        this.progressBar?.update({
          total: event.total,
          value: event.progress,
        })
      }

      if (event.progress === event.total) {
        this.progressBar?.stop()
        this.progressBar = null
      }
    }
  }

  private async setupUpstream() {
    this.logStep('配置上游仓库...')

    try {
      const remotes = await this.git.getRemotes(true)
      const upstreamExists = remotes.some(r => r.name === 'upstream')

      if (upstreamExists) {
        logger.info(`已存在 upstream 远程仓库，更新 URL: ${this.options.upstreamRepo}`)
        await this.git.remote(['set-url', 'upstream', this.options.upstreamRepo])
      }
      else {
        logger.info(`添加上游仓库: ${chalk.cyan(this.options.upstreamRepo)}`)
        await this.git.addRemote('upstream', this.options.upstreamRepo)
      }
      logger.success('上游仓库配置完成')
    }
    catch (error) {
      throw new GitError('配置上游仓库失败', error as Error)
    }
  }

  /**
   * 获取上游分支更新
   */
  private async fetchUpstream(): Promise<void> {
    this.logStep(`获取上游分支 ${chalk.cyan(this.options.upstreamBranch)} 更新...`)

    const retryConfig: RetryConfig = {
      maxRetries: this.options.retryConfig?.maxRetries || 3,
      initialDelay: this.options.retryConfig?.initialDelay || 2000,
      backoffFactor: this.options.retryConfig?.backoffFactor || 1.5,
    }

    await withRetry(
      async () => {
        await this.git.fetch('upstream', this.options.upstreamBranch)
        logger.success('上游更新获取完成')
      },
      retryConfig,
      (error) => {
        const message = error.message.toLowerCase()
        return message.includes('network') || message.includes('connect')
      },
    )
  }

  private async createTempBranch(): Promise<void> {
    this.logStep(`创建临时分支: ${chalk.magenta(this.tempBranch)}`)
    try {
      await this.git.checkoutBranch(this.tempBranch, `upstream/${this.options.upstreamBranch}`)
      logger.success(`临时分支 ${chalk.magenta(this.tempBranch)} 创建成功`)
    }
    catch (error) {
      throw new GitError('创建临时分支失败', error as Error)
    }
  }

  private async previewChanges(): Promise<void> {
    this.logStep('预览变更...')

    try {
      // 检查临时目录和目标目录之间的差异
      const diffs: string[] = []

      for (const dir of this.options.syncDirs) {
        const tempPath = path.join(this.tempDir, path.basename(dir))
        const destPath = path.join(process.cwd(), dir)

        try {
          if (await fs.pathExists(tempPath)) {
            if (await fs.pathExists(destPath)) {
              // 比较目录内容
              // 使用 withFileTypes: true 以便区分文件和目录
              const tempEntries = await fs.readdir(tempPath, { recursive: true, withFileTypes: true })
              const destEntries = await fs.readdir(destPath, { recursive: true, withFileTypes: true })

              // 构建文件路径映射，同时记录哪些是目录
              const tempFiles = new Map<string, boolean>() // path -> isDirectory
              const destFiles = new Map<string, boolean>()

              for (const entry of tempEntries) {
                const fullPath = path.join(entry.parentPath, entry.name)
                const relativePath = path.relative(tempPath, fullPath)
                tempFiles.set(relativePath, entry.isDirectory())
              }

              for (const entry of destEntries) {
                const fullPath = path.join(entry.parentPath, entry.name)
                const relativePath = path.relative(destPath, fullPath)
                destFiles.set(relativePath, entry.isDirectory())
              }

              // 查找新增、修改或删除的文件/目录
              const allPaths = new Set([...tempFiles.keys(), ...destFiles.keys()])

              for (const relativePath of allPaths) {
                const tempIsDir = tempFiles.get(relativePath) || false
                const destIsDir = destFiles.get(relativePath) || false
                const tempExists = tempFiles.has(relativePath)
                const destExists = destFiles.has(relativePath)

                const displayPath = path.join(dir, relativePath)

                if (tempExists && !destExists) {
                  diffs.push(`+ ${displayPath}${tempIsDir ? '/' : ''}`)
                }
                else if (!tempExists && destExists) {
                  diffs.push(`- ${displayPath}${destIsDir ? '/' : ''}`)
                }
                else if (tempExists && destExists) {
                  if (tempIsDir !== destIsDir) {
                    // 一个是目录，一个是文件
                    diffs.push(
                      `~ ${displayPath} (类型变更: ${tempIsDir ? '目录' : '文件'} -> ${destIsDir ? '目录' : '文件'})`,
                    )
                  }
                  else if (!tempIsDir && !destIsDir) {
                    // 都是文件，比较内容
                    const tempFilePath = path.join(tempPath, relativePath)
                    const destFilePath = path.join(destPath, relativePath)
                    const tempContent = await fs.readFile(tempFilePath, 'utf8')
                    const destContent = await fs.readFile(destFilePath, 'utf8')

                    if (tempContent !== destContent) {
                      diffs.push(`~ ${displayPath}`)
                    }
                  }
                  // 都是目录且存在，不需要特殊处理
                }
              }
            }
          }
          else {
            // 目标目录不存在，所有文件都是新增
            const tempFiles = await fs.readdir(tempPath, { recursive: true, withFileTypes: false })
            for (const file of tempFiles) {
              // 确保 file 是 string 类型
              const fileName = file.toString()
              diffs.push(`+ ${path.join(dir, fileName)}`)
            }
          }
        }
        catch (error) {
          throw new FsError(`比较目录 ${dir} 时出错`, error as Error)
        }
      }
      if (diffs.length > 0) {
        logger.info(chalk.bold.yellow('将进行以下变更:'))
        diffs.forEach(diff => logger.info(diff))

        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: '是否继续应用这些变更?',
          initial: true,
        })

        if (!confirm) {
          throw new UserCancelError('用户取消了变更应用')
        }
      }
      else {
        logger.info(chalk.green('没有检测到变更'))
      }
    }
    catch (error) {
      if (error instanceof UserCancelError) {
        throw error
      }
      throw new SyncProcessError('预览变更失败', error as Error)
    }
  }

  private async copyDirectories() {
    this.logStep('复制指定目录到临时区域...')

    try {
      await fs.ensureDir(this.tempDir)
      await fs.emptyDir(this.tempDir)

      // 加载忽略模式
      const ignorePatterns = await loadIgnorePatterns(process.cwd())

      // 如果不是强制覆盖模式，则加载哈希值
      let oldHashes: Record<string, string> = {}
      if (!this.forceOverwrite) {
        try {
          oldHashes = await loadHashes(this.hashFile)
        }
        catch (error) {
          logger.warn(`加载哈希文件失败，将使用强制覆盖模式: ${error instanceof Error ? error.message : String(error)}`)
          this.forceOverwrite = true
        }
      }

      // 计算当前文件的哈希值
      const currentHashes: Record<string, string> = {}

      // 设置并行处理限制
      const limit = pLimit(this.concurrencyLimit)
      const copyPromises: Promise<void>[] = []

      let copiedCount = 0
      for (const dir of this.options.syncDirs) {
        const sourcePath = path.join(process.cwd(), dir)

        try {
          if (await fs.pathExists(sourcePath)) {
            logger.info(`-> 处理目录: ${chalk.yellow(dir)}`)
            const destPath = path.join(this.tempDir, path.basename(dir))

            // 使用并行处理复制目录
            copyPromises.push(
              limit(async () => {
                try {
                  const dirHashes = await getDirectoryHashes(sourcePath, ignorePatterns, shouldIgnore)
                  Object.assign(currentHashes, dirHashes)

                  if (this.forceOverwrite) {
                    // 直接覆盖模式
                    await this.copyDirectoryWithIgnore(sourcePath, destPath, ignorePatterns)
                  }
                  else {
                    // 增量复制模式
                    await this.copyDirectoryWithIncremental(
                      sourcePath,
                      destPath,
                      ignorePatterns,
                      oldHashes,
                    )
                  }
                  copiedCount++
                }
                catch (error) {
                  throw new FsError(`复制目录 ${dir} 时出错`, error as Error)
                }
              }),
            )
          }
          else {
            logger.warn(`目录 ${chalk.yellow(dir)} 不存在，跳过`)
          }
        }
        catch (error) {
          throw new FsError(`检查目录 ${dir} 是否存在时出错`, error as Error)
        }
      }

      // 等待所有并行任务完成
      try {
        await Promise.all(copyPromises)
      }
      catch (error) {
        // 这里会捕获到并行任务中的错误
        throw error
      }

      // 如果不是强制覆盖模式，则保存哈希值
      if (!this.forceOverwrite) {
        try {
          await saveHashes(this.hashFile, currentHashes)
        }
        catch (error) {
          logger.warn(`保存哈希文件失败，但同步过程仍将继续: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (copiedCount > 0) {
        logger.success(`已复制 ${copiedCount} 个目录到临时区域`)
      }
      else {
        logger.warn('没有目录被复制')
      }
    }
    catch (error) {
      if (error instanceof FsError) {
        throw error
      }
      throw new SyncProcessError('复制目录失败', error as Error)
    }
  }

  /**
   * 增量复制目录并应用忽略模式
   */
  private async copyDirectoryWithIncremental(
    source: string,
    destination: string,
    ignorePatterns: string[],
    oldHashes: Record<string, string>,
  ): Promise<void> {
    try {
      await fs.ensureDir(destination)

      const entries = await fs.readdir(source, { withFileTypes: true })

      // 设置并行处理限制
      const limit = pLimit(this.concurrencyLimit)
      const copyPromises: Promise<void>[] = []

      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name)
        const destPath = path.join(destination, entry.name)
        const relativePath = path.relative(process.cwd(), sourcePath)

        // 检查是否应该忽略
        if (shouldIgnore(relativePath, ignorePatterns)) {
          continue
        }

        if (entry.isDirectory()) {
          // 递归处理子目录
          copyPromises.push(
            limit(async () => {
              await this.copyDirectoryWithIncremental(
                sourcePath,
                destPath,
                ignorePatterns,
                oldHashes,
              )
            }),
          )
        }
        else {
          // 增量复制文件
          copyPromises.push(
            limit(async () => {
              try {
                const currentHash = await getFileHash(sourcePath)
                const oldHash = oldHashes[relativePath]

                // 只有当文件不存在或哈希值不同时才复制
                if (!(await fs.pathExists(destPath)) || currentHash !== oldHash) {
                  await fs.copyFile(sourcePath, destPath)
                  if (oldHash) {
                    logger.info(`  更新文件: ${relativePath}`)
                  }
                  else {
                    logger.info(`  新增文件: ${relativePath}`)
                  }
                }
              }
              catch (error) {
                logger.error(`处理文件 ${relativePath} 时出错:`, error as Error)
                throw error // 重新抛出错误，确保上层能捕获
              }
            }),
          )
        }
      }

      // 等待所有并行任务完成
      await Promise.all(copyPromises)
    }
    catch (error) {
      logger.error(`复制目录 ${source} 到 ${destination} 时出错:`, error as Error)
      throw error // 重新抛出错误，确保上层能捕获
    }
  }

  /**
   * 复制目录并应用忽略模式 (保留旧方法，确保兼容性)
   */
  private async copyDirectoryWithIgnore(
    source: string,
    destination: string,
    ignorePatterns: string[],
  ): Promise<void> {
    return this.copyDirectoryWithIncremental(source, destination, ignorePatterns, {})
  }

  private async applyChanges(): Promise<void> {
    this.logStep('应用更新到公司仓库...')

    try {
      // 切换回公司分支
      try {
        await this.git.checkout(this.options.companyBranch)
      }
      catch (error) {
        throw new GitError('切换回公司分支失败', error as Error)
      }

      let updatedCount = 0
      for (const dir of this.options.syncDirs) {
        const sourcePath = path.join(this.tempDir, path.basename(dir))

        try {
          if (await fs.pathExists(sourcePath)) {
            logger.info(`-> 更新目录: ${chalk.yellow(dir)}`)

            // 删除原目录
            const destPath = path.join(process.cwd(), dir)
            if (await fs.pathExists(destPath)) {
              try {
                await fs.remove(destPath)
              }
              catch (error) {
                throw new FsError(`删除目录 ${destPath} 失败`, error as Error)
              }
            }

            // 复制新内容
            try {
              await fs.copy(sourcePath, destPath)
            }
            catch (error) {
              throw new FsError(`复制目录 ${sourcePath} 到 ${destPath} 失败`, error as Error)
            }

            // 添加变更到 Git
            try {
              await this.git.add(dir)
            }
            catch (error) {
              throw new GitError(`添加目录 ${dir} 到 Git 失败`, error as Error)
            }

            updatedCount++
          }
        }
        catch (error) {
          if (error instanceof FsError || error instanceof GitError) {
            throw error
          }
          throw new SyncProcessError(`处理目录 ${dir} 时出错`, error as Error)
        }
      }

      // 清理临时目录
      try {
        await fs.remove(this.tempDir)
      }
      catch (error) {
        logger.warn(`清理临时目录失败，但同步过程仍将继续: ${error}`)
      }

      if (updatedCount > 0) {
        logger.success(`已更新 ${updatedCount} 个目录`)
      }
      else {
        logger.warn('没有目录被更新')
      }
    }
    catch (error) {
      if (error instanceof GitError || error instanceof FsError) {
        throw error
      }
      throw new SyncProcessError('应用更新失败', error as Error)
    }
  }

  private async commitChanges(): Promise<boolean> {
    this.logStep('检查变更并提交...')

    try {
      const status = await this.git.status()

      if (status.files.length === 0) {
        logger.success('没有检测到变更，无需提交')
        return false
      }

      logger.info(`提交变更: ${chalk.green(this.options.commitMessage)}`)
      await this.git.commit(this.options.commitMessage)
      logger.success('变更已提交')
      return true
    }
    catch (error) {
      throw new GitError('提交变更失败', error as Error)
    }
  }

  private async pushChanges(): Promise<void> {
    if (!this.options.autoPush) {
      logger.info('变更已提交但未推送（使用自动推送选项启用）')
      return
    }

    this.logStep(`推送变更到公司分支 ${chalk.cyan(this.options.companyBranch)}`)

    const retryConfig: RetryConfig = {
      maxRetries: this.options.retryConfig?.maxRetries || 3,
      initialDelay: this.options.retryConfig?.initialDelay || 2000,
      backoffFactor: this.options.retryConfig?.backoffFactor || 1.5,
    }

    await withRetry(
      async () => {
        await this.git.push('origin', this.options.companyBranch)
        logger.success('推送完成')
      },
      retryConfig,
      (error) => {
        const message = error.message.toLowerCase()
        return message.includes('network') || message.includes('connect')
      },
    )
  }

  private async cleanup(): Promise<void> {
    this.logStep('清理临时资源...')

    // 清理临时分支
    if (this.tempBranch) {
      try {
        await this.git.checkout(this.options.companyBranch)
        try {
          await this.git.deleteLocalBranch(this.tempBranch)
          logger.success('临时分支已删除')
        }
        catch (error) {
          throw new GitError('删除临时分支失败', error as Error)
        }
      }
      catch (error) {
        if (error instanceof GitError) {
          logger.warn(`${error.message}: ${error.originalError}`)
        }
        else {
          logger.warn(`清理临时资源时出错: ${error}`)
        }
      }
    }

    // 清理临时目录
    try {
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir)
        logger.success('临时目录已删除')
      }
    }
    catch (error) {
      logger.warn(`清理临时目录失败: ${error}`)
    }
  }

  public async run(): Promise<void> {
    try {
      logger.info(chalk.bold.blue('╔════════════════════════════════════════════╗'))
      logger.info(chalk.bold.blue('║      仓库目录同步工具                      ║'))
      logger.info(chalk.bold.blue('╚════════════════════════════════════════════╝'))

      // 显示配置摘要
      displaySummary(this.options)

      // 如果是dry-run模式，显示提示
      if (this.options.dryRun) {
        logger.warn(chalk.yellow('⚠️ 运行在dry-run模式下，不会实际修改任何文件'))
      }

      // 验证是否在Git仓库中
      try {
        await this.git.status()
      }
      catch (error) {
        throw new GitError('未在Git仓库中运行。请在Git仓库根目录执行此命令。', error as Error)
      }

      // 执行同步流程
      await this.setupUpstream()
      await this.fetchUpstream()
      await this.createTempBranch()
      await this.copyDirectories()
      await this.previewChanges()

      if (!this.options.dryRun) {
        await this.applyChanges()
        const hasChanges = await this.commitChanges()

        if (hasChanges) {
          await this.pushChanges()
        }
      }
      else {
        logger.info(chalk.yellow('⚠️ dry-run模式: 跳过应用变更、提交和推送操作'))
      }

      logger.success(chalk.bold.green('\n✅ 同步完成!'))
      logger.info(chalk.green('='.repeat(50)))
    }
    catch (error) {
      handleError(error as Error)
    }
    finally {
      // 无论成功失败，都清理临时资源
      try {
        if (!this.options.dryRun) {
          await this.cleanup()
        }
        else {
          logger.info(chalk.yellow('⚠️ dry-run模式: 跳过清理临时资源'))
        }
      }
      catch (cleanupError) {
        logger.error(`清理临时资源时出错: ${cleanupError}`)
      }
    }
  }
}

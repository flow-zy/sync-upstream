import type { SimpleGit, SimpleGitProgressEvent } from 'simple-git'
import type { RetryConfig } from './retry'
import type { SyncOptions } from './types'
import path from 'node:path'
import fs from 'fs-extra'
import pLimit from 'p-limit'
import { blue, bold, cyan, green, magenta, yellow } from 'picocolors'
import prompts from 'prompts'

import simpleGit from 'simple-git'
import { ConflictResolutionStrategy, ConflictResolver } from './conflict'
import { FsError, GitError, handleError, SyncProcessError, UserCancelError } from './errors'
import { getDirectoryHashes, getFileHash, loadHashes, saveHashes } from './hash'
import { loadIgnorePatterns, shouldIgnore } from './ignore'
import { logger, LogLevel } from './logger'

import { displaySummary } from './prompts'
import { withRetry } from './retry'
import { AuthType } from './types'
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
    const filledLength = Math.min(Math.round((barLength * this.value) / this.total), barLength)
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
    console.log(
      `\r${this.format.replace('{bar}', bar).replace('{percentage}', percentage.toString())}`,
    )
  }

  stop() {
    console.log('\n')
  }
}

export class UpstreamSyncer {
  private git: SimpleGit
  private tempDir: string
  private tempBranch: string
  private progressBar: SimpleProgressBar | null = null
  private stepCounter: number = 1
  private hashFile: string
  private concurrencyLimit: number
  private forceOverwrite: boolean
  private conflictResolver: ConflictResolver
  private tempResourcesCreated: boolean = false

  constructor(private options: SyncOptions) {
    // 构建 Git 配置选项
    const gitOptions: any = {
      progress: this.handleProgress.bind(this),
      config: [
        `core.quiet=${options.silent ? 'true' : 'false'}`,
      ],
    }

    // 处理认证配置
    if (this.options.authConfig) {
      const { authConfig } = this.options
      switch (authConfig.type) {
        case AuthType.SSH:
          // SSH 认证配置
          if (authConfig.privateKeyPath) {
            gitOptions.config.push(`core.sshCommand=ssh -i ${authConfig.privateKeyPath}`)
            if (authConfig.passphrase) {
              // 注意：这里不存储密码，而是提示用户输入
              logger.info('使用带密码的 SSH 密钥，需要时将提示输入密码')
            }
          }
          break
        case AuthType.USER_PASS:
          // 用户名和密码认证
          if (authConfig.username && authConfig.password) {
            // 构建带认证信息的 URL
            const repoUrl = new URL(this.options.upstreamRepo)
            repoUrl.username = encodeURIComponent(authConfig.username)
            repoUrl.password = encodeURIComponent(authConfig.password)
            // 注意：这里只是记录，实际修改会在 setupUpstream 方法中进行
            logger.info('使用用户名和密码认证')
          }
          break
        case AuthType.PAT:
          // 个人访问令牌认证
          if (authConfig.token) {
            // 构建带认证信息的 URL
            const repoUrl = new URL(this.options.upstreamRepo)
            repoUrl.username = 'git' // 对于 PAT，用户名可以是任意值，但通常使用 'git'
            repoUrl.password = encodeURIComponent(authConfig.token)
            // 注意：这里只是记录，实际修改会在 setupUpstream 方法中进行
            logger.info('使用个人访问令牌认证')
          }
          break
        default:
          logger.warn(`未知的认证类型: ${authConfig.type}`)
      }
    }

    this.git = simpleGit(gitOptions)
    this.tempDir = path.join(process.cwd(), '.sync-temp')
    this.tempBranch = `temp-sync-${Date.now()}`
    this.hashFile = path.join(process.cwd(), '.sync-hashes.json')
    // 从选项中获取强制覆盖标志，如果没有提供则默认为true
    this.forceOverwrite = options.forceOverwrite !== undefined ? options.forceOverwrite : true

    // 从选项中获取并发限制，如果没有提供则默认为5
    this.concurrencyLimit = options.concurrencyLimit !== undefined ? options.concurrencyLimit : 5

    // 初始化冲突解决器
    this.conflictResolver = new ConflictResolver(
      options.conflictResolutionConfig || {
        defaultStrategy: ConflictResolutionStrategy.KEEP_TARGET,
      },
    )

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
          format: `{bar} {percentage}% | ${cyan(event.method)}`,
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
      let repoUrl = this.options.upstreamRepo

      // 验证仓库URL格式
      try {
        // 对于SSH URL，我们需要特殊处理，因为URL构造函数不直接支持ssh://格式
        if (repoUrl.startsWith('git@') || repoUrl.match(/^ssh:\/\//)) {
          logger.info(`验证 SSH 仓库 URL: ${cyan(repoUrl)}`)
        }
        else {
          // 尝试创建URL对象来验证HTTP/HTTPS URL格式
          new URL(repoUrl)
          logger.info(`验证仓库 URL: ${cyan(repoUrl)}`)
        }
      }
      catch (error) {
        throw new GitError('无效的仓库URL格式', error as Error)
      }

      // 处理认证配置
      if (this.options.authConfig) {
        const { authConfig } = this.options
        if (authConfig.type === AuthType.USER_PASS && authConfig.username && authConfig.password) {
          // 构建带用户名和密码的 URL
          const url = new URL(repoUrl)
          url.username = encodeURIComponent(authConfig.username)
          url.password = encodeURIComponent(authConfig.password)
          repoUrl = url.toString()
        }
        else if (authConfig.type === AuthType.PAT && authConfig.token) {
          // 构建带个人访问令牌的 URL
          const url = new URL(repoUrl)
          url.username = 'git' // 对于 PAT，用户名可以是任意值，但通常使用 'git'
          url.password = encodeURIComponent(authConfig.token)
          repoUrl = url.toString()
        }
        // SSH 认证已经在构造函数中处理
      }

      const remotes = await this.git.getRemotes(true)
      const upstreamExists = remotes.some(r => r.name === 'upstream')

      if (upstreamExists) {
        logger.info(`已存在 upstream 远程仓库，更新 URL: ${this.options.upstreamRepo}`)
        await this.git.remote(['set-url', 'upstream', repoUrl])
      }
      else {
        logger.info(`添加上游仓库: ${cyan(this.options.upstreamRepo)}`)
        await this.git.addRemote('upstream', repoUrl)
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
    this.logStep(`获取上游分支 ${cyan(this.options.upstreamBranch)} 更新...`)

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
    this.logStep(`创建临时分支: ${magenta(this.tempBranch)}`)
    try {
      await this.git.checkoutBranch(this.tempBranch, `upstream/${this.options.upstreamBranch}`)
      logger.success(`临时分支 ${magenta(this.tempBranch)} 创建成功`)
      this.tempResourcesCreated = true
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

      // 设置并行处理限制
      const limit = pLimit(this.concurrencyLimit)
      const previewPromises: Promise<void>[] = []

      for (const dir of this.options.syncDirs) {
        previewPromises.push(
          limit(async () => {
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

                  // 为路径比较设置并行处理
                  const pathLimit = pLimit(this.concurrencyLimit)
                  const pathPromises: Promise<void>[] = []

                  for (const relativePath of allPaths) {
                    pathPromises.push(
                      pathLimit(async () => {
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
                      }),
                    )
                  }

                  // 等待所有路径比较完成
                  await Promise.all(pathPromises)
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
          }),
        )
      }

      // 等待所有目录预览完成
      await Promise.all(previewPromises)

      if (diffs.length > 0) {
        logger.info(bold(yellow('将进行以下变更:')))
        diffs.forEach(diff => logger.info(diff))

        // 非交互式模式下跳过确认
        if (this.options.nonInteractive !== true) {
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
      }
      else {
        logger.info(green('没有检测到变更'))
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
      this.tempResourcesCreated = true

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
            logger.info(`-> 处理目录: ${yellow(dir)}`)
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
            logger.warn(`目录 ${yellow(dir)} 不存在，跳过`)
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
          // 检查文件类型是否应该被包含
          if (!this.shouldIncludeFile(sourcePath)) {
            logger.debug(`  跳过文件(类型不匹配): ${relativePath}`)
            continue
          }

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
   * 检查文件是否应该包含在同步中
   */
  private shouldIncludeFile(filePath: string): boolean {
    // 如果没有指定包含的文件类型，则包含所有文件
    if (!this.options.includeFileTypes || this.options.includeFileTypes.length === 0) {
      return true
    }

    // 获取文件扩展名
    const ext = path.extname(filePath).toLowerCase()
    return this.options.includeFileTypes.includes(ext)
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
            logger.info(`-> 更新目录: ${yellow(dir)}`)

            const destPath = path.join(process.cwd(), dir)

            // 检测冲突
            if (await fs.pathExists(destPath)) {
              logger.info(`检测 ${dir} 目录中的冲突...`)
              const ignorePatterns = await loadIgnorePatterns(process.cwd())
              const conflicts = await this.conflictResolver.detectDirectoryConflicts(
                sourcePath,
                destPath,
                ignorePatterns,
              )

              // 解决冲突
              if (conflicts.length > 0) {
                await this.conflictResolver.resolveConflicts(conflicts)
              }
            }

            // 应用变更（冲突已解决，现在可以安全地应用变更）
            try {
              await fs.ensureDir(destPath)

              // 对于冲突已解决的文件，我们应该保留本地修改
              // 只复制不存在的文件或目录
              await fs.copy(sourcePath, destPath, {
                overwrite: false, // 不覆盖已存在的文件
                errorOnExist: false, // 已存在的文件不会报错
              })
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

      logger.info(`提交变更: ${green(this.options.commitMessage)}`)
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

    this.logStep(`推送变更到公司分支 ${cyan(this.options.companyBranch)}`)

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
    // 只有当临时资源已创建时才清理
    if (!this.tempResourcesCreated) {
      logger.info('未创建临时资源，跳过清理步骤')
      return
    }

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
      logger.info(bold(blue('╔════════════════════════════════════════════╗')))
      logger.info(bold(blue('║      仓库目录同步工具                      ║')))
      logger.info(bold(blue('╚════════════════════════════════════════════╝')))

      // 显示配置摘要
      displaySummary(this.options)

      // 如果是dry-run模式，显示提示
      if (this.options.dryRun) {
        logger.warn(yellow('⚠️ 运行在dry-run模式下，不会实际修改任何文件'))
      }

      // 如果是previewOnly模式，显示提示
      if (this.options.previewOnly) {
        logger.warn(yellow('⚠️ 运行在预览模式下，只会显示变更，不会实际修改任何文件'))
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

      // 如果是previewOnly模式，在预览后结束
      if (this.options.previewOnly) {
        logger.info(yellow('⚠️ 预览模式: 已完成变更预览，不进行实际修改'))
        logger.success(bold(green(`\n✅ 同步预览完成!`)))
        return
      }

      if (!this.options.dryRun) {
        await this.applyChanges()
        const hasChanges = await this.commitChanges()

        if (hasChanges) {
          await this.pushChanges()
        }
      }
      else {
        logger.info(yellow('⚠️ dry-run模式: 跳过应用变更、提交和推送操作'))
      }

      logger.success(bold(green('\n✅ 同步完成!')))
      logger.info(green('='.repeat(50)))
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
          logger.info(yellow('⚠️ dry-run模式: 跳过清理临时资源'))
        }
      }
      catch (cleanupError) {
        logger.error(`清理临时资源时出错: ${cleanupError}`)
      }
    }
  }
}

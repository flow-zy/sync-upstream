import type { SimpleGit, SimpleGitProgressEvent } from 'simple-git'
import type { SyncOptions } from './types'
import path from 'node:path'
import chalk from 'chalk'
import consola from 'consola'
import fs from 'fs-extra'
import pLimit from 'p-limit'
import prompts from 'prompts'
import simpleGit from 'simple-git'
import { getDirectoryHashes, getFileHash, loadHashes, saveHashes } from './hash'
import { loadIgnorePatterns, shouldIgnore } from './ignore'
import { displaySummary } from './prompts'

export class UpstreamSyncer {
  private git: SimpleGit
  private tempDir: string
  private tempBranch: string
  private progressBar: consola.ProgressBar | null = null
  private stepCounter: number = 1
  private hashFile: string
  private concurrencyLimit = 5 // 并行处理的最大并发数

  constructor(private options: SyncOptions) {
    this.git = simpleGit({
      progress: this.handleProgress.bind(this),
    })
    this.tempDir = path.join(process.cwd(), '.sync-temp')
    this.tempBranch = `temp-sync-${Date.now()}`
    this.hashFile = path.join(process.cwd(), '.sync-hashes.json')
  }

  private logStep(message: string) {
    console.log(chalk.bold.magenta(`\n${this.stepCounter++}. ${message}`))
  }

  private handleProgress(event: SimpleGitProgressEvent) {
    if (event.method === 'checkout' || event.method === 'fetch') {
      if (!this.progressBar) {
        this.progressBar = consola.progress({
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
        consola.info(`已存在 upstream 远程仓库，更新 URL: ${this.options.upstreamRepo}`)
        await this.git.remote(['set-url', 'upstream', this.options.upstreamRepo])
      }
      else {
        consola.info(`添加上游仓库: ${chalk.cyan(this.options.upstreamRepo)}`)
        await this.git.addRemote('upstream', this.options.upstreamRepo)
      }
      consola.success('上游仓库配置完成')
    }
    catch (error) {
      consola.error('配置上游仓库失败:', error)
      throw error
    }
  }

  private async fetchUpstream() {
    this.logStep(`获取上游分支 ${chalk.cyan(this.options.upstreamBranch)} 更新...`)

    try {
      await this.git.fetch('upstream', this.options.upstreamBranch)
      consola.success('上游更新获取完成')
    }
    catch (error) {
      consola.error('获取上游更新失败:', error)
      throw error
    }
  }

  private async createTempBranch() {
    this.logStep(`创建临时分支: ${chalk.magenta(this.tempBranch)}`)
    try {
      await this.git.checkoutBranch(
        this.tempBranch,
        `upstream/${this.options.upstreamBranch}`,
      )
      consola.success(`临时分支 ${chalk.magenta(this.tempBranch)} 创建成功`)
    }
    catch (error) {
      consola.error('创建临时分支失败:', error)
      throw error
    }
  }

  private async previewChanges() {
    this.logStep('预览变更...')

    try {
      // 检查临时目录和目标目录之间的差异
      const diffs: string[] = []

      for (const dir of this.options.syncDirs) {
        const tempPath = path.join(this.tempDir, path.basename(dir))
        const destPath = path.join(process.cwd(), dir)

        if (await fs.pathExists(tempPath)) {
          if (await fs.pathExists(destPath)) {
            // 比较目录内容
            const tempFiles = await fs.readdir(tempPath, { recursive: true })
            const destFiles = await fs.readdir(destPath, { recursive: true })

            // 查找新增、修改或删除的文件
            const allFiles = new Set([...tempFiles, ...destFiles])

            for (const file of allFiles) {
              const tempFilePath = path.join(tempPath, file)
              const destFilePath = path.join(destPath, file)

              const tempExists = await fs.pathExists(tempFilePath)
              const destExists = await fs.pathExists(destFilePath)

              if (tempExists && !destExists) {
                diffs.push(`+ ${path.join(dir, file)}`)
              }
              else if (!tempExists && destExists) {
                diffs.push(`- ${path.join(dir, file)}`)
              }
              else if (tempExists && destExists) {
                const tempContent = await fs.readFile(tempFilePath, 'utf8')
                const destContent = await fs.readFile(destFilePath, 'utf8')

                if (tempContent !== destContent) {
                  diffs.push(`~ ${path.join(dir, file)}`)
                }
              }
            }
          }
          else {
            // 目标目录不存在，所有文件都是新增
            const tempFiles = await fs.readdir(tempPath, { recursive: true })
            for (const file of tempFiles) {
              diffs.push(`+ ${path.join(dir, file)}`)
            }
          }
        }
      }

      if (diffs.length > 0) {
        console.log(chalk.bold.yellow('将进行以下变更:'))
        diffs.forEach(diff => console.log(diff))

        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: '是否继续应用这些变更?',
          initial: true,
        })

        if (!confirm) {
          throw new Error('用户取消了变更应用')
        }
      }
      else {
        console.log(chalk.green('没有检测到变更'))
      }
    }
    catch (error) {
      consola.error('预览变更失败:', error)
      throw error
    }
  }

  private async copyDirectories() {
    this.logStep('复制指定目录到临时区域...')

    try {
      await fs.ensureDir(this.tempDir)
      await fs.emptyDir(this.tempDir)

      // 加载忽略模式
      const ignorePatterns = await loadIgnorePatterns(process.cwd())

      // 加载上次同步的哈希值
      const oldHashes = await loadHashes(this.hashFile)

      // 计算当前文件的哈希值
      const currentHashes: Record<string, string> = {}

      // 设置并行处理限制
      const limit = pLimit(this.concurrencyLimit)
      const copyPromises: Promise<void>[] = []

      let copiedCount = 0
      for (const dir of this.options.syncDirs) {
        const sourcePath = path.join(process.cwd(), dir)

        if (await fs.pathExists(sourcePath)) {
          consola.info(`-> 处理目录: ${chalk.yellow(dir)}`)
          const destPath = path.join(this.tempDir, path.basename(dir))

          // 使用并行处理复制目录
          copyPromises.push(limit(async () => {
            const dirHashes = await getDirectoryHashes(sourcePath, ignorePatterns, shouldIgnore)
            Object.assign(currentHashes, dirHashes)

            // 增量复制
            await this.copyDirectoryWithIncremental(
              sourcePath,
              destPath,
              ignorePatterns,
              oldHashes,
            )
            copiedCount++
          }))
        }
        else {
          consola.warn(`目录 ${chalk.yellow(dir)} 不存在，跳过`)
        }
      }

      // 等待所有并行任务完成
      await Promise.all(copyPromises)

      // 保存当前哈希值，用于下次增量同步
      await saveHashes(this.hashFile, currentHashes)

      if (copiedCount > 0) {
        consola.success(`已复制 ${copiedCount} 个目录到临时区域`)
      }
      else {
        consola.warn('没有目录被复制')
      }
    }
    catch (error) {
      consola.error('复制目录失败:', error)
      throw error
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
        copyPromises.push(limit(async () => {
          await this.copyDirectoryWithIncremental(
            sourcePath,
            destPath,
            ignorePatterns,
            oldHashes,
          )
        }))
      }
      else {
        // 增量复制文件
        copyPromises.push(limit(async () => {
          const currentHash = await getFileHash(sourcePath)
          const oldHash = oldHashes[relativePath]

          // 只有当文件不存在或哈希值不同时才复制
          if (!await fs.pathExists(destPath) || currentHash !== oldHash) {
            await fs.copyFile(sourcePath, destPath)
            if (oldHash) {
              consola.info(`  更新文件: ${relativePath}`)
            }
            else {
              consola.info(`  新增文件: ${relativePath}`)
            }
          }
        }))
      }
    }

    // 等待所有并行任务完成
    await Promise.all(copyPromises)
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

  private async applyChanges() {
    this.logStep('应用更新到公司仓库...')

    try {
      // 切换回公司分支
      await this.git.checkout(this.options.companyBranch)

      let updatedCount = 0
      for (const dir of this.options.syncDirs) {
        const sourcePath = path.join(this.tempDir, path.basename(dir))

        if (await fs.pathExists(sourcePath)) {
          consola.info(`-> 更新目录: ${chalk.yellow(dir)}`)

          // 删除原目录
          const destPath = path.join(process.cwd(), dir)
          if (await fs.pathExists(destPath)) {
            await fs.remove(destPath)
          }

          // 复制新内容
          await fs.copy(sourcePath, destPath)

          // 添加变更到 Git
          await this.git.add(dir)
          updatedCount++
        }
      }

      // 清理临时目录
      await fs.remove(this.tempDir)

      if (updatedCount > 0) {
        consola.success(`已更新 ${updatedCount} 个目录`)
      }
      else {
        consola.warn('没有目录被更新')
      }
    }
    catch (error) {
      consola.error('应用更新失败:', error)
      throw error
    }
  }

  private async commitChanges() {
    this.logStep('检查变更并提交...')

    try {
      const status = await this.git.status()

      if (status.files.length === 0) {
        consola.success('没有检测到变更，无需提交')
        return false
      }

      consola.info(`提交变更: ${chalk.green(this.options.commitMessage)}`)
      await this.git.commit(this.options.commitMessage)
      consola.success('变更已提交')
      return true
    }
    catch (error) {
      consola.error('提交变更失败:', error)
      throw error
    }
  }

  private async pushChanges() {
    if (!this.options.autoPush) {
      consola.info('变更已提交但未推送（使用自动推送选项启用）')
      return
    }

    this.logStep(`推送变更到公司分支 ${chalk.cyan(this.options.companyBranch)}`)

    try {
      await this.git.push('origin', this.options.companyBranch)
      consola.success('推送完成')
    }
    catch (error) {
      consola.error('推送变更失败:', error)
      throw error
    }
  }

  private async cleanup() {
    this.logStep('清理临时资源...')

    try {
      await this.git.checkout(this.options.companyBranch)
      await this.git.deleteLocalBranch(this.tempBranch)
      consola.success('清理完成')
    }
    catch (error) {
      consola.warn('清理临时资源时出错:', error)
    }
  }

  public async run() {
    try {
      console.log(chalk.bold.blue('╔════════════════════════════════════════════╗'))
      console.log(chalk.bold.blue('║      开源仓库目录同步工具          ║'))
      console.log(chalk.bold.blue('╚════════════════════════════════════════════╝'))

      // 显示配置摘要
      displaySummary(this.options)

      // 验证当前目录是 Git 仓库
      if (!(await this.git.checkIsRepo())) {
        throw new Error('当前目录不是 Git 仓库')
      }

      // 执行同步流程
      await this.setupUpstream()
      await this.fetchUpstream()
      await this.createTempBranch()
      await this.copyDirectories()
      await this.previewChanges()
      await this.applyChanges()
      const hasChanges = await this.commitChanges()

      if (hasChanges) {
        await this.pushChanges()
      }

      await this.cleanup()

      console.log(chalk.bold.green('\n✅ 同步完成!'))
      console.log(chalk.green('='.repeat(50)))
    }
    catch (error: any) {
      console.log(chalk.bold.red('\n❌ 同步失败:'))
      console.log(chalk.red(error.message))
      console.log(chalk.red('='.repeat(50)))

      try {
        await this.cleanup()
      }
      catch (cleanupError) {
        console.error('清理过程中出错:', cleanupError)
      }

      process.exit(1)
    }
  }
}

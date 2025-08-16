import type { SimpleGit, SimpleGitProgressEvent } from 'simple-git'
import type { RetryConfig } from './retry'
import type { SyncOptions } from './types'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import fs from 'fs-extra'
import pLimit from 'p-limit'
import { blue, bold, cyan, green, magenta, yellow } from 'picocolors'
import prompts from 'prompts'
import simpleGit from 'simple-git'

import { getFromCache, initializeCache, writeToCache } from './cache'
import { ConflictResolutionStrategy, ConflictResolver } from './conflict'
import { FsError, GitError, handleError, SyncProcessError, UserCancelError } from './errors'
import { GrayReleaseManager } from './grayRelease'
import { getDirectoryHashes, getFileHash, loadHashes, saveHashes } from './hash'
import { loadIgnorePatterns, shouldIgnore } from './ignore'
import { isLargeFile } from './lfs'
import { logger, LogLevel } from './logger'

import { displaySummary } from './prompts'
import { withRetry } from './retry'
import { AuthType, BranchStrategy } from './types'

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
  private cpuCount: number
  private adaptiveConcurrency: boolean = true
  private grayReleaseManager: GrayReleaseManager
  private originalBranch: string = ''
  private strategyBranch: string = ''
  private operationTimes: Record<string, { start: number, end?: number }> = {}

  constructor(private options: SyncOptions) {
    this.grayReleaseManager = new GrayReleaseManager(options)
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

    // 获取CPU核心数
    this.cpuCount = os.cpus().length

    // 从选项中获取并发限制，如果没有提供则根据CPU核心数动态设置
    this.concurrencyLimit = options.concurrencyLimit !== undefined
      ? options.concurrencyLimit
      : Math.max(2, Math.min(16, this.cpuCount * 2))

    // 自适应并发标志
    this.adaptiveConcurrency = options.adaptiveConcurrency !== undefined
      ? options.adaptiveConcurrency
      : true

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
    const stepName = `step_${this.stepCounter}`
    this.operationTimes[stepName] = { start: performance.now() }
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
      this.operationTimes.step_1.end = performance.now()
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
        this.operationTimes.step_2.end = performance.now()
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
      this.operationTimes.step_3.end = performance.now()
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

      // 自适应调整并行限制
      const limit = pLimit(this.adaptiveConcurrency
        ? Math.max(2, Math.min(16, Math.floor(this.cpuCount * 1.5)))
        : this.concurrencyLimit)
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
        this.operationTimes.step_4.end = performance.now()
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
        this.operationTimes.step_5.end = performance.now()
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

      // 初始化缓存
      await initializeCache()

      const entries = await fs.readdir(source, { withFileTypes: true })

      // 自适应调整并行限制
      const getDynamicLimit = (taskType: 'dir' | 'file') => {
        if (!this.adaptiveConcurrency) {
          return taskType === 'dir'
            ? Math.max(1, Math.floor(this.concurrencyLimit / 2))
            : this.concurrencyLimit
        }

        // 根据CPU核心数和任务类型动态调整
        const baseLimit = taskType === 'dir'
          ? Math.max(1, Math.floor(this.cpuCount * 1.5))
          : Math.max(2, this.cpuCount * 2)

        // 根据系统负载动态调整（简单实现）
        const loadAvg = os.loadavg()[0] // 1分钟负载平均值
        const cpuLoad = Math.min(1, loadAvg / this.cpuCount)
        const adjustedLimit = Math.max(1, Math.floor(baseLimit * (1 - cpuLoad * 0.7)))

        return adjustedLimit
      }

      // 为目录和文件分别设置不同的并行限制
      const dirLimit = pLimit(getDynamicLimit('dir'))
      const fileLimit = pLimit(getDynamicLimit('file'))
      const copyPromises: Promise<void>[] = []

      // 优先处理目录，这样可以更快地发现需要忽略的子目录
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
            dirLimit(async () => {
              await this.copyDirectoryWithIncremental(
                sourcePath,
                destPath,
                ignorePatterns,
                oldHashes,
              )
            }),
          )
        }
      }

      // 等待目录处理完成
      await Promise.all(copyPromises)

      // 重置promise数组，处理文件
      const filePromises: Promise<void>[] = []

      for (const entry of entries) {
        if (entry.isDirectory())
          continue

        const sourcePath = path.join(source, entry.name)
        const destPath = path.join(destination, entry.name)
        const relativePath = path.relative(process.cwd(), sourcePath)

        // 检查是否应该忽略
        if (shouldIgnore(relativePath, ignorePatterns)) {
          continue
        }

        // 检查文件类型是否应该被包含
        if (!this.shouldIncludeFile(sourcePath)) {
          logger.debug(`  跳过文件(类型不匹配): ${relativePath}`)
          continue
        }

        // 增量复制文件
        filePromises.push(
          fileLimit(async () => {
            try {
              // 使用缓存的哈希值计算
              const cacheKey = `hash:${sourcePath}`
              let currentHash: string | null = (await getFromCache(cacheKey))?.toString() ?? null

              if (!currentHash) {
                const hashBuffer = Buffer.from(await getFileHash(sourcePath))
                currentHash = hashBuffer.toString()
                await writeToCache(cacheKey, hashBuffer)
              }

              const oldHash = oldHashes[relativePath]

              // 只有当文件不存在或哈希值不同时才复制
              if (!(await fs.pathExists(destPath)) || currentHash !== oldHash) {
                // 检查是否为大文件
                if (await isLargeFile(sourcePath)) {
                  logger.info(`  处理大文件: ${relativePath}`)
                  // 使用流式处理大文件
                  await fs.createReadStream(sourcePath)
                    .pipe(fs.createWriteStream(destPath))
                    .on('error', (err) => {
                      throw new FsError(`复制大文件 ${sourcePath} 失败`, err)
                    })
                    .on('finish', () => {
                      logger.debug(`  大文件 ${relativePath} 复制完成`)
                    })
                }
                else {
                  // 普通文件复制
                  await fs.copyFile(sourcePath, destPath)
                }
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

      // 等待所有文件处理完成
      await Promise.all(filePromises)
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
    // 如果启用了灰度发布
    if (this.grayReleaseManager.isEnabled()) {
      this.logStep('执行灰度发布...')
      await this.grayReleaseManager.executeCanaryRelease()
      logger.info('灰度发布已完成。如需全量发布，请运行 sync-upstream --full-release')
      return
    }

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
        this.operationTimes.step_6.end = performance.now()
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
      this.operationTimes.step_7.end = performance.now()
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
        this.operationTimes.step_8.end = performance.now()
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
        // 先切换到一个不是临时分支的分支
        const targetBranch = this.originalBranch || this.options.companyBranch
        await this.git.checkout(targetBranch)
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

    // 清理分支策略相关资源
    await this.cleanupBranchStrategy()

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

    // 移除上游仓库
    try {
      const remotes = await this.git.getRemotes(true)
      const upstreamExists = remotes.some(r => r.name === 'upstream')

      if (upstreamExists) {
        await this.git.removeRemote('upstream')
        logger.success('上游仓库已移除')
      }
      else {
        logger.info('没有找到上游仓库，跳过移除步骤')
      }
    }
    catch (error) {
      logger.warn(`移除上游仓库失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    // 清理临时目录
    try {
      await fs.remove(this.tempDir)
    }
    catch (error) {
      logger.warn(`清理临时目录失败: ${error}`)
    }
  }

  /**
   * 执行全量发布
   */
  async executeFullRelease(): Promise<void> {
    this.logStep('执行全量发布...')
    await this.grayReleaseManager.executeFullRelease()
    logger.success('全量发布完成')
  }

  /**
   * 执行回滚操作
   */
  async rollback(): Promise<void> {
    this.logStep('执行回滚操作...')
    await this.grayReleaseManager.rollback()
    logger.success('回滚操作完成')
  }

  /**
   * 设置分支策略
   */
  private async setupBranchStrategy(): Promise<void> {
    if (!this.options.branchStrategyConfig?.enable) {
      return
    }

    const { branchStrategyConfig } = this.options
    this.logStep(`设置分支策略: ${branchStrategyConfig.strategy}`)

    try {
      // 保存当前分支
      this.originalBranch = await this.git.revparse(['--abbrev-ref', 'HEAD'])
      logger.info(`当前分支: ${this.originalBranch}`)

      // 生成策略分支名称
      this.strategyBranch = this.generateBranchName(branchStrategyConfig)
      logger.info(`生成策略分支: ${this.strategyBranch}`)

      // 检查分支是否已存在
      const branches = await this.git.branch(['--list', this.strategyBranch])
      if (branches.all.includes(this.strategyBranch)) {
        logger.info(`分支 ${this.strategyBranch} 已存在，切换到该分支`)
        await this.git.checkout(this.strategyBranch)
      }
      else {
        logger.info(`创建新分支 ${this.strategyBranch} 基于 ${branchStrategyConfig.baseBranch}`)
        await this.git.checkoutBranch(this.strategyBranch, branchStrategyConfig.baseBranch)
      }
    }
    catch (error) {
      throw new GitError('设置分支策略失败', error as Error)
    }
  }

  /**
   * 生成分支名称
   */
  private generateBranchName(config: any): string {
    const { strategy, branchPattern } = config
    let branchName = branchPattern

    // 替换变量
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    branchName = branchName.replace(/\{date\}/g, date)

    switch (strategy) {
      case BranchStrategy.FEATURE:
        // 可以从配置或环境变量中获取特性名称
        const featureName = process.env.FEATURE_NAME || 'feature'
        branchName = branchName.replace(/\{feature\}/g, featureName)
        break
      case BranchStrategy.RELEASE:
        const releaseVersion = process.env.RELEASE_VERSION || '1.0.0'
        branchName = branchName.replace(/\{release\}/g, releaseVersion)
        break
      case BranchStrategy.HOTFIX:
        const hotfixVersion = process.env.HOTFIX_VERSION || '1.0.1'
        branchName = branchName.replace(/\{hotfix\}/g, hotfixVersion)
        break
      case BranchStrategy.DEVELOP:
        branchName = branchName.replace(/\{develop\}/g, 'develop')
        break
    }

    return branchName
  }

  /**
   * 清理分支策略相关资源
   */
  private async cleanupBranchStrategy(): Promise<void> {
    if (!this.options.branchStrategyConfig?.enable) {
      return
    }

    const { branchStrategyConfig } = this.options

    // 如果需要自动切换回原分支
    if (branchStrategyConfig.autoSwitchBack && this.originalBranch) {
      try {
        logger.info(`切换回原分支: ${this.originalBranch}`)
        await this.git.checkout(this.originalBranch)
      }
      catch (error) {
        logger.warn(`切换回原分支失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 如果需要自动删除已合并的分支
    if (branchStrategyConfig.autoDeleteMergedBranches && this.strategyBranch) {
      try {
        // 检查分支是否已合并
        const isMerged = await this.isBranchMerged(this.strategyBranch, branchStrategyConfig.baseBranch)
        if (isMerged) {
          logger.info(`删除已合并的分支: ${this.strategyBranch}`)
          await this.git.deleteLocalBranch(this.strategyBranch)
        }
      }
      catch (error) {
        logger.warn(`删除分支失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /**
   * 检查分支是否已合并到目标分支
   */
  private async isBranchMerged(branch: string, targetBranch: string): Promise<boolean> {
    try {
      const mergeBase = await this.git.raw(['merge-base', targetBranch, branch])
      const branchHead = await this.git.raw(['rev-parse', branch])
      return mergeBase.trim() === branchHead.trim()
    }
    catch (error) {
      logger.error(`检查分支是否合并失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
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

      // 应用分支策略
      await this.setupBranchStrategy()

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

      // 记录最后一步的结束时间
      const lastStepName = `step_${this.stepCounter - 1}`
      if (this.operationTimes[lastStepName]) {
        this.operationTimes[lastStepName].end = performance.now()
      }

      // 计算总执行时间
      if (this.operationTimes.step_1) {
        const totalTime = performance.now() - this.operationTimes.step_1.start
        logger.info(`总执行时间: ${(totalTime / 1000).toFixed(2)}秒`)

        // 输出各步骤执行时间
        logger.info('各步骤执行时间:')
        Object.entries(this.operationTimes).forEach(([step, times]) => {
          if (times.end) {
            const duration = (times.end - times.start) / 1000
            logger.info(`${step}: ${duration.toFixed(2)}秒`)
          }
        })
      }

      logger.success(bold(green('✅ 同步完成!')))
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

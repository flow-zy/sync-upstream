import type { GrayReleaseConfig, GrayReleaseStatus, SyncOptions } from './types'
import { execSync } from 'node:child_process'
import path from 'node:path'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import { blue, cyan, green, red, yellow } from 'picocolors'
import { SyncProcessError } from './errors'
import { loadIgnorePatterns, shouldIgnore } from './ignore'
import { logger } from './logger'
import { GrayReleaseStage, GrayReleaseStrategy } from './types'

/**
 * 灰度发布管理器
 */
export class GrayReleaseManager {
  private config: GrayReleaseConfig
  private options: SyncOptions
  private tempDir: string
  private canaryDir: string
  private rollbackDir: string
  private status: GrayReleaseStatus
  private releaseStartTime: Date | null
  private releaseId: string
  private metrics: { [key: string]: number | string }

  constructor(options: SyncOptions) {
    this.options = options
    this.config = options.grayRelease || {
      enable: false,
      strategy: GrayReleaseStrategy.PERCENTAGE,
      stage: GrayReleaseStage.CANARY,
      monitorInterval: 30000, // 默认30秒监控间隔
    }
    this.tempDir = path.join(process.cwd(), '.sync-temp')
    this.canaryDir = path.join(process.cwd(), '.sync-canary')
    this.rollbackDir = path.join(process.cwd(), '.sync-rollback')
    this.status = {
      stage: this.config.stage || GrayReleaseStage.CANARY,
      progress: 0,
      startTime: null,
      endTime: null,
      success: false,
      filesReleased: 0,
      totalFiles: 0,
      errors: [],
    }
    this.releaseStartTime = null
    this.releaseId = `release-${dayjs().format('YYYYMMDDHHmmss')}-${Math.floor(Math.random() * 1000)}`
    this.metrics = {}

    // 初始化监控
    if (this.config.enableMonitoring !== false) {
      this.startMonitoring()
    }
  }

  /**
   * 检查是否启用灰度发布
   */
  isEnabled(): boolean {
    return this.config.enable
  }

  /**
   * 检查告警阈值
   */
  private checkAlertThresholds(duration: number): void {
    if (!this.config.alertThresholds)
      return

    const { errorRate, performanceDegradation, maxDurationSeconds } = this.config.alertThresholds

    // 错误率告警
    if (errorRate !== undefined) {
      const currentErrorRate = this.status.errors.length / Math.max(1, this.status.totalFiles) * 100
      if (currentErrorRate > errorRate) {
        logger.warn(yellow(`告警: 错误率 (${currentErrorRate.toFixed(2)}%) 超过阈值 (${errorRate}%)`))
      }
    }

    // 性能下降告警
    if (performanceDegradation !== undefined && this.metrics.validationDuration) {
      const baselineDuration = typeof this.metrics.baselineDuration === 'number' ? this.metrics.baselineDuration : 0
      if (baselineDuration > 0) {
        const degradationRate = ((this.metrics.validationDuration as number) - baselineDuration) / baselineDuration * 100
        if (degradationRate > performanceDegradation) {
          logger.warn(yellow(`告警: 性能下降 (${degradationRate.toFixed(2)}%) 超过阈值 (${performanceDegradation}%)`))
        }
      }
    }

    // 最大持续时间告警
    if (maxDurationSeconds !== undefined && duration > maxDurationSeconds) {
      logger.warn(yellow(`告警: 发布持续时间 (${duration}秒) 超过阈值 (${maxDurationSeconds}秒)`))
    }
  }

  /**
   * 开始监控灰度发布状态
   */
  private startMonitoring(): void {
    if (this.config.enableMonitoring === false)
      return

    const interval = this.config.monitorInterval || 30000 // 默认30秒

    logger.info(`开始监控灰度发布 (ID: ${this.releaseId})，间隔: ${interval / 1000}秒`)

    const monitorInterval = setInterval(() => {
      if (this.status.stage === GrayReleaseStage.COMPLETED || this.status.stage === GrayReleaseStage.FAILED || this.status.stage === GrayReleaseStage.ROLLED_BACK || this.status.stage === GrayReleaseStage.FAILED_TO_ROLLBACK) {
        clearInterval(monitorInterval)
        logger.info(`停止监控灰度发布 (ID: ${this.releaseId})`)
        return
      }

      // 记录当前状态
      const currentTime = new Date()
      const duration = this.releaseStartTime ? Math.floor((currentTime.getTime() - this.releaseStartTime.getTime()) / 1000) : 0

      // 更新指标
      this.metrics = {
        ...this.metrics,
        timestamp: currentTime.toISOString(),
        durationSeconds: duration,
        progressPercentage: this.status.progress,
        filesReleased: this.status.filesReleased,
        totalFiles: this.status.totalFiles,
        errorCount: this.status.errors.length,
      }

      // 结构化日志输出
      const logData = {
        releaseId: this.releaseId,
        stage: this.status.stage,
        progress: `${this.status.progress}%`,
        filesReleased: `${this.status.filesReleased}/${this.status.totalFiles}`,
        duration: `${duration}s`,
        errors: this.status.errors.length,
      }

      logger.info(`${blue('灰度发布监控')}: ${JSON.stringify(logData)}`)

      // 检查告警阈值
      this.checkAlertThresholds(duration)
    }, interval)
  }

  /**
   * 获取当前灰度发布状态
   */
  getStatus(): GrayReleaseStatus {
    return this.status
  }

  /**
   * 更新灰度发布状态
   */
  private updateStatus(update: Partial<GrayReleaseStatus>): void {
    this.status = {
      ...this.status,
      ...update,
    }
  }

  /**
   * 执行灰度发布
   */
  async executeCanaryRelease(): Promise<void> {
    if (!this.isEnabled()) {
      logger.info('灰度发布未启用，跳过该步骤')
      return
    }

    this.releaseStartTime = new Date()
    this.updateStatus({
      stage: GrayReleaseStage.PREPARING,
      startTime: this.releaseStartTime,
      progress: 0,
    })

    logger.info(cyan(`开始执行灰度发布 (ID: ${this.releaseId})...`))
    logger.info(`发布策略: ${this.config.strategy}, 阶段: ${this.status.stage}`)

    try {
    // 1. 准备临时目录
      await this.prepareTempDir()
      this.updateStatus({
        stage: GrayReleaseStage.PREPARED,
        progress: 20,
      })

      // 2. 保存当前状态用于回滚
      await this.saveCurrentState()
      this.updateStatus({ progress: 30 })

      // 3. 选择要发布的文件
      let filesToRelease: string[] = []
      switch (this.config.strategy) {
        case GrayReleaseStrategy.PERCENTAGE:
          filesToRelease = await this.selectFilesByPercentage()
          break
        case GrayReleaseStrategy.DIRECTORY:
          filesToRelease = await this.selectFilesByDirectory()
          break
        case GrayReleaseStrategy.FILE:
          filesToRelease = await this.selectFilesByPattern()
          break
        case GrayReleaseStrategy.USER_GROUP:
          filesToRelease = await this.selectFilesByUserGroup()
          break
        case GrayReleaseStrategy.REGION:
          filesToRelease = await this.selectFilesByRegion()
          break
        default:
          throw new SyncProcessError(`不支持的灰度发布策略: ${this.config.strategy}`)
      }
      this.updateStatus({
        totalFiles: filesToRelease.length,
        stage: GrayReleaseStage.SELECTED,
        progress: 40,
      })
      logger.info(`根据策略选择了 ${filesToRelease.length} 个文件进行灰度发布`)

      // 4. 复制选中的文件到金丝雀目录
      await this.copyFilesToCanary(filesToRelease)
      this.updateStatus({
        stage: GrayReleaseStage.CANARY,
        progress: 60,
      })

      // 5. 执行验证脚本
      this.updateStatus({ stage: GrayReleaseStage.VALIDATING })
      const validationSuccess = await this.runValidationScript()
      this.updateStatus({ progress: 80 })

      if (validationSuccess) {
        logger.info(green('灰度发布验证成功'))
        // 6. 应用金丝雀发布
        await this.applyCanaryRelease()
        this.updateStatus({
          stage: GrayReleaseStage.COMPLETED,
          success: true,
          endTime: new Date(),
          progress: 100,
        })
        logger.info(green(`灰度发布完成 (ID: ${this.releaseId})`))
        logger.info(`发布指标: ${JSON.stringify(this.metrics)}`)
      }
      else {
        logger.warn(yellow('灰度发布验证失败，执行回滚'))
        // 6. 回滚
        await this.rollback()
        this.updateStatus({
          stage: GrayReleaseStage.FAILED,
          endTime: new Date(),
          errors: [...this.status.errors, '验证脚本执行失败'],
        })
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(red(`灰度发布失败 (ID: ${this.releaseId}): ${errorMessage}`))
      // 发生错误时执行回滚
      await this.rollback().catch((rollbackError) => {
        logger.error(red(`回滚失败: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`))
      })
      this.updateStatus({
        stage: GrayReleaseStage.FAILED,
        endTime: new Date(),
        errors: [...this.status.errors, errorMessage],
      })
      throw new SyncProcessError(`灰度发布失败: ${errorMessage}`)
    }
  }

  /**
   * 按百分比选择文件
   */
  private async selectFilesByPercentage(): Promise<string[]> {
    const percentage = this.config.percentage || 30
    logger.info(`按百分比发布: ${percentage}% 的文件`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())

    // 收集所有要同步的文件
    const allFiles: string[] = []
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.tempDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const files = await fs.readdir(sourcePath, { recursive: true })
        for (const file of files) {
          const fullPath = path.join(sourcePath, file)
          const relativePath = path.relative(this.tempDir, fullPath)
          if (!shouldIgnore(relativePath, ignorePatterns)) {
            allFiles.push(relativePath)
          }
        }
      }
    }

    // 随机选择指定百分比的文件
    return this.selectRandomFiles(allFiles, percentage)
  }

  /**
   * 按目录选择文件
   */
  private async selectFilesByDirectory(): Promise<string[]> {
    const canaryDirs = this.config.canaryDirs || []
    if (canaryDirs.length === 0) {
      throw new SyncProcessError('按目录发布时必须指定 canaryDirs')
    }

    logger.info(`按目录发布: ${canaryDirs.join(', ')}`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())
    const selectedFiles: string[] = []

    for (const dir of canaryDirs) {
      const sourcePath = path.join(this.tempDir, dir)
      if (await fs.pathExists(sourcePath)) {
      // 收集目录下所有文件
        const files = await fs.readdir(sourcePath, { recursive: true })
        for (const file of files) {
          const fullPath = path.join(sourcePath, file)
          const relativePath = path.relative(this.tempDir, fullPath)
          if (!shouldIgnore(relativePath, ignorePatterns)) {
            selectedFiles.push(relativePath)
          }
        }
        logger.info(`  选择目录: ${dir}`)
      }
      else {
        logger.warn(`  目录不存在: ${dir}`)
      }
    }

    return selectedFiles
  }

  /**
   * 按文件模式选择文件
   */
  private async selectFilesByPattern(): Promise<string[]> {
    const filePatterns = this.config.filePatterns || []
    if (filePatterns.length === 0) {
      throw new SyncProcessError('按文件发布时必须指定 filePatterns')
    }

    logger.info(`按文件发布: ${filePatterns.join(', ')}`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())

    // 收集所有匹配的文件
    const matchedFiles: string[] = []
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.tempDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const files = await fs.readdir(sourcePath, { recursive: true })
        for (const file of files) {
          const fullPath = path.join(sourcePath, file)
          const relativePath = path.relative(this.tempDir, fullPath)
          if (
            !shouldIgnore(relativePath, ignorePatterns)
            && this.matchFilePattern(relativePath, filePatterns)
          ) {
            matchedFiles.push(relativePath)
          }
        }
      }
    }

    return matchedFiles
  }

  /**
   * 按用户组选择文件
   */
  private async selectFilesByUserGroup(): Promise<string[]> {
    const userGroups = this.config.userGroups || []
    if (userGroups.length === 0) {
      throw new SyncProcessError('按用户组发布时必须指定 userGroups')
    }

    logger.info(`按用户组发布: ${userGroups.map(g => g.name).join(', ')}`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())

    // 收集所有要同步的文件
    const allFiles: string[] = []
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.tempDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const files = await fs.readdir(sourcePath, { recursive: true })
        for (const file of files) {
          const fullPath = path.join(sourcePath, file)
          const relativePath = path.relative(this.tempDir, fullPath)
          if (!shouldIgnore(relativePath, ignorePatterns)) {
            allFiles.push(relativePath)
          }
        }
      }
    }

    // 根据用户组规则选择文件
    const selectedFiles: string[] = []
    for (const userGroup of userGroups) {
      // 为每个用户组选择指定百分比的文件
      const groupFiles = this.selectRandomFiles(allFiles, userGroup.percentage || 100)
      selectedFiles.push(...groupFiles)
      logger.info(`  为用户组 ${userGroup.name} 选择了 ${groupFiles.length} 个文件`)
    }

    // 去重
    return [...new Set(selectedFiles)]
  }

  /**
   * 按地区选择文件
   */
  private async selectFilesByRegion(): Promise<string[]> {
    const regions = this.config.regions || []
    if (regions.length === 0) {
      throw new SyncProcessError('按地区发布时必须指定 regions')
    }

    logger.info(`按地区发布: ${regions.map(r => r.name).join(', ')}`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())

    // 收集所有要同步的文件
    const allFiles: string[] = []
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.tempDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const files = await fs.readdir(sourcePath, { recursive: true })
        for (const file of files) {
          const fullPath = path.join(sourcePath, file)
          const relativePath = path.relative(this.tempDir, fullPath)
          if (!shouldIgnore(relativePath, ignorePatterns)) {
            allFiles.push(relativePath)
          }
        }
      }
    }

    // 根据地区规则选择文件
    const selectedFiles: string[] = []
    for (const region of regions) {
      // 为每个地区选择指定百分比的文件
      const regionFiles = this.selectRandomFiles(allFiles, region.percentage || 100)
      selectedFiles.push(...regionFiles)
      logger.info(`  为地区 ${region.name} 选择了 ${regionFiles.length} 个文件`)
    }

    // 去重
    return [...new Set(selectedFiles)]
  }

  /**
   * 复制文件到金丝雀目录
   */
  private async copyFilesToCanary(files: string[]): Promise<void> {
    let copiedCount = 0
    for (const file of files) {
      const sourcePath = path.join(this.tempDir, file)
      const destPath = path.join(this.canaryDir, file)

      await fs.ensureDir(path.dirname(destPath))
      await fs.copyFile(sourcePath, destPath)

      copiedCount++
      this.updateStatus({
        filesReleased: copiedCount,
        progress: 30 + Math.floor((copiedCount / files.length) * 30),
      })

      logger.info(`  发布文件: ${file}`)
    }
  }

  /**
   * 应用金丝雀发布
   */
  private async applyCanaryRelease(): Promise<void> {
  // 将金丝雀目录中的文件应用到目标位置
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.canaryDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const destPath = path.join(process.cwd(), dir)

        // 复制目录
        await fs.copy(sourcePath, destPath, {
          overwrite: true,
        })

        logger.info(`  应用金丝雀发布到目录: ${dir}`)
      }
    }
  }

  /**
   * 随机选择指定百分比的文件
   */
  private selectRandomFiles(files: string[], percentage: number): string[] {
  // 计算要选择的文件数量
    const count = Math.max(1, Math.floor(files.length * percentage / 100))
    logger.info(`  从 ${files.length} 个文件中选择 ${count} 个进行发布`)

    // 复制数组以避免修改原始数组
    const shuffled = [...files]
    // 打乱数组顺序
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    // 返回前count个元素
    return shuffled.slice(0, count)
  }

  /**
   * 检查文件是否匹配任何模式
   */
  private matchFilePattern(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
    // 简单的通配符匹配实现
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
      const regex = new RegExp(`^${regexPattern}$`)
      if (regex.test(filePath)) {
        return true
      }
    }
    return false
  }

  /**
   * 准备临时目录
   */
  private async prepareTempDir(): Promise<void> {
    logger.info('准备临时目录...')
    // 确保临时目录存在并为空
    await fs.ensureDir(this.tempDir)
    await fs.emptyDir(this.tempDir)

    // 复制同步目录到临时目录
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(process.cwd(), dir)
      const destPath = path.join(this.tempDir, path.basename(dir))

      if (await fs.pathExists(sourcePath)) {
        await fs.copy(sourcePath, destPath)
        logger.info(`  复制目录 ${dir} 到临时目录`)
      }
      else {
        logger.warn(`  源目录不存在: ${dir}`)
      }
    }
    logger.info('临时目录准备完成')
  }

  /**
   * 按目录发布
   */
  private async releaseByDirectory(): Promise<void> {
    const canaryDirs = this.config.canaryDirs || []
    if (canaryDirs.length === 0) {
      throw new SyncProcessError('按目录发布时必须指定 canaryDirs')
    }

    logger.info(`按目录发布: ${canaryDirs.join(', ')}`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())

    for (const dir of canaryDirs) {
      const sourcePath = path.join(this.tempDir, dir)
      if (await fs.pathExists(sourcePath)) {
        const destPath = path.join(this.canaryDir, dir)

        // 复制目录，应用忽略模式
        await this.copyDirectoryWithIgnore(sourcePath, destPath, ignorePatterns)

        logger.info(`  发布目录: ${dir}`)
      }
      else {
        logger.warn(`  目录不存在: ${dir}`)
      }
    }
  }

  /**
   * 按文件发布
   */
  private async releaseByFile(): Promise<void> {
    const filePatterns = this.config.filePatterns || []
    if (filePatterns.length === 0) {
      throw new SyncProcessError('按文件发布时必须指定 filePatterns')
    }

    logger.info(`按文件发布: ${filePatterns.join(', ')}`)

    // 加载忽略模式
    const ignorePatterns = await loadIgnorePatterns(process.cwd())

    // 收集所有匹配的文件
    const matchedFiles: string[] = []
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.tempDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const files = await fs.readdir(sourcePath, { recursive: true })
        for (const file of files) {
          const fullPath = path.join(sourcePath, file)
          const relativePath = path.relative(this.tempDir, fullPath)
          if (
            !shouldIgnore(relativePath, ignorePatterns)
            && this.matchFilePattern(relativePath, filePatterns)
          ) {
            matchedFiles.push(relativePath)
          }
        }
      }
    }

    // 复制匹配的文件到金丝雀目录
    for (const file of matchedFiles) {
      const sourcePath = path.join(this.tempDir, file)
      const destPath = path.join(this.canaryDir, file)

      await fs.ensureDir(path.dirname(destPath))
      await fs.copyFile(sourcePath, destPath)

      logger.info(`  发布文件: ${file}`)
    }
  }

  /**
   * 运行验证脚本
   */
  private async runValidationScript(): Promise<boolean> {
    const scriptPath = this.config.validationScript!
    logger.info(`运行验证脚本: ${yellow(scriptPath)}`)

    try {
      // 记录验证开始时间
      const startTime = Date.now()

      const result = execSync(`node ${scriptPath}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      })

      // 记录验证结束时间和耗时
      const endTime = Date.now()
      const duration = Math.floor((endTime - startTime) / 1000)
      this.metrics.validationDuration = duration

      logger.info(`验证脚本输出: ${green(result.toString())}`)
      logger.success(`验证通过，耗时: ${duration}秒`)
      return true
    }
    catch (error) {
      logger.error(`验证失败: ${red((error as Error).message)}`)

      // 如果配置了验证失败自动回滚，则执行回滚
      if (this.config.rollbackOnFailure) {
        logger.info('验证失败，开始自动回滚...')
        await this.rollback()
        throw new SyncProcessError('验证失败并已自动回滚')
      }
      else {
        throw new SyncProcessError('验证失败')
      }
    }
  }

  /**
   * 执行全量发布
   */
  async executeFullRelease(): Promise<void> {
    logger.info(`开始 ${cyan('全量发布')}...`)

    // 保存当前状态用于可能的回滚
    await this.saveCurrentState()

    // 复制所有变更到目标目录
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.tempDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const destPath = path.join(process.cwd(), dir)

        // 复制目录
        await fs.copy(sourcePath, destPath, {
          overwrite: true,
        })

        logger.info(`  全量发布目录: ${dir}`)
      }
    }

    logger.success('全量发布完成')
  }

  /**
   * 回滚灰度发布
   */
  async rollback(): Promise<void> {
    logger.info(yellow(`执行灰度发布回滚 (ID: ${this.releaseId})...`))

    try {
      if (await fs.pathExists(this.rollbackDir)) {
      // 恢复到回滚前的状态
        let rolledBackCount = 0
        const totalDirs = this.options.syncDirs.length

        for (const dir of this.options.syncDirs) {
          const rollbackPath = path.join(this.rollbackDir, path.basename(dir))
          if (await fs.pathExists(rollbackPath)) {
            const targetPath = path.join(process.cwd(), dir)

            // 确保目标目录存在
            await fs.ensureDir(targetPath)

            // 执行回滚复制
            await fs.copy(rollbackPath, targetPath, {
              overwrite: true,
              recursive: true,
            })

            rolledBackCount++
            logger.info(`  回滚目录: ${dir}`)
          }
          else {
            logger.warn(`  回滚源目录不存在: ${rollbackPath}`)
          }
        }

        logger.info(green(`灰度发布回滚完成 (ID: ${this.releaseId})，成功回滚 ${rolledBackCount}/${totalDirs} 个目录`))
        this.updateStatus({
          stage: GrayReleaseStage.ROLLED_BACK,
          endTime: new Date(),
        })
      }
      else {
        logger.warn(yellow('回滚目录不存在，无法执行回滚'))
        this.updateStatus({
          stage: GrayReleaseStage.FAILED_TO_ROLLBACK,
          endTime: new Date(),
          errors: [...this.status.errors, '回滚目录不存在'],
        })
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(red(`回滚失败 (ID: ${this.releaseId}): ${errorMessage}`))
      this.updateStatus({
        stage: GrayReleaseStage.FAILED_TO_ROLLBACK,
        endTime: new Date(),
        errors: [...this.status.errors, errorMessage],
      })
      throw new SyncProcessError(`回滚失败: ${errorMessage}`)
    }
  }

  /**
   * 保存当前状态用于回滚
   */
  private async saveCurrentState(): Promise<void> {
    logger.info('保存当前状态用于回滚...')

    await fs.ensureDir(this.rollbackDir)
    await fs.emptyDir(this.rollbackDir)

    // 复制当前状态到回滚目录
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(process.cwd(), dir)
      if (await fs.pathExists(sourcePath)) {
        const destPath = path.join(this.rollbackDir, path.basename(dir))

        // 复制目录
        await fs.copy(sourcePath, destPath)

        logger.info(`  保存目录状态: ${dir}`)
      }
    }

    logger.success('当前状态保存完成')
  }

  /**
   * 复制目录并应用忽略模式
   */
  private async copyDirectoryWithIgnore(
    source: string,
    destination: string,
    ignorePatterns: string[],
  ): Promise<void> {
    await fs.ensureDir(destination)

    const entries = await fs.readdir(source, { withFileTypes: true })

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name)
      const destPath = path.join(destination, entry.name)
      const relativePath = path.relative(source, sourcePath)

      // 检查是否应该忽略
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue
      }

      if (entry.isDirectory()) {
        // 递归处理子目录
        await this.copyDirectoryWithIgnore(sourcePath, destPath, ignorePatterns)
      }
      else {
        // 复制文件
        await fs.copyFile(sourcePath, destPath)
      }
    }
  }
}

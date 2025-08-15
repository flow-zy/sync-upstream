import type { GrayReleaseConfig, GrayReleaseStrategy, SyncOptions } from './types'
import path from 'node:path'
import fs from 'fs-extra'
import { logger } from './logger'
import { cyan, green, red, yellow } from 'picocolors'
import { execSync } from 'node:child_process'
import { FsError, SyncProcessError } from './errors'
import { loadIgnorePatterns, shouldIgnore } from './ignore'

/**
 * 灰度发布管理器
 */
export class GrayReleaseManager {
  private config: GrayReleaseConfig
  private options: SyncOptions
  private tempDir: string
  private canaryDir: string
  private rollbackDir: string

  constructor(options: SyncOptions) {
    this.options = options
    this.config = options.grayRelease || {
      enable: false,
      strategy: GrayReleaseStrategy.PERCENTAGE,
    }
    this.tempDir = path.join(process.cwd(), '.sync-temp')
    this.canaryDir = path.join(process.cwd(), '.sync-canary')
    this.rollbackDir = path.join(process.cwd(), '.sync-rollback')
  }

  /**
   * 检查是否启用灰度发布
   */
  isEnabled(): boolean {
    return this.config.enable
  }

  /**
   * 执行灰度发布（Canary发布）
   */
  async executeCanaryRelease(): Promise<void> {
    logger.info(`开始 ${cyan('灰度发布')} (Canary Release)...`)

    // 确保临时目录存在
    await fs.ensureDir(this.canaryDir)
    await fs.emptyDir(this.canaryDir)

    // 根据策略选择不同的发布方式
    switch (this.config.strategy) {
      case GrayReleaseStrategy.PERCENTAGE:
        await this.releaseByPercentage()
        break
      case GrayReleaseStrategy.DIRECTORY:
        await this.releaseByDirectory()
        break
      case GrayReleaseStrategy.FILE:
        await this.releaseByFile()
        break
      default:
        throw new SyncProcessError(`不支持的灰度发布策略: ${this.config.strategy}`)
    }

    logger.success(`灰度发布 (Canary) 完成，已发布到 ${cyan(this.canaryDir)}`)

    // 执行验证脚本（如果有）
    if (this.config.validationScript) {
      await this.runValidationScript()
    }
  }

  /**
   * 按百分比发布
   */
  private async releaseByPercentage(): Promise<void> {
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
    const filesToRelease = this.selectRandomFiles(allFiles, percentage)

    // 复制选中的文件到金丝雀目录
    for (const file of filesToRelease) {
      const sourcePath = path.join(this.tempDir, file)
      const destPath = path.join(this.canaryDir, file)

      await fs.ensureDir(path.dirname(destPath))
      await fs.copyFile(sourcePath, destPath)

      logger.info(`  发布文件: ${file}`)
    }
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
      } else {
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
            !shouldIgnore(relativePath, ignorePatterns) &&
            this.matchFilePattern(relativePath, filePatterns)
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
  private async runValidationScript(): Promise<void> {
    const scriptPath = this.config.validationScript!
    logger.info(`运行验证脚本: ${yellow(scriptPath)}`)

    try {
      const result = execSync(`node ${scriptPath}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
      })

      logger.info(`验证脚本输出: ${green(result.toString())}`)
      logger.success('验证通过')
    } catch (error) {
      logger.error(`验证失败: ${red((error as Error).message)}`)

      // 如果配置了验证失败自动回滚，则执行回滚
      if (this.config.rollbackOnFailure) {
        logger.info('验证失败，开始自动回滚...')
        await this.rollback()
        throw new SyncProcessError('验证失败并已自动回滚')
      } else {
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
   * 执行回滚操作
   */
  async rollback(): Promise<void> {
    logger.info(`开始 ${cyan('回滚')}操作...`)

    if (!(await fs.pathExists(this.rollbackDir))) {
      throw new FsError('回滚目录不存在，无法执行回滚')
    }

    // 从回滚目录恢复文件
    for (const dir of this.options.syncDirs) {
      const sourcePath = path.join(this.rollbackDir, path.basename(dir))
      if (await fs.pathExists(sourcePath)) {
        const destPath = path.join(process.cwd(), dir)

        // 复制目录
        await fs.copy(sourcePath, destPath, {
          overwrite: true,
        })

        logger.info(`  回滚目录: ${dir}`)
      }
    }

    logger.success('回滚操作完成')
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
   * 从数组中随机选择指定百分比的元素
   */
  private selectRandomFiles(files: string[], percentage: number): string[] {
    const count = Math.max(1, Math.floor((percentage / 100) * files.length))
    const shuffled = [...files].sort(() => 0.5 - Math.random())
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
   * 复制目录并应用忽略模式
   */
  private async copyDirectoryWithIgnore(
    source: string,
    destination: string,
    ignorePatterns: string[]
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
      } else {
        // 复制文件
        await fs.copyFile(sourcePath, destPath)
      }
    }
  }
}
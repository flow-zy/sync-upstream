import path from 'node:path'
import fs from 'fs-extra'
import { yellow } from 'picocolors'
import prompts from 'prompts'
import { FsError } from './errors'
import { getFileHash } from './hash'
import { logger } from './logger'

/**
 * 冲突类型枚举
 */
export enum ConflictType {
  /** 文件内容冲突 */
  CONTENT = 'content',
  /** 文件类型冲突（一个是文件，一个是目录） */
  TYPE = 'type',
  /** 重命名冲突 */
  RENAME = 'rename',
}

/**
 * 冲突解决策略枚举
 */
export enum ConflictResolutionStrategy {
  /** 使用源文件覆盖目标文件 */
  USE_SOURCE = 'use-source',
  /** 保留目标文件 */
  KEEP_TARGET = 'keep-target',
  /** 尝试自动合并（仅适用于文本文件） */
  AUTO_MERGE = 'auto-merge',
  /** 提示用户解决 */
  PROMPT_USER = 'prompt-user',
}

/**
 * 冲突解决配置接口
 */
export interface ConflictResolutionConfig {
  /** 默认解决策略 */
  defaultStrategy: ConflictResolutionStrategy
  /** 自动解决的文件类型列表 */
  autoResolveTypes?: string[]
  /** 是否记录冲突解决日志 */
  logResolutions?: boolean
}

/**
 * 冲突信息接口
 */
export interface ConflictInfo {
  /** 冲突类型 */
  type: ConflictType
  /** 源文件路径 */
  sourcePath: string
  /** 目标文件路径 */
  targetPath: string
  /** 源文件哈希（内容冲突时） */
  sourceHash?: string
  /** 目标文件哈希（内容冲突时） */
  targetHash?: string
  /** 源文件类型（类型冲突时） */
  sourceType?: 'file' | 'directory'
  /** 目标文件类型（类型冲突时） */
  targetType?: 'file' | 'directory'
}

/**
 * 冲突解决器类
 */
export class ConflictResolver {
  private config: ConflictResolutionConfig

  /**
   * 构造函数
   * @param config 冲突解决配置
   */
  constructor(config: ConflictResolutionConfig) {
    this.config = config
  }

  /**
   * 检测文件冲突
   * @param sourcePath 源文件路径
   * @param targetPath 目标文件路径
   * @returns 冲突信息，如果没有冲突则返回null
   */
  public async detectFileConflict(
    sourcePath: string,
    targetPath: string,
  ): Promise<ConflictInfo | null> {
    try {
      const sourceExists = await fs.pathExists(sourcePath)
      const targetExists = await fs.pathExists(targetPath)

      // 只有当源文件和目标文件都存在时才可能有冲突
      if (!sourceExists || !targetExists) {
        return null
      }

      // 检查是否一个是文件，一个是目录
      const sourceStat = await fs.stat(sourcePath)
      const targetStat = await fs.stat(targetPath)

      if (sourceStat.isDirectory() !== targetStat.isDirectory()) {
        return {
          type: ConflictType.TYPE,
          sourcePath,
          targetPath,
          sourceType: sourceStat.isDirectory() ? 'directory' : 'file',
          targetType: targetStat.isDirectory() ? 'directory' : 'file',
        }
      }

      // 如果都是目录，没有冲突
      if (sourceStat.isDirectory() && targetStat.isDirectory()) {
        return null
      }

      // 如果都是文件，比较内容哈希
      const sourceHash = await getFileHash(sourcePath)
      const targetHash = await getFileHash(targetPath)

      if (sourceHash !== targetHash) {
        return {
          type: ConflictType.CONTENT,
          sourcePath,
          targetPath,
          sourceHash,
          targetHash,
        }
      }

      // 没有冲突
      return null
    }
    catch (error) {
      throw new FsError(`检测文件冲突时出错: ${sourcePath} vs ${targetPath}`, error as Error)
    }
  }

  /**
   * 检测目录冲突
   * @param sourceDir 源目录路径
   * @param targetDir 目标目录路径
   * @param ignorePatterns 忽略模式
   * @returns 冲突信息列表
   */
  public async detectDirectoryConflicts(
    sourceDir: string,
    targetDir: string,
    ignorePatterns: string[] = [],
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = []

    try {
      // 读取源目录
      const sourceEntries = await fs.readdir(sourceDir, { withFileTypes: true })

      for (const entry of sourceEntries) {
        const sourcePath = path.join(sourceDir, entry.name)
        const targetPath = path.join(targetDir, entry.name)
        const relativePath = path.relative(process.cwd(), sourcePath)

        // 检查是否应该忽略
        if (shouldIgnore(relativePath, ignorePatterns)) {
          continue
        }

        if (entry.isDirectory()) {
          // 递归检查子目录
          const subConflicts = await this.detectDirectoryConflicts(
            sourcePath,
            targetPath,
            ignorePatterns,
          )
          conflicts.push(...subConflicts)
        }
        else {
          // 检查文件冲突
          const conflict = await this.detectFileConflict(sourcePath, targetPath)
          if (conflict) {
            conflicts.push(conflict)
          }
        }
      }

      return conflicts
    }
    catch (error) {
      throw new FsError(`检测目录冲突时出错: ${sourceDir} vs ${targetDir}`, error as Error)
    }
  }

  /**
   * 解决单个冲突
   * @param conflict 冲突信息
   * @param strategy 解决策略（可选，默认使用配置中的策略）
   * @returns 是否成功解决
   */
  public async resolveConflict(
    conflict: ConflictInfo,
    strategy?: ConflictResolutionStrategy,
  ): Promise<boolean> {
    let resolutionStrategy = strategy || this.config.defaultStrategy

    // 检查是否应该自动解决
    if (conflict.type === ConflictType.CONTENT && this.config.autoResolveTypes) {
      const fileExtension = path.extname(conflict.sourcePath).toLowerCase()
      if (this.config.autoResolveTypes.includes(fileExtension)) {
        logger.debug(`自动解决冲突: ${conflict.sourcePath} (匹配自动解决类型 ${fileExtension})`)
        // 如果是自动解决类型，使用配置中的默认策略
        if (!strategy) {
          resolutionStrategy = this.config.defaultStrategy
        }
      }
    }

    try {
      switch (conflict.type) {
        case ConflictType.CONTENT:
          return this.resolveContentConflict(conflict, resolutionStrategy)
        case ConflictType.TYPE:
          return this.resolveTypeConflict(conflict, resolutionStrategy)
        case ConflictType.RENAME:
          return this.resolveRenameConflict(conflict, resolutionStrategy)
        default:
          logger.error(`未知的冲突类型: ${conflict.type}`)
          return false
      }
    }
    catch (error) {
      logger.error(`解决冲突时出错: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 解决内容冲突
   * @param conflict 冲突信息
   * @param strategy 解决策略
   * @returns 是否成功解决
   */
  private async resolveContentConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    // 实现内容冲突解决逻辑
    let resolved = false
    const fileExtension = path.extname(conflict.sourcePath).toLowerCase()
    const isAutoResolveType = this.config.autoResolveTypes?.includes(fileExtension) || false

    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        await fs.copyFile(conflict.sourcePath, conflict.targetPath)
        logger.info(`冲突解决: 使用源文件覆盖目标文件 ${yellow(conflict.targetPath)}`)
        resolved = true
        break

      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`冲突解决: 保留目标文件 ${yellow(conflict.targetPath)}`)
        resolved = true
        break

      case ConflictResolutionStrategy.AUTO_MERGE:
        // 尝试自动合并（这里简化实现，实际项目中可能需要更复杂的合并逻辑）
        try {
          const sourceContent = await fs.readFile(conflict.sourcePath, 'utf8')
          const targetContent = await fs.readFile(conflict.targetPath, 'utf8')

          // 简单的合并策略：保留双方内容并添加标记
          const mergedContent = `<<<<<<< SOURCE
${sourceContent}
=======
${targetContent}
>>>>>>> TARGET`
          await fs.writeFile(conflict.targetPath, mergedContent)
          logger.info(`冲突解决: 自动合并文件 ${yellow(conflict.targetPath)}`)
          resolved = true
        }
        catch (error) {
          logger.error(`自动合并失败，回退到提示用户: ${error instanceof Error ? error.message : String(error)}`)
          return this.resolveContentConflict(conflict, ConflictResolutionStrategy.PROMPT_USER)
        }
        break

      case ConflictResolutionStrategy.PROMPT_USER:
        // 如果是自动解决类型，则不提示用户，直接使用默认策略
        if (isAutoResolveType) {
          logger.debug(`文件 ${yellow(conflict.targetPath)} 是自动解决类型，使用默认策略 ${this.config.defaultStrategy}`)
          return this.resolveContentConflict(conflict, this.config.defaultStrategy)
        }

        // 提示用户解决
        const { resolution } = await prompts({
          type: 'select',
          name: 'resolution',
          message: `文件 ${yellow(conflict.targetPath)} 存在内容冲突，如何解决?`,
          choices: [
            { title: '使用源文件覆盖', value: ConflictResolutionStrategy.USE_SOURCE },
            { title: '保留目标文件', value: ConflictResolutionStrategy.KEEP_TARGET },
            { title: '查看并编辑合并结果', value: 'edit' },
          ],
        })

        if (resolution === 'edit') {
          // 在实际项目中，这里可以打开编辑器让用户手动合并
          logger.info(`提示: 请手动编辑文件 ${yellow(conflict.targetPath)} 解决冲突`)
          return false
        }
        else {
          return this.resolveContentConflict(conflict, resolution)
        }

      default:
        logger.error(`未知的解决策略: ${strategy}`)
        return false
    }

    // 记录冲突解决日志
    if (resolved && this.config.logResolutions) {
      logger.debug(`冲突解决日志: 类型=${conflict.type}, 源文件=${conflict.sourcePath}, 目标文件=${conflict.targetPath}, 策略=${strategy}`)
    }

    return resolved
  }

  /**
   * 解决类型冲突
   * @param conflict 冲突信息
   * @param strategy 解决策略
   * @returns 是否成功解决
   */
  private async resolveTypeConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    // 实现类型冲突解决逻辑
    let resolved = false

    // 对于类型冲突，我们可以考虑文件名的扩展名来决定是否自动解决
    const fileExtension = path.extname(conflict.sourcePath).toLowerCase()
    const isAutoResolveType = this.config.autoResolveTypes?.includes(fileExtension) || false

    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        // 删除目标，复制源
        if (await fs.pathExists(conflict.targetPath)) {
          await fs.remove(conflict.targetPath)
        }
        if (conflict.sourceType === 'directory') {
          await fs.mkdir(conflict.targetPath, { recursive: true })
          // 递归复制目录内容
          await fs.copy(conflict.sourcePath, conflict.targetPath)
        }
        else {
          await fs.copyFile(conflict.sourcePath, conflict.targetPath)
        }
        logger.info(`冲突解决: 使用源${conflict.sourceType}覆盖目标${conflict.targetType} ${yellow(conflict.targetPath)}`)
        resolved = true
        break

      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`冲突解决: 保留目标${conflict.targetType} ${yellow(conflict.targetPath)}`)
        resolved = true
        break

      case ConflictResolutionStrategy.PROMPT_USER:
        // 如果是自动解决类型，则不提示用户，直接使用默认策略
        if (isAutoResolveType) {
          logger.debug(`路径 ${yellow(conflict.targetPath)} 是自动解决类型，使用默认策略 ${this.config.defaultStrategy}`)
          return this.resolveTypeConflict(conflict, this.config.defaultStrategy)
        }

        // 提示用户解决
        const { resolution } = await prompts({
          type: 'select',
          name: 'resolution',
          message: `路径 ${yellow(conflict.targetPath)} 存在类型冲突（源是${conflict.sourceType}，目标是${conflict.targetType}），如何解决?`,
          choices: [
            { title: `使用源${conflict.sourceType}覆盖`, value: ConflictResolutionStrategy.USE_SOURCE },
            { title: `保留目标${conflict.targetType}`, value: ConflictResolutionStrategy.KEEP_TARGET },
          ],
        })

        return this.resolveTypeConflict(conflict, resolution)

      default:
        logger.error(`未知的解决策略: ${strategy}`)
        return false
    }

    // 记录冲突解决日志
    if (resolved && this.config.logResolutions) {
      logger.debug(`冲突解决日志: 类型=${conflict.type}, 源文件=${conflict.sourcePath}, 目标文件=${conflict.targetPath}, 策略=${strategy}`)
    }

    return resolved
  }

  /**
   * 解决重命名冲突
   * @param conflict 冲突信息
   * @param strategy 解决策略
   * @returns 是否成功解决
   */
  private async resolveRenameConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    let resolved = false

    // 对于重命名冲突，我们可以考虑文件名的扩展名来决定是否自动解决
    const fileExtension = path.extname(conflict.sourcePath).toLowerCase()
    const isAutoResolveType = this.config.autoResolveTypes?.includes(fileExtension) || false

    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        // 确保目标路径不存在
        if (await fs.pathExists(conflict.targetPath)) {
          await fs.remove(conflict.targetPath)
        }

        // 复制源文件到目标路径
        if (await fs.pathExists(conflict.sourcePath)) {
          const sourceStat = await fs.stat(conflict.sourcePath)
          if (sourceStat.isDirectory()) {
            await fs.mkdir(conflict.targetPath, { recursive: true })
            await fs.copy(conflict.sourcePath, conflict.targetPath)
          }
          else {
            await fs.copyFile(conflict.sourcePath, conflict.targetPath)
          }
          logger.info(`冲突解决: 使用源文件 ${yellow(conflict.sourcePath)} 覆盖目标路径 ${yellow(conflict.targetPath)}`)
          resolved = true
        }
        else {
          logger.error(`源文件不存在: ${conflict.sourcePath}`)
        }
        break

      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`冲突解决: 保留目标文件 ${yellow(conflict.targetPath)}`)
        resolved = true
        break

      case ConflictResolutionStrategy.PROMPT_USER:
        // 如果是自动解决类型，则不提示用户，直接使用默认策略
        if (isAutoResolveType) {
          logger.debug(`文件 ${yellow(conflict.sourcePath)} 是自动解决类型，使用默认策略 ${this.config.defaultStrategy}`)
          return this.resolveRenameConflict(conflict, this.config.defaultStrategy)
        }

        // 提示用户解决
        const { resolution } = await prompts({
          type: 'select',
          name: 'resolution',
          message: `检测到重命名冲突: ${yellow(conflict.sourcePath)} -> ${yellow(conflict.targetPath)}，如何解决?`,
          choices: [
            { title: '使用源文件覆盖目标路径', value: ConflictResolutionStrategy.USE_SOURCE },
            { title: '保留目标文件', value: ConflictResolutionStrategy.KEEP_TARGET },
          ],
        })

        return this.resolveRenameConflict(conflict, resolution)

      default:
        logger.error(`未知的解决策略: ${strategy}`)
        return false
    }

    // 记录冲突解决日志
    if (resolved && this.config.logResolutions) {
      logger.debug(`冲突解决日志: 类型=${conflict.type}, 源文件=${conflict.sourcePath}, 目标文件=${conflict.targetPath}, 策略=${strategy}`)
    }

    return resolved
  }

  /**
   * 解决多个冲突
   * @param conflicts 冲突信息列表
   * @returns 成功解决的冲突数量
   */
  public async resolveConflicts(conflicts: ConflictInfo[]): Promise<number> {
    let resolvedCount = 0

    if (conflicts.length === 0) {
      logger.info('没有检测到冲突')
      return resolvedCount
    }

    logger.warn(yellow(`检测到 ${conflicts.length} 个冲突`))

    for (const conflict of conflicts) {
      const resolved = await this.resolveConflict(conflict)
      if (resolved) {
        resolvedCount++
      }
    }

    logger.info(`成功解决 ${resolvedCount}/${conflicts.length} 个冲突`)
    return resolvedCount
  }
}

/**
 * 检查路径是否应该被忽略
 * @param path 路径
 * @param ignorePatterns 忽略模式列表
 * @returns 是否应该被忽略
 */
function shouldIgnore(path: string, ignorePatterns: string[]): boolean {
  // 简化实现，实际项目中可能需要使用更复杂的模式匹配
  for (const pattern of ignorePatterns) {
    if (path.includes(pattern)) {
      return true
    }
  }
  return false
}

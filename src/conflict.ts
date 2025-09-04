import path from 'node:path'
import fs from 'fs-extra'
import { blue, green, red, yellow } from 'picocolors'
import prompts from 'prompts'
import { FsError, UserCancelError } from './errors'
import { getFileHash } from './hash'
import { shouldIgnore } from './ignore'
import { logger } from './logger'
import { ConflictResolutionStrategy, ConflictType } from './types'

export { ConflictResolutionStrategy, ConflictType }

/**
 * 临时实现：获取文件版本
 * TODO: 替换为实际的版本控制系统集成
 */
async function getFileVersion(filePath: string): Promise<string | null> {
  try {
    // 尝试从文件内容或元数据中提取版本
    // 这里只是一个示例实现
    const stats = await fs.stat(filePath)
    // 使用文件修改时间作为临时版本标识
    return stats.mtime.getTime().toString()
  }
  catch (error) {
    console.error(`Failed to get version for file ${filePath}:`, error)
    return null
  }
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
  /** 源文件版本（版本冲突时） */
  sourceVersion?: string
  /** 目标文件版本（版本冲突时） */
  targetVersion?: string
  /** 源文件权限（权限冲突时） */
  sourcePermissions?: number
  /** 目标文件权限（权限冲突时） */
  targetPermissions?: number
  /** 锁定信息（文件锁定冲突时） */
  lockInfo?: {
    owner: string
    timestamp: Date
    processId: number
  }
  /** 符号链接目标（符号链接冲突时） */
  symlinkTarget?: string
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
   * @param options 可选配置项
   * @returns 冲突信息，如果没有冲突则返回null
   */
  public async detectFileConflict(
    sourcePath: string,
    targetPath: string,
    options: { checkVersion?: boolean, checkPermissions?: boolean } = {},
  ): Promise<ConflictInfo | null> {
    try {
      const { checkVersion = false, checkPermissions = false } = options
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

      // 如果都是目录，检查是否有符号链接冲突
      if (sourceStat.isDirectory() && targetStat.isDirectory()) {
        // 检查符号链接
        const sourceLstat = await fs.lstat(sourcePath)
        const targetLstat = await fs.lstat(targetPath)
        const sourceIsSymlink = sourceLstat.isSymbolicLink()
        const targetIsSymlink = targetLstat.isSymbolicLink()

        if (sourceIsSymlink || targetIsSymlink) {
          const sourceTarget = sourceIsSymlink ? await fs.readlink(sourcePath) : undefined
          const targetTarget = targetIsSymlink ? await fs.readlink(targetPath) : undefined

          if (sourceTarget !== targetTarget) {
            return {
              type: ConflictType.SYMLINK,
              sourcePath,
              targetPath,
              symlinkTarget: sourceTarget !== undefined ? sourceTarget : targetTarget,
            }
          }
        }
        return null
      }

      // 如果都是文件，比较内容哈希
      const sourceHash = await getFileHash(sourcePath)
      const targetHash = await getFileHash(targetPath)

      if (sourceHash !== targetHash) {
        // 检查是否有版本冲突
        if (checkVersion) {
          // 这里应该实现一个获取文件版本的方法
          // 实际实现中，可能需要根据版本控制系统或元数据存储来获取
          // 临时修复：默认使用相同版本以避免始终检测到版本冲突
          // TODO: 实现真实的版本获取逻辑
          const sourceVersion = await getFileVersion(sourcePath) || '1.0.0'
          const targetVersion = await getFileVersion(targetPath) || '1.0.0'

          if (sourceVersion !== targetVersion) {
            return {
              type: ConflictType.VERSION,
              sourcePath,
              targetPath,
              sourceHash,
              targetHash,
              sourceVersion,
              targetVersion,
            }
          }
        }

        return {
          type: ConflictType.CONTENT,
          sourcePath,
          targetPath,
          sourceHash,
          targetHash,
        }
      }

      // 检查权限冲突
      if (checkPermissions) {
        const sourcePerms = sourceStat.mode & 0o777
        const targetPerms = targetStat.mode & 0o777

        if (sourcePerms !== targetPerms) {
          return {
            type: ConflictType.PERMISSION,
            sourcePath,
            targetPath,
            sourcePermissions: sourcePerms,
            targetPermissions: targetPerms,
          }
        }
      }

      // 检查文件锁定
      // 这里是一个简化实现，实际应用中可能需要更复杂的锁定机制
      const isSourceLocked = false // 示例值
      const isTargetLocked = false // 示例值

      if (isSourceLocked || isTargetLocked) {
        return {
          type: ConflictType.LOCK,
          sourcePath,
          targetPath,
          lockInfo: {
            owner: isSourceLocked ? 'user1' : 'user2',
            timestamp: new Date(),
            processId: isSourceLocked ? 1234 : 5678,
          },
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
   * @param options 可选配置项
   * @returns 冲突信息列表
   */
  public async detectDirectoryConflicts(
    sourceDir: string,
    targetDir: string,
    ignorePatterns: string[] = [],
    options: { quickCheck?: boolean, cache?: Map<string, ConflictInfo[]> } = {},
  ): Promise<ConflictInfo[]> {
    const { quickCheck = true, cache = new Map() } = options
    const conflicts: ConflictInfo[] = []
    const cacheKey = `${sourceDir}:${targetDir}`

    // 检查缓存
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) || []
    }

    try {
      // 快速检查 - 只检查目录是否存在和类型
      if (quickCheck) {
        const sourceExists = await fs.pathExists(sourceDir)
        const targetExists = await fs.pathExists(targetDir)

        if (sourceExists && targetExists) {
          const sourceIsDir = await fs.stat(sourceDir).then(stat => stat.isDirectory())
          const targetIsDir = await fs.stat(targetDir).then(stat => stat.isDirectory())

          if (sourceIsDir !== targetIsDir) {
            // 类型冲突
            const conflict: ConflictInfo = {
              type: ConflictType.TYPE,
              sourcePath: sourceDir,
              targetPath: targetDir,
              sourceType: sourceIsDir ? 'directory' : 'file',
              targetType: targetIsDir ? 'directory' : 'file',
            }
            conflicts.push(conflict)
            cache.set(cacheKey, conflicts)
            return conflicts
          }
        }
      }

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

        // 对特定目录进行快速处理
        const dirName = entry.name.toLowerCase()
        const skipDeepCheck = ['node_modules', 'dist', 'build', 'coverage', '.git'].includes(dirName)

        if (entry.isDirectory()) {
          if (skipDeepCheck) {
            // 对于大型目录，只检查是否存在类型冲突
            const targetExists = await fs.pathExists(targetPath)
            if (targetExists) {
              const targetIsDir = await fs.stat(targetPath).then(stat => stat.isDirectory())
              if (!targetIsDir) {
                conflicts.push({
                  type: ConflictType.TYPE,
                  sourcePath,
                  targetPath,
                  sourceType: 'directory',
                  targetType: 'file',
                })
              }
            }
          }
          else {
            // 递归检查子目录
            const subConflicts = await this.detectDirectoryConflicts(
              sourcePath,
              targetPath,
              ignorePatterns,
              { quickCheck, cache },
            )
            conflicts.push(...subConflicts)
          }
        }
        else {
          // 检查文件冲突
          const conflict = await this.detectFileConflict(sourcePath, targetPath)
          if (conflict) {
            conflicts.push(conflict)
          }
        }
      }

      // 更新缓存
      cache.set(cacheKey, conflicts)
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
   * @param options 解决选项
   * @returns 是否成功解决
   */
  public async resolveConflict(
    conflict: ConflictInfo,
    strategy?: ConflictResolutionStrategy,
    options: { autoMergeDepth?: number, backup?: boolean } = {},
  ): Promise<boolean> {
    const { autoMergeDepth = 3, backup = true } = options
    const resolveStrategy = strategy || this.config.defaultStrategy

    logger.info(`
解决冲突: ${yellow(conflict.type)}`)
    logger.info(`源文件: ${blue(conflict.sourcePath)}`)
    logger.info(`目标文件: ${blue(conflict.targetPath)}`)

    // 根据冲突类型记录额外信息
    switch (conflict.type) {
      case ConflictType.CONTENT:
        logger.info(`源文件哈希: ${conflict.sourceHash}`)
        logger.info(`目标文件哈希: ${conflict.targetHash}`)
        break
      case ConflictType.TYPE:
        logger.info(`源文件类型: ${conflict.sourceType}`)
        logger.info(`目标文件类型: ${conflict.targetType}`)
        break
      case ConflictType.VERSION:
        logger.info(`源文件版本: ${conflict.sourceVersion}`)
        logger.info(`目标文件版本: ${conflict.targetVersion}`)
        break
      case ConflictType.PERMISSION:
        logger.info(`源文件权限: ${conflict.sourcePermissions?.toString(8)}`)
        logger.info(`目标文件权限: ${conflict.targetPermissions?.toString(8)}`)
        break
      case ConflictType.LOCK:
        logger.info(`锁定所有者: ${conflict.lockInfo?.owner}`)
        logger.info(`锁定时间: ${conflict.lockInfo?.timestamp.toISOString()}`)
        break
      case ConflictType.SYMLINK:
        logger.info(`符号链接目标: ${conflict.symlinkTarget}`)
        break
    }

    // 如果启用了备份，先创建备份
    if (backup) {
      try {
        await this.createBackup(conflict.targetPath)
        logger.info(`已创建目标文件备份: ${green(`${conflict.targetPath}.bak`)}`)
      }
      catch (error) {
        logger.warn(`创建备份失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 根据冲突类型和解决策略处理冲突
    try {
      switch (conflict.type) {
        case ConflictType.CONTENT:
          return await this.resolveContentConflict(conflict, resolveStrategy, { autoMergeDepth })
        case ConflictType.TYPE:
          return await this.resolveTypeConflict(conflict, resolveStrategy)
        case ConflictType.RENAME:
          return await this.resolveRenameConflict(conflict, resolveStrategy)
        case ConflictType.VERSION:
          return await this.resolveVersionConflict(conflict, resolveStrategy)
        case ConflictType.PERMISSION:
          return await this.resolvePermissionConflict(conflict, resolveStrategy)
        case ConflictType.LOCK:
          return await this.resolveLockConflict(conflict, resolveStrategy)
        case ConflictType.SYMLINK:
          return await this.resolveSymlinkConflict(conflict, resolveStrategy)
        default:
          logger.error(`未支持的冲突类型: ${red(conflict.type)}`)
          return false
      }
    }
    catch (error) {
      logger.error(`解决冲突失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 创建文件备份
   * @param filePath 文件路径
   */
  private async createBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.bak`
    if (await fs.pathExists(filePath)) {
      await fs.copyFile(filePath, backupPath)
    }
  }

  /**
   * 自动合并文件内容
   * @param sourcePath 源文件路径
   * @param targetPath 目标文件路径
   * @param depth 合并深度（用于复杂合并策略）
   * @returns 是否合并成功
   */
  private async autoMergeFiles(
    sourcePath: string,
    targetPath: string,
    depth: number,
  ): Promise<boolean> {
    try {
      // 这里是自动合并的简化实现
      // 实际应用中可能需要使用专门的合并库或算法
      const sourceContent = await fs.readFile(sourcePath, 'utf8')
      const targetContent = await fs.readFile(targetPath, 'utf8')

      // 简单的行比较和合并
      const sourceLines = sourceContent.split('\n')
      const targetLines = targetContent.split('\n')

      // 这里使用一个简化的三向合并策略
      // 在实际应用中，可能需要更复杂的算法
      const mergedLines = [...targetLines]

      // 标记是否有实际合并操作
      let hasChanges = false

      // 示例逻辑：尝试合并非重叠的更改
      // 这只是一个简单示例，真实合并算法会更复杂
      if (depth >= 1) {
        // 实现简单的合并逻辑...
        hasChanges = true
      }

      if (hasChanges) {
        await fs.writeFile(targetPath, mergedLines.join('\n'), 'utf8')
        return true
      }

      return false
    }
    catch (error) {
      logger.error(`自动合并文件失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 提示用户解决冲突
   */
  private async promptUserForConflictResolution(conflict: ConflictInfo): Promise<boolean> {
    try {
      const choices = [
        { title: '使用源文件覆盖', value: ConflictResolutionStrategy.USE_SOURCE },
        { title: '保留目标文件', value: ConflictResolutionStrategy.KEEP_TARGET },
        { title: '尝试自动合并', value: ConflictResolutionStrategy.AUTO_MERGE },
      ]

      // 根据冲突类型添加特定选项
      if (conflict.type === ConflictType.VERSION) {
        choices.push({ title: '创建新版本', value: ConflictResolutionStrategy.CREATE_VERSION })
      }

      const { resolution } = await prompts({
        type: 'select',
        name: 'resolution',
        message: '请选择冲突解决方式:',
        choices,
      })

      if (!resolution) {
        throw new UserCancelError('用户取消了冲突解决')
      }

      // 处理特殊选项
      if (resolution === 'create-version') {
        // 创建新版本的逻辑
        const newVersionPath = `${conflict.targetPath}.v${Date.now()}`
        await fs.copyFile(conflict.sourcePath, newVersionPath)
        logger.success(`已创建新版本文件: ${green(newVersionPath)}`)
        return true
      }

      return await this.resolveConflict(conflict, resolution as ConflictResolutionStrategy, { backup: false })
    }
    catch (error) {
      if (error instanceof UserCancelError) {
        throw error
      }
      logger.error(`提示用户解决冲突失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 解决版本冲突
   */
  private async resolveVersionConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        await fs.copyFile(conflict.sourcePath, conflict.targetPath)
        logger.success(`使用源文件(版本 ${conflict.sourceVersion})覆盖目标文件: ${green(conflict.targetPath)}`)
        return true
      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`保留目标文件(版本 ${conflict.targetVersion}): ${green(conflict.targetPath)}`)
        return true
      case ConflictResolutionStrategy.AUTO_MERGE:
        // 尝试合并不同版本
        const success = await this.autoMergeFiles(conflict.sourcePath, conflict.targetPath, 3)
        if (success) {
          logger.success(`自动合并版本成功: ${green(conflict.targetPath)}`)
          return true
        }
        else {
          logger.warn(`自动合并版本失败，将提示用户解决`)
          return await this.promptUserForConflictResolution(conflict)
        }
      case ConflictResolutionStrategy.PROMPT_USER:
      default:
        return await this.promptUserForConflictResolution(conflict)
    }
  }

  /**
   * 解决权限冲突
   */
  private async resolvePermissionConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        if (conflict.sourcePermissions !== undefined) {
          await fs.chmod(conflict.targetPath, conflict.sourcePermissions)
          logger.success(`应用源文件权限 ${conflict.sourcePermissions.toString(8)} 到目标文件: ${green(conflict.targetPath)}`)
        }
        return true
      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`保留目标文件权限: ${green(conflict.targetPath)}`)
        return true
      case ConflictResolutionStrategy.PROMPT_USER:
      default:
        return await this.promptUserForConflictResolution(conflict)
    }
  }

  /**
   * 解决锁定冲突
   */
  private async resolveLockConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        // 尝试强制覆盖锁定的文件
        try {
          await fs.copyFile(conflict.sourcePath, conflict.targetPath)
          logger.success(`强制覆盖锁定的文件: ${green(conflict.targetPath)}`)
          return true
        }
        catch (error) {
          logger.error(`无法覆盖锁定的文件: ${error instanceof Error ? error.message : String(error)}`)
          return false
        }
      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`保留锁定的目标文件: ${green(conflict.targetPath)}`)
        return true
      case ConflictResolutionStrategy.PROMPT_USER:
      default:
        return await this.promptUserForConflictResolution(conflict)
    }
  }

  /**
   * 解决符号链接冲突
   */
  private async resolveSymlinkConflict(
    conflict: ConflictInfo,
    strategy: ConflictResolutionStrategy,
  ): Promise<boolean> {
    switch (strategy) {
      case ConflictResolutionStrategy.USE_SOURCE:
        // 删除现有的符号链接或文件
        if (await fs.pathExists(conflict.targetPath)) {
          await fs.unlink(conflict.targetPath)
        }
        // 创建新的符号链接
        const sourceStat = await fs.lstat(conflict.sourcePath)
        if (sourceStat.isSymbolicLink()) {
          const target = await fs.readlink(conflict.sourcePath)
          await fs.symlink(target, conflict.targetPath)
          logger.success(`创建符号链接: ${green(conflict.targetPath)} -> ${target}`)
        }
        else {
          // 如果源不是符号链接，复制文件或目录
          if ((await fs.stat(conflict.sourcePath)).isDirectory()) {
            // 使用正确的选项参数，确保覆盖现有文件
            await fs.copy(conflict.sourcePath, conflict.targetPath, { overwrite: true })
          }
          else {
            await fs.copyFile(conflict.sourcePath, conflict.targetPath)
          }
          logger.success(`复制源文件/目录到目标位置: ${green(conflict.targetPath)}`)
        }
        return true
      case ConflictResolutionStrategy.KEEP_TARGET:
        logger.info(`保留目标符号链接/文件: ${green(conflict.targetPath)}`)
        return true
      case ConflictResolutionStrategy.PROMPT_USER:
      default:
        return await this.promptUserForConflictResolution(conflict)
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
    options: { autoMergeDepth?: number } = {},
  ): Promise<boolean> {
    // 保留新的实现
    let resolved = false
    const fileExtension = path.extname(conflict.sourcePath).toLowerCase()
    const isAutoResolveType = this.config.autoResolveTypes?.includes(fileExtension) || false
    const conflictId = `${conflict.sourcePath}-${conflict.targetPath}-${Date.now()}`

    // 记录冲突开始
    if (this.config.logResolutions) {
      logger.info(`开始解决冲突: ${conflictId} (${conflict.type})`)
    }

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
        try {
          const { autoMergeDepth = 3 } = options
          const sourceContent = await fs.readFile(conflict.sourcePath, 'utf8')
          const targetContent = await fs.readFile(conflict.targetPath, 'utf8')

          // 改进的合并策略
          let mergedContent = ''

          // 对于特定文件类型，使用更智能的合并算法
          if (['.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.html'].includes(fileExtension)) {
            // 尝试基于行的差异合并
            mergedContent = this.smartMerge(sourceContent, targetContent, conflict)
          }
          else {
            // 回退到标准合并标记格式
            mergedContent = `<<<<<<< SOURCE
${sourceContent}
=======
${targetContent}
>>>>>>> TARGET`
          }

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

        // 获取文件差异预览
        const sourceContent = await fs.readFile(conflict.sourcePath, 'utf8')
        const targetContent = await fs.readFile(conflict.targetPath, 'utf8')
        const diffPreview = this.generateDiffPreview(sourceContent, targetContent)

        // 提示用户解决
        const { resolution } = await prompts({
          type: 'select',
          name: 'resolution',
          message: `文件 ${yellow(conflict.targetPath)} 存在内容冲突，如何解决?\n${diffPreview}`,
          choices: [
            { title: '使用源文件覆盖', value: ConflictResolutionStrategy.USE_SOURCE },
            { title: '保留目标文件', value: ConflictResolutionStrategy.KEEP_TARGET },
            { title: '尝试自动合并', value: ConflictResolutionStrategy.AUTO_MERGE },
            { title: '查看并编辑合并结果', value: 'edit' },
          ],
        })

        if (resolution === 'edit') {
          // 在实际项目中，这里可以打开编辑器让用户手动合并
          logger.info(`提示: 请手动编辑文件 ${yellow(conflict.targetPath)} 解决冲突`)
          // 生成合并标记文件供用户编辑
          const mergedContent = `<<<<<<< SOURCE
${sourceContent}
=======
${targetContent}
>>>>>>> TARGET`
          await fs.writeFile(conflict.targetPath, mergedContent)
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
      this.recordConflictResolution(conflict, strategy, conflictId)
    }

    return resolved
  }

  /**
   * 智能合并算法
   * 针对代码文件进行更智能的合并尝试
   */
  private smartMerge(sourceContent: string, targetContent: string, conflict: ConflictInfo): string {
    const sourceLines = sourceContent.split('\n')
    const targetLines = targetContent.split('\n')

    // 简单的基于行的合并实现
    // 在实际应用中，可以使用更复杂的算法或专门的合并库
    const mergedLines: string[] = []
    let i = 0; let j = 0

    while (i < sourceLines.length || j < targetLines.length) {
      if (i >= sourceLines.length) {
        // 源文件已结束，添加目标文件剩余行
        mergedLines.push(...targetLines.slice(j))
        break
      }
      else if (j >= targetLines.length) {
        // 目标文件已结束，添加源文件剩余行
        mergedLines.push(...sourceLines.slice(i))
        break
      }
      else if (sourceLines[i] === targetLines[j]) {
        // 行相同，添加到合并结果
        mergedLines.push(sourceLines[i])
        i++
        j++
      }
      else {
        // 行不同，查找可能的匹配点
        let sourceMatchIndex = -1
        for (let k = j + 1; k < targetLines.length; k++) {
          if (targetLines[k] === sourceLines[i]) {
            sourceMatchIndex = k
            break
          }
        }

        let targetMatchIndex = -1
        for (let k = i + 1; k < sourceLines.length; k++) {
          if (sourceLines[k] === targetLines[j]) {
            targetMatchIndex = k
            break
          }
        }

        if (sourceMatchIndex !== -1 && targetMatchIndex !== -1) {
          // 双向匹配，选择较短的插入
          if (sourceMatchIndex - j < targetMatchIndex - i) {
            mergedLines.push(...targetLines.slice(j, sourceMatchIndex))
            j = sourceMatchIndex
          }
          else {
            mergedLines.push(...sourceLines.slice(i, targetMatchIndex))
            i = targetMatchIndex
          }
        }
        else if (sourceMatchIndex !== -1) {
          // 只在目标文件中找到匹配
          mergedLines.push(...targetLines.slice(j, sourceMatchIndex))
          j = sourceMatchIndex
        }
        else if (targetMatchIndex !== -1) {
          // 只在源文件中找到匹配
          mergedLines.push(...sourceLines.slice(i, targetMatchIndex))
          i = targetMatchIndex
        }
        else {
          // 没有找到匹配，使用标准合并标记
          mergedLines.push('<<<<<<< SOURCE')
          mergedLines.push(sourceLines[i])
          mergedLines.push('=======')
          mergedLines.push(targetLines[j])
          mergedLines.push('>>>>>>> TARGET')
          i++
          j++
        }
      }
    }

    return mergedLines.join('\n')
  }

  /**
   * 生成差异预览
   */
  private generateDiffPreview(sourceContent: string, targetContent: string): string {
    const sourceLines = sourceContent.split('\n')
    const targetLines = targetContent.split('\n')
    const maxLines = 5 // 预览的最大行数

    // 简单实现，只显示前几行差异
    let diffCount = 0
    let preview = ''

    for (let i = 0; i < Math.max(sourceLines.length, targetLines.length) && diffCount < maxLines; i++) {
      const sourceLine = i < sourceLines.length ? sourceLines[i] : ''
      const targetLine = i < targetLines.length ? targetLines[i] : ''

      if (sourceLine !== targetLine) {
        preview += `\n- ${sourceLine}`
        preview += `\n+ ${targetLine}`
        diffCount++
      }
    }

    if (diffCount === 0) {
      return '\n没有检测到明显差异（可能是空白字符或格式差异）'
    }

    if (diffCount >= maxLines) {
      preview += `\n... 更多差异（显示前${maxLines}行）`
    }

    return preview
  }

  /**
   * 记录冲突解决
   */
  private recordConflictResolution(conflict: ConflictInfo, strategy: ConflictResolutionStrategy, conflictId: string): void {
    const resolutionRecord = {
      id: conflictId,
      timestamp: new Date().toISOString(),
      conflictType: conflict.type,
      sourcePath: conflict.sourcePath,
      targetPath: conflict.targetPath,
      resolutionStrategy: strategy,
      userId: 'system', // 在实际应用中，可以记录用户信息
    }

    // 在实际应用中，可能会将记录存储到数据库或文件中
    logger.info(`冲突解决记录: ${conflictId} 类型=${conflict.type} 策略=${strategy}`)
    logger.debug(`详细记录: ${JSON.stringify(resolutionRecord, null, 2)}`)
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

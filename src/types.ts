export interface RetryConfig {
  maxRetries: number
  initialDelay: number
  backoffFactor: number
}

/**
 * 认证类型枚举
 */
export enum AuthType {
  /** SSH 认证 */
  SSH = 'ssh',
  /** 用户名和密码认证 */
  USER_PASS = 'user_pass',
  /** 个人访问令牌认证 */
  PAT = 'pat',
}

/**
 * 认证配置接口
 */
export interface AuthConfig {
  /** 认证类型 */
  type: AuthType
  /** 用户名，用于 USER_PASS 或 PAT 认证 */
  username?: string
  /** 密码，用于 USER_PASS 认证 */
  password?: string
  /** 个人访问令牌，用于 PAT 认证 */
  token?: string
  /** SSH 私钥路径，用于 SSH 认证 */
  privateKeyPath?: string
  /** SSH 私钥密码，如果私钥有密码保护 */
  passphrase?: string
}

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
  /** 版本冲突 */
  VERSION = 'version',
  /** 权限冲突 */
  PERMISSION = 'permission',
  /** 文件锁定冲突 */
  LOCK = 'lock',
  /** 符号链接冲突 */
  SYMLINK = 'symlink',
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
  /** 创建新版本 */
  CREATE_VERSION = 'create-version',
  /** 忽略冲突 */
  IGNORE = 'ignore',

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
 * 分支策略枚举
 */
export enum BranchStrategy {
  /** 基于特性的分支策略 */
  FEATURE = 'feature',
  /** 基于发布的分支策略 */
  RELEASE = 'release',
  /** 基于修复的分支策略 */
  HOTFIX = 'hotfix',
  /** 基于开发的分支策略 */
  DEVELOP = 'develop',
}

/**
 * 分支策略配置接口
 */
export interface BranchStrategyConfig {
  /** 是否启用分支策略自动化 */
  enable: boolean
  /** 分支策略类型 */
  strategy: BranchStrategy
  /** 基础分支名称，用于创建新分支 */
  baseBranch: string
  /** 分支命名模式，支持变量替换 {feature}, {release}, {hotfix}, {date} 等 */
  branchPattern: string
  /** 是否在同步完成后自动切换回原分支 */
  autoSwitchBack: boolean
  /** 自动删除已合并的临时分支 */
  autoDeleteMergedBranches: boolean
}
/**
 * 缓存配置接口
 */
export interface CacheConfig {
  /** 缓存过期时间（毫秒） */
  expiryMs?: number
  /** 最大缓存大小（字节） */
  maxSizeBytes?: number
  /** 是否启用LRU缓存策略 */
  lruEnabled?: boolean
  /** LRU缓存最大条目数 */
  lruMaxEntries?: number
  /** 是否启用缓存压缩 */
  compressEnabled?: boolean
  /** 压缩级别 (1-9) */
  compressionLevel?: number
  /** 启用压缩的最小文件大小（字节） */
  compressionThreshold?: number
}

export interface SyncOptions {
  upstreamRepo: string
  upstreamBranch: string
  companyBranch: string
  syncDirs: string[]
  commitMessage: string
  autoPush: boolean
  forceOverwrite: boolean
  verbose: boolean
  silent: boolean
  dryRun: boolean
  previewOnly: boolean
  nonInteractive: boolean
  concurrencyLimit: number
  retryConfig: RetryConfig
  conflictResolutionConfig: ConflictResolutionConfig
  authConfig?: AuthConfig
  includeFileTypes?: string[]
  branchStrategyConfig?: BranchStrategyConfig
  /** 缓存配置 */
  cacheConfig?: CacheConfig
  /** 是否启用自适应并发 */
  adaptiveConcurrency?: boolean
}

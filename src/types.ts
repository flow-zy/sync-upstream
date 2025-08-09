export interface RetryConfig {
  maxRetries?: number
  initialDelay?: number
  backoffFactor?: number
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

export interface SyncOptions {
  upstreamRepo: string
  upstreamBranch: string
  companyBranch: string
  syncDirs: string[]
  commitMessage: string
  autoPush: boolean
  forceOverwrite?: boolean
  verbose?: boolean
  silent?: boolean
  dryRun?: boolean
  retryConfig?: RetryConfig
  /** 冲突解决配置 */
  conflictResolutionConfig?: ConflictResolutionConfig
  /** 要包含的文件类型列表（如 ['.ts', '.js', '.md']），为空则包含所有文件 */
  includeFileTypes?: string[]
  /** 同步预览功能，在实际同步前展示变更 */
  previewOnly?: boolean
  /** 并行处理的最大文件数量 */
  concurrencyLimit?: number
  /** 认证配置 */
  authConfig?: AuthConfig
}

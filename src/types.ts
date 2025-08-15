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
 * 灰度发布策略枚举
 */
export enum GrayReleaseStrategy {
  /** 按百分比发布 */
  PERCENTAGE = 'percentage',
  /** 按目录发布 */
  DIRECTORY = 'directory',
  /** 按文件发布 */
  FILE = 'file',
}

/**
 * 灰度发布配置接口
 */
export interface GrayReleaseConfig {
  /** 是否启用灰度发布 */
  enable: boolean;
  /** 灰度发布策略 */
  strategy: GrayReleaseStrategy;
  /** 发布百分比 (0-100)，用于 PERCENTAGE 策略 */
  percentage?: number;
  /** 金丝雀目录列表，用于 DIRECTORY 策略 */
  canaryDirs?: string[];
  /** 文件模式列表，用于 FILE 策略 */
  filePatterns?: string[];
  /** 自动验证脚本路径 */
  validationScript?: string;
  /** 验证失败重试次数 */
  maxRetries?: number;
  /** 验证失败是否自动回滚 */
  rollbackOnFailure?: boolean;
  /** 审计日志路径 */
  auditLogPath?: string;
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
  /** 是否启用非交互式模式 */
  nonInteractive?: boolean
  /** 大文件阈值 (字节)，默认 100MB */
  largeFileThreshold?: number
  /** 是否使用 LFS/Git-Annex 处理大文件 */
  useLFS?: boolean
  /** 需要使用 LFS 跟踪的文件模式列表 */
  lfsTrackPatterns?: string[]
  /** 是否启用本地缓存 */
  useCache?: boolean
  /** 缓存目录路径 */
  cacheDir?: string
  /** 缓存过期时间 (天) */
  cacheExpiryDays?: number;
  /** 灰度发布配置 */
  grayRelease?: GrayReleaseConfig;
}

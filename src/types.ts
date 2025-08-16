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
 * 灰度发布配置接口
 */
export interface GrayReleaseConfig {
  /** 是否启用灰度发布 */
  enable: boolean
  /** 灰度发布策略 */
  strategy: GrayReleaseStrategy
  /** 发布百分比 (0-100)，用于 PERCENTAGE 策略 */
  percentage?: number
  /** 金丝雀目录列表，用于 DIRECTORY 策略 */
  canaryDirs?: string[]
  /** 文件模式列表，用于 FILE 策略 */
  filePatterns?: string[]
  /** 自动验证脚本路径 */
  validationScript?: string
  /** 验证失败重试次数 */
  maxRetries?: number
  /** 验证失败是否自动回滚 */
  rollbackOnFailure?: boolean
  /** 审计日志路径 */
  auditLogPath?: string
}

/**
 * Webhook配置接口
 */
export interface WebhookConfig {
  /** 是否启用Webhook */
  enable: boolean
  /** Webhook监听端口 */
  port: number
  /** Webhook路径 */
  path: string
  /** 用于验证Webhook请求的密钥 */
  secret: string
  /** 允许的事件类型列表 */
  allowedEvents: string[]
  /** 触发同步的分支 */
  triggerBranch: string
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
  grayReleaseConfig?: GrayReleaseConfig
  includeFileTypes?: string[]
  branchStrategyConfig?: BranchStrategyConfig
  webhookConfig?: WebhookConfig
  fullRelease?: boolean
  rollback?: boolean
}

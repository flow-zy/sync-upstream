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
 * 灰度发布阶段枚举
 */
export enum GrayReleaseStage {
  /** 准备阶段 */
  PREPARING = 'preparing',
  /** 准备完成阶段 */
  PREPARED = 'prepared',
  /** 文件选择完成阶段 */
  SELECTED = 'selected',
  /** 金丝雀发布阶段 */
  CANARY = 'canary',
  /** 验证阶段 */
  VALIDATING = 'validating',
  /** 全量发布阶段 */
  FULL = 'full',
  /** 发布完成 */
  COMPLETED = 'completed',
  /** 发布失败 */
  FAILED = 'failed',
  /** 已回滚 */
  ROLLED_BACK = 'rolled_back',
  /** 回滚失败 */
  FAILED_TO_ROLLBACK = 'failed_to_rollback',
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
  /** 按用户组发布 */
  USER_GROUP = 'user_group',
  /** 按地区发布 */
  REGION = 'region',
}

/**
 * 用户组接口
 */
export interface UserGroup {
  id: string
  name: string
  members: string[]
}

/**
 * 地区接口
 */
export interface Region {
  id: string
  name: string
  countries: string[]
}

/**
 * 灰度发布状态接口
 */
export interface GrayReleaseStatus {
  /** 当前阶段 */
  stage: GrayReleaseStage
  /** 进度百分比 */
  progress: number
  /** 开始时间 */
  startTime: Date | null
  /** 结束时间 */
  endTime: Date | null
  /** 是否成功 */
  success: boolean
  /** 已发布文件数 */
  filesReleased: number
  /** 总文件数 */
  totalFiles: number
  /** 错误信息列表 */
  errors: string[]
  /** 发布ID */
  releaseId?: string
  /** 关联的用户组（如果使用用户组策略） */
  userGroups?: UserGroup[]
  /** 关联的地区（如果使用地区策略） */
  regions?: Region[]
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
  /** 当前阶段 */
  stage?: GrayReleaseStage
  /** 发布百分比 (0-100)，用于 PERCENTAGE 策略 */
  percentage?: number
  /** 金丝雀目录列表，用于 DIRECTORY 策略 */
  canaryDirs?: string[]
  /** 文件模式列表，用于 FILE 策略 */
  filePatterns?: string[]
  /** 用户组列表，用于 USER_GROUP 策略 */
  userGroups?: string[]
  /** 地区列表，用于 REGION 策略 */
  regions?: string[]
  /** 自动验证脚本路径 */
  validationScript?: string
  /** 验证失败重试次数 */
  maxRetries?: number
  /** 验证失败是否自动回滚 */
  rollbackOnFailure?: boolean
  /** 审计日志路径 */
  auditLogPath?: string
  /** 是否启用监控 */
  enableMonitoring?: boolean
  /** 监控间隔（毫秒） */
  monitorInterval?: number
  /** 告警阈值配置 */
  alertThresholds?: {
    /** 错误率阈值 (%) */
    errorRate?: number
    /** 性能下降阈值 (%) */
    performanceDrop?: number
    /** 最长执行时间 (秒) */
    maxExecutionTime?: number
  }
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
  /** 支持的代码托管平台 */
  supportedPlatforms: ('github' | 'gitlab' | 'bitbucket' | 'gitea')[]
  /** 重试配置 */
  retryConfig?: RetryConfig
  /** 安全配置 */
  securityConfig?: {
    /** IP白名单列表 */
    ipWhitelist: string[]
    /** 请求限流配置 */
    rateLimit: {
      /** 每秒钟允许的最大请求数 */
      maxRequestsPerSecond: number
      /** 超出限制后的响应码 */
      statusCode: number
      /** 超出限制后的响应消息 */
      message: string
    }
  }
  /** 事件过滤配置 */
  eventFilterConfig?: {
    /** 更精细的事件类型过滤规则 */
    rules: Array<{
      /** 事件类型 */
      eventType: string
      /** 触发条件 */
      conditions: Array<{
        /** 字段路径 */
        fieldPath: string
        /** 操作符 */
        operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex'
        /** 值 */
        value: any
      }>
    }>
  }
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
  /** 缓存配置 */
  cacheConfig?: CacheConfig
  /** 是否启用自适应并发 */
  adaptiveConcurrency?: boolean
}

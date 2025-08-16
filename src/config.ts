import type { SyncOptions } from './types'
import path from 'node:path'
import toml from '@iarna/toml'
import fs from 'fs-extra'
import yaml from 'js-yaml'
import json5 from 'json5'
import { logger } from './logger'
import { BranchStrategy, ConflictResolutionStrategy } from './types'

export const DEFAULT_CONFIG: Partial<SyncOptions> = {
  upstreamBranch: 'main',
  companyBranch: 'main',
  commitMessage: 'Sync upstream changes to specified directories',
  autoPush: false,
  forceOverwrite: true,
  verbose: false,
  silent: false,
  dryRun: false,
  previewOnly: false,
  concurrencyLimit: 5,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 2000,
    backoffFactor: 1.5,
  },
  conflictResolutionConfig: {
    defaultStrategy: ConflictResolutionStrategy.PROMPT_USER,
  },
  branchStrategyConfig: {
    enable: false,
    strategy: BranchStrategy.FEATURE,
    baseBranch: 'main',
    branchPattern: 'feature/{name}',
    autoSwitchBack: true,
    autoDeleteMergedBranches: false,
  },
  webhookConfig: {
    enable: false,
    port: 3000,
    path: '/webhook',
    secret: '',
    allowedEvents: ['push'],
    triggerBranch: 'main',
    supportedPlatforms: ['github'],
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffFactor: 2,
    },
    securityConfig: {
      ipWhitelist: [],
      rateLimit: {
        maxRequestsPerSecond: 10,
        statusCode: 429,
        message: 'Too many requests',
      },
    },
    eventFilterConfig: {
      rules: [],
    },
  },
  cacheConfig: {
    expiryMs: 7 * 24 * 60 * 60 * 1000, // 默认7天
    maxSizeBytes: 5 * 1024 * 1024 * 1024, // 默认5GB
    lruEnabled: true,
    lruMaxEntries: 1000,
  },
}

/**
 * 生成默认配置文件
 * @param filePath 配置文件路径
 * @param format 配置文件格式 (json, json5, yaml, toml)
 */
export async function generateDefaultConfig(
  filePath: string,
  format: 'json' | 'json5' | 'yaml' | 'toml' = 'json',
): Promise<void> {
  try {
    let fileContent = ''
    const defaultConfig = { ...DEFAULT_CONFIG }

    switch (format) {
      case 'json5':
        fileContent = json5.stringify(defaultConfig, null, 2)
        break
      case 'yaml':
        fileContent = yaml.dump(defaultConfig)
        break
      case 'toml':
        fileContent = toml.stringify(defaultConfig as any)
        break
      case 'json':
      default:
        fileContent = JSON.stringify(defaultConfig, null, 2)
    }

    // 确保目录存在
    const dirPath = path.dirname(filePath)
    if (!await fs.pathExists(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true })
    }

    await fs.writeFile(filePath, fileContent, 'utf8')
    logger.success(`默认配置已生成到 ${filePath}`)
  }
  catch (error) {
    logger.error('生成默认配置失败', error as Error)
  }
}

/**
 * 验证配置是否有效
 */
const CONFIG_FILES = [
  '.sync-toolrc.json5',
  '.sync-toolrc.json',
  '.sync-toolrc.yaml',
  '.sync-toolrc.yml',
  '.sync-toolrc.toml',
  '.sync-toolrc',
  'sync-tool.config.json5',
  'sync-tool.config.json',
  'sync-tool.config.yaml',
  'sync-tool.config.yml',
  'sync-tool.config.toml',
]

/**
 * 验证配置是否有效
 */
export function validateConfig(config: Partial<SyncOptions>): void {
  // 验证冲突解决策略
  if (config.conflictResolutionConfig?.defaultStrategy) {
    const validStrategies = Object.values(ConflictResolutionStrategy)
    if (!validStrategies.includes(config.conflictResolutionConfig.defaultStrategy)) {
      logger.error('无效的冲突解决策略', undefined, {
        strategy: config.conflictResolutionConfig.defaultStrategy,
        validStrategies,
      })
      throw new Error(`无效的冲突解决策略: ${config.conflictResolutionConfig.defaultStrategy}. 有效策略: ${validStrategies.join(', ')}`)
    }
  }

  // 验证重试配置
  if (config.retryConfig) {
    if (config.retryConfig.maxRetries !== undefined && config.retryConfig.maxRetries < 0) {
      logger.error('最大重试次数不能为负数', undefined, {
        maxRetries: config.retryConfig.maxRetries,
      })
      throw new Error('最大重试次数不能为负数')
    }
    if (config.retryConfig.initialDelay !== undefined && config.retryConfig.initialDelay < 0) {
      logger.error('初始重试延迟不能为负数', undefined, {
        initialDelay: config.retryConfig.initialDelay,
      })
      throw new Error('初始重试延迟不能为负数')
    }
    if (config.retryConfig.backoffFactor !== undefined && config.retryConfig.backoffFactor < 1) {
      logger.error('重试退避因子必须大于或等于1', undefined, {
        backoffFactor: config.retryConfig.backoffFactor,
      })
      throw new Error('重试退避因子必须大于或等于1')
    }
  }

  // 验证并行限制
  if (config.concurrencyLimit !== undefined && config.concurrencyLimit < 1) {
    logger.error('并行处理数量必须大于或等于1', undefined, {
      concurrencyLimit: config.concurrencyLimit,
    })
    throw new Error('并行处理数量必须大于或等于1')
  }

  // 验证分支策略配置
  if (config.branchStrategyConfig) {
    const { branchStrategyConfig } = config

    // 验证策略类型
    const validStrategies = Object.values(BranchStrategy)
    if (!validStrategies.includes(branchStrategyConfig.strategy)) {
      logger.error('无效的分支策略', undefined, {
        strategy: branchStrategyConfig.strategy,
        validStrategies,
      })
      throw new Error(`无效的分支策略: ${branchStrategyConfig.strategy}. 有效策略: ${validStrategies.join(', ')}`)
    }

    // 验证基础分支
    if (!branchStrategyConfig.baseBranch || branchStrategyConfig.baseBranch.trim() === '') {
      logger.error('基础分支名称不能为空', undefined, {
        baseBranch: branchStrategyConfig.baseBranch,
      })
      throw new Error('基础分支名称不能为空')
    }

    // 验证分支命名模式
    if (!branchStrategyConfig.branchPattern || branchStrategyConfig.branchPattern.trim() === '') {
      logger.error('分支命名模式不能为空', undefined, {
        branchPattern: branchStrategyConfig.branchPattern,
      })
      throw new Error('分支命名模式不能为空')
    }
  }

  // 验证缓存配置
  if (config.cacheConfig) {
    const { cacheConfig } = config

    // 验证过期时间
    if (cacheConfig.expiryMs !== undefined && cacheConfig.expiryMs < 0) {
      logger.error('缓存过期时间不能为负数', undefined, {
        expiryMs: cacheConfig.expiryMs,
      })
      throw new Error('缓存过期时间不能为负数')
    }

    // 验证最大缓存大小
    if (cacheConfig.maxSizeBytes !== undefined && cacheConfig.maxSizeBytes < 0) {
      logger.error('最大缓存大小不能为负数', undefined, {
        maxSizeBytes: cacheConfig.maxSizeBytes,
      })
      throw new Error('最大缓存大小不能为负数')
    }

    // 验证LRU最大条目数
    if (cacheConfig.lruMaxEntries !== undefined && cacheConfig.lruMaxEntries < 1) {
      logger.error('LRU最大条目数必须大于或等于1', undefined, {
        lruMaxEntries: cacheConfig.lruMaxEntries,
      })
      throw new Error('LRU最大条目数必须大于或等于1')
    }
  }
}

/**
 * 查找并加载配置文件
 */
export async function loadConfig(): Promise<Partial<SyncOptions>> {
  // 检查当前目录是否有配置文件
  for (const filename of CONFIG_FILES) {
    const configPath = path.join(process.cwd(), filename)
    if (await fs.pathExists(configPath)) {
      logger.trace(`找到配置文件: ${filename}`)
      try {
        const fileContent = await fs.readFile(configPath, 'utf8')
        let config: Partial<SyncOptions> = {}

        // 根据文件扩展名选择解析方法
        if (filename.endsWith('.json5')) {
          logger.trace(`解析JSON5配置文件: ${filename}`)
          config = json5.parse(fileContent)
        }
        else if (filename.endsWith('.json')) {
          logger.trace(`解析JSON配置文件: ${filename}`)
          config = JSON.parse(fileContent)
        }
        else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
          logger.trace(`解析YAML配置文件: ${filename}`)
          config = yaml.load(fileContent) as Partial<SyncOptions>
        }
        else if (filename.endsWith('.toml')) {
          logger.trace(`解析TOML配置文件: ${filename}`)
          config = toml.parse(fileContent) as Partial<SyncOptions>
        }
        else {
          // 尝试作为JSON解析（保持向后兼容）
          logger.trace(`尝试作为JSON解析配置文件: ${filename}`)
          config = JSON.parse(fileContent)
        }

        // 验证配置
        validateConfig(config)
        logger.debug(`配置文件 ${filename} 加载成功`)
        return { ...DEFAULT_CONFIG, ...config }
      }
      catch (error) {
        logger.error(`读取配置文件 ${filename} 失败`, error as Error)
      }
    }
  }

  logger.debug('未找到配置文件，使用默认配置')

  return DEFAULT_CONFIG
}

/**
 * 保存配置到文件
 * @param config 配置对象
 * @param format 保存格式，可选值: 'json', 'yaml', 'toml'，默认为 'json'
 */
export async function saveConfig(config: Partial<SyncOptions>, format: 'json' | 'yaml' | 'toml' = 'json'): Promise<void> {
  let configPath: string
  let fileContent: string

  switch (format) {
    case 'yaml':
      configPath = path.join(process.cwd(), '.sync-toolrc.yaml')
      fileContent = yaml.dump(config)
      break
    case 'toml':
      configPath = path.join(process.cwd(), '.sync-toolrc.toml')
      fileContent = toml.stringify(config as any)
      break
    case 'json':
    default:
      configPath = path.join(process.cwd(), '.sync-toolrc.json')
      fileContent = JSON.stringify(config, null, 2)
      break
  }

  try {
    await fs.writeFile(configPath, fileContent, 'utf8')
    logger.success(`配置已保存到 ${configPath}`)
  }
  catch (error) {
    logger.error('保存配置失败', error as Error)
  }
}

import type { SyncOptions } from './types'
import path from 'node:path'
import toml from '@iarna/toml'
// src/config.ts
import fs from 'fs-extra'
import yaml from 'js-yaml'

const DEFAULT_CONFIG: Partial<SyncOptions> = {
  upstreamBranch: 'main',
  companyBranch: 'main',
  commitMessage: 'Sync upstream changes to specified directories',
  autoPush: false,
  forceOverwrite: true,
  verbose: false,
  silent: false,
  dryRun: false,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 2000,
    backoffFactor: 1.5,
  },
}

const CONFIG_FILES = [
  '.sync-toolrc.json',
  '.sync-toolrc.yaml',
  '.sync-toolrc.yml',
  '.sync-toolrc.toml',
  '.sync-toolrc',
  'sync-tool.config.json',
  'sync-tool.config.yaml',
  'sync-tool.config.yml',
  'sync-tool.config.toml',
]

/**
 * 查找并加载配置文件
 */
export async function loadConfig(): Promise<Partial<SyncOptions>> {
  // 检查当前目录是否有配置文件
  for (const filename of CONFIG_FILES) {
    const configPath = path.join(process.cwd(), filename)
    if (await fs.pathExists(configPath)) {
      try {
        const fileContent = await fs.readFile(configPath, 'utf8')
        let config: Partial<SyncOptions> = {}

        // 根据文件扩展名选择解析方法
        if (filename.endsWith('.json')) {
          config = JSON.parse(fileContent)
        }
        else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
          config = yaml.load(fileContent) as Partial<SyncOptions>
        }
        else if (filename.endsWith('.toml')) {
          config = toml.parse(fileContent) as Partial<SyncOptions>
        }
        else {
          // 尝试作为JSON解析（保持向后兼容）
          config = JSON.parse(fileContent)
        }

        return { ...DEFAULT_CONFIG, ...config }
      }
      catch (error) {
        console.error(`读取配置文件 ${filename} 失败:`, error)
      }
    }
  }

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
    console.log(`配置已保存到 ${configPath}`)
  }
  catch (error) {
    console.error('保存配置失败:', error)
  }
}

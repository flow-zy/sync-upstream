import type { SyncOptions } from './types'
import path from 'node:path'
// src/config.ts
import fs from 'fs-extra'

const DEFAULT_CONFIG: Partial<SyncOptions> = {
  upstreamBranch: 'main',
  companyBranch: 'main',
  commitMessage: 'Sync upstream changes to specified directories',
  autoPush: false,
}

const CONFIG_FILES = ['.sync-toolrc.json', '.sync-toolrc', 'sync-tool.config.json']

/**
 * 查找并加载配置文件
 */
export async function loadConfig(): Promise<Partial<SyncOptions>> {
  // 检查当前目录是否有配置文件
  for (const filename of CONFIG_FILES) {
    const configPath = path.join(process.cwd(), filename)
    if (await fs.pathExists(configPath)) {
      try {
        const config = await fs.readJSON(configPath)
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
 */
export async function saveConfig(config: Partial<SyncOptions>): Promise<void> {
  const configPath = path.join(process.cwd(), '.sync-toolrc.json')
  try {
    await fs.writeJSON(configPath, config, { spaces: 2 })
    console.log(`配置已保存到 ${configPath}`)
  }
  catch (error) {
    console.error('保存配置失败:', error)
  }
}

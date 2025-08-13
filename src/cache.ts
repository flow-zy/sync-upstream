import type { RetryConfig } from './types'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'
import { logger } from './logger'
import { withRetry } from './retry'

// 缓存目录
const CACHE_DIR = path.join(process.cwd(), '.sync-cache')
// 缓存过期时间 (7天)
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 初始化缓存目录
 */
export async function initializeCache(): Promise<void> {
  try {
    await fs.ensureDir(CACHE_DIR)
    logger.info(`缓存目录已初始化: ${CACHE_DIR}`)
  }
  catch (error) {
    logger.error(`初始化缓存目录失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * 生成缓存键
 * @param url 请求URL
 * @param params 请求参数
 * @returns 缓存键
 */
export function generateCacheKey(url: string, params: Record<string, any> = {}): string {
  // 将参数排序后字符串化，以确保相同参数生成相同的键
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key]
    return acc
  }, {} as Record<string, any>)

  const keyString = `${url}${JSON.stringify(sortedParams)}`
  return crypto.createHash('md5').update(keyString).digest('hex')
}

/**
 * 检查缓存是否存在且有效
 * @param cacheKey 缓存键
 * @returns 缓存是否有效
 */
export async function isCacheValid(cacheKey: string): Promise<boolean> {
  const cachePath = path.join(CACHE_DIR, cacheKey)
  try {
    if (!(await fs.pathExists(cachePath))) {
      return false
    }

    const stats = await fs.stat(cachePath)
    const now = Date.now()

    // 检查缓存是否过期
    if (now - stats.mtimeMs > CACHE_EXPIRY_MS) {
      logger.info(`缓存 ${cacheKey} 已过期，将删除`)
      await fs.remove(cachePath)
      return false
    }

    return true
  }
  catch (error) {
    logger.error(`检查缓存有效性失败: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * 从缓存中获取数据
 * @param cacheKey 缓存键
 * @returns 缓存的数据，如果缓存不存在或无效则返回null
 */
export async function getFromCache(cacheKey: string): Promise<Buffer | null> {
  try {
    if (!(await isCacheValid(cacheKey))) {
      return null
    }

    const cachePath = path.join(CACHE_DIR, cacheKey)
    const data = await fs.readFile(cachePath)
    logger.info(`从缓存获取数据: ${cacheKey}`)
    return data
  }
  catch (error) {
    logger.error(`从缓存读取数据失败: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * 将数据写入缓存
 * @param cacheKey 缓存键
 * @param data 要缓存的数据
 * @param retryConfig 重试配置
 */
export async function writeToCache(
  cacheKey: string,
  data: Buffer,
  retryConfig?: RetryConfig,
): Promise<void> {
  try {
    const cachePath = path.join(CACHE_DIR, cacheKey)

    await withRetry(
      async () => {
        await fs.writeFile(cachePath, data)
        logger.info(`数据已写入缓存: ${cacheKey}`)
      },
      retryConfig || { maxRetries: 3, initialDelay: 1000, backoffFactor: 2 },
    )
  }
  catch (error) {
    logger.error(`写入缓存失败: ${error instanceof Error ? error.message : String(error)}`)
    // 缓存失败不应阻止主流程
  }
}

/**
 * 清理过期缓存
 */
export async function cleanupExpiredCache(): Promise<void> {
  try {
    if (!(await fs.pathExists(CACHE_DIR))) {
      logger.info('缓存目录不存在，跳过清理')
      return
    }

    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true })
    const now = Date.now()
    let deletedCount = 0

    for (const entry of entries) {
      if (entry.isFile()) {
        const entryPath = path.join(CACHE_DIR, entry.name)
        const stats = await fs.stat(entryPath)

        if (now - stats.mtimeMs > CACHE_EXPIRY_MS) {
          await fs.remove(entryPath)
          deletedCount++
          logger.debug(`已删除过期缓存: ${entry.name}`)
        }
      }
    }

    logger.info(`已清理 ${deletedCount} 个过期缓存文件`)
  }
  catch (error) {
    logger.error(`清理过期缓存失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 缓存代理请求
 * @param url 请求URL
 * @param fetchFunction 获取数据的函数
 * @param params 请求参数
 * @param retryConfig 重试配置
 * @returns 请求的数据
 */
export async function cachedFetch(
  url: string,
  fetchFunction: () => Promise<Buffer>,
  params: Record<string, any> = {},
  retryConfig?: RetryConfig,
): Promise<Buffer> {
  try {
    // 确保缓存目录已初始化
    await initializeCache()

    // 生成缓存键
    const cacheKey = generateCacheKey(url, params)

    // 尝试从缓存获取
    const cachedData = await getFromCache(cacheKey)
    if (cachedData) {
      return cachedData
    }

    // 缓存未命中，获取数据
    logger.info(`缓存未命中，从源获取数据: ${url}`)
    const data = await fetchFunction()

    // 写入缓存
    await writeToCache(cacheKey, data, retryConfig)

    return data
  }
  catch (error) {
    logger.error(`缓存代理请求失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

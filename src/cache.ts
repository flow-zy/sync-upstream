import type { RetryConfig } from './types'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'
import { loadConfig } from './config'
import { logger } from './logger'
import { withRetry } from './retry'

// 缓存目录
const CACHE_DIR = path.join(process.cwd(), '.sync-cache')
// 缓存的配置
let cachedConfig: any = null

// 默认缓存配置
const DEFAULT_CACHE_CONFIG = {
  expiryMs: 7 * 24 * 60 * 60 * 1000, // 7天
  maxSizeBytes: 5 * 1024 * 1024 * 1024, // 5GB
  lruEnabled: true,
  lruMaxEntries: 1000,
  // 按内容类型设置的过期时间（毫秒）
  typeBasedExpiry: {
    html: 60 * 60 * 1000, // 1小时
    json: 24 * 60 * 60 * 1000, // 1天
    binary: 7 * 24 * 60 * 60 * 1000, // 7天
    image: 30 * 24 * 60 * 60 * 1000, // 30天
  },
  // 缓存键前缀，用于多项目共享缓存
  keyPrefix: '',
}

// 缓存元数据文件
const CACHE_METADATA_FILE = path.join(CACHE_DIR, 'metadata.json')

// 缓存统计信息
let cacheStats = {
  hits: 0,
  misses: 0,
  totalSize: 0,
}

// 缓存LRU映射
let lruMap: Map<string, number> = new Map()

/**
 * 获取缓存配置
 */
function getCacheConfig() {
  if (!cachedConfig) {
    logger.warn('缓存配置尚未初始化，使用默认配置')
    return DEFAULT_CACHE_CONFIG
  }
  const userConfig = cachedConfig.cache || {}
  return {
    ...DEFAULT_CACHE_CONFIG,
    ...userConfig,
  }
}

/**
 * 保存缓存元数据
 */
async function saveCacheMetadata() {
  try {
    const metadata = {
      stats: cacheStats,
      lruMap: Object.fromEntries(lruMap),
      timestamp: Date.now(),
    }
    await fs.writeFile(CACHE_METADATA_FILE, JSON.stringify(metadata, null, 2))
  }
  catch (error) {
    logger.error(`保存缓存元数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 加载缓存元数据
 */
async function loadCacheMetadata() {
  try {
    if (await fs.pathExists(CACHE_METADATA_FILE)) {
      const data = await fs.readFile(CACHE_METADATA_FILE, 'utf8')
      const metadata = JSON.parse(data)
      cacheStats = metadata.stats || cacheStats
      lruMap = new Map(Object.entries(metadata.lruMap || {}))
      logger.info('缓存元数据已加载')
    }
  }
  catch (error) {
    logger.error(`加载缓存元数据失败: ${error instanceof Error ? error.message : String(error)}`)
    // 加载失败时使用默认值
    cacheStats = {
      hits: 0,
      misses: 0,
      totalSize: 0,
    }
    lruMap = new Map()
  }
}

/**
 * 初始化缓存目录
 */
export async function initializeCache(): Promise<void> {
  try {
    // 加载配置
    cachedConfig = await loadConfig()
    logger.info('配置已加载')

    await fs.ensureDir(CACHE_DIR)
    logger.info(`缓存目录已初始化: ${CACHE_DIR}`)
    await loadCacheMetadata()
    // 启动时清理过期缓存
    await cleanupExpiredCache()
    // 检查缓存大小限制
    await checkCacheSizeLimit()
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
 * @param options 可选配置
 * @returns 缓存键
 */
export function generateCacheKey(
  url: string,
  params: Record<string, any> = {},
  options: { contentType?: string, customPrefix?: string } = {},
): string {
  // 将参数排序后字符串化，以确保相同参数生成相同的键
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key]
    return acc
  }, {} as Record<string, any>)

  // 构建键字符串
  let keyString = `${url}${JSON.stringify(sortedParams)}`

  // 如果提供了内容类型，添加到键中
  if (options.contentType) {
    keyString += `|type:${options.contentType}`
  }

  // 计算哈希
  const hash = crypto.createHash('md5').update(keyString).digest('hex')

  // 获取配置中的前缀
  const config = getCacheConfig()
  const prefix = options.customPrefix || config.keyPrefix

  // 返回带前缀的缓存键
  return prefix ? `${prefix}:${hash}` : hash
}

/**
 * 更新LRU映射
 * @param cacheKey 缓存键
 */
function updateLruMap(cacheKey: string) {
  const config = getCacheConfig()
  if (!config.lruEnabled)
    return

  // 移除旧条目（如果存在）
  lruMap.delete(cacheKey)
  // 添加新条目，使用当前时间戳作为值
  lruMap.set(cacheKey, Date.now())

  // 如果超过最大条目数，删除最旧的条目
  if (lruMap.size > config.lruMaxEntries) {
    // 找到最旧的条目
    let oldestKey = null
    let oldestTime = Infinity

    for (const [key, time] of lruMap.entries()) {
      if (time < oldestTime) {
        oldestKey = key
        oldestTime = time
      }
    }

    // 删除最旧的条目
    if (oldestKey) {
      lruMap.delete(oldestKey)
      // 异步删除文件，不阻塞主线程
      fs.remove(path.join(CACHE_DIR, oldestKey))
        .catch(error => logger.error(`删除LRU淘汰的缓存文件失败: ${error instanceof Error ? error.message : String(error)}`))
      logger.info(`LRU策略: 已删除最旧的缓存条目 ${oldestKey}`)
    }
  }
}

/**
 * 检查缓存大小限制
 */
async function checkCacheSizeLimit() {
  try {
    const config = getCacheConfig()
    if (config.maxSizeBytes <= 0)
      return

    // 如果总大小已经超过限制，使用LRU策略删除旧条目
    if (cacheStats.totalSize > config.maxSizeBytes) {
      logger.info(`缓存大小 ${formatBytes(cacheStats.totalSize)} 已超过限制 ${formatBytes(config.maxSizeBytes)}，开始清理`)

      // 按访问时间排序LRU映射
      const sortedEntries = Array.from(lruMap.entries()).sort((a, b) => a[1] - b[1])
      let bytesToDelete = cacheStats.totalSize - config.maxSizeBytes

      for (const [key, _] of sortedEntries) {
        if (bytesToDelete <= 0)
          break

        const cachePath = path.join(CACHE_DIR, key)
        if (await fs.pathExists(cachePath)) {
          const stats = await fs.stat(cachePath)
          await fs.remove(cachePath)
          bytesToDelete -= stats.size
          cacheStats.totalSize -= stats.size
          lruMap.delete(key)
          logger.info(`已删除缓存文件 ${key}，释放 ${formatBytes(stats.size)} 空间`)
        }
      }

      logger.info(`缓存清理完成，当前大小: ${formatBytes(cacheStats.totalSize)}`)
    }

    // 保存更新后的元数据
    await saveCacheMetadata()
  }
  catch (error) {
    logger.error(`检查缓存大小限制失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 格式化字节数为人类可读的形式
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

/**
 * 检查缓存是否存在且有效
 * @param cacheKey 缓存键
 * @param options 可选配置，包含contentType用于指定内容类型
 * @returns 缓存是否有效
 */
export async function isCacheValid(
  cacheKey: string,
  options: { contentType?: string } = {}
): Promise<boolean> {
  const cachePath = path.join(CACHE_DIR, cacheKey)
  const config = getCacheConfig()

  try {
    if (!(await fs.pathExists(cachePath))) {
      return false
    }

    const stats = await fs.stat(cachePath)
    const now = Date.now()

    // 确定使用的过期时间
    let expiryMs = config.expiryMs
    const contentType = options.contentType
    
    // 如果提供了内容类型，尝试使用对应的过期时间
    if (contentType && config.typeBasedExpiry) {
      const typeExpiry = config.typeBasedExpiry[contentType]
      if (typeExpiry !== undefined) {
        expiryMs = typeExpiry
        logger.debug(`使用内容类型 ${contentType} 的过期时间: ${expiryMs}ms`)
      }
    }

    // 检查缓存是否过期
    if (now - stats.mtimeMs > expiryMs) {
      logger.info(`缓存 ${cacheKey} 已过期，将删除`)
      await fs.remove(cachePath)
      lruMap.delete(cacheKey)
      cacheStats.totalSize -= stats.size
      await saveCacheMetadata()
      return false
    }

    // 更新LRU映射
    updateLruMap(cacheKey)

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
 * @param options 可选配置，包含contentType用于指定内容类型
 * @returns 缓存的数据，如果缓存不存在或无效则返回null
 */
export async function getFromCache(
  cacheKey: string,
  options: { contentType?: string } = {}
): Promise<Buffer | null> {
  try {
    if (!(await isCacheValid(cacheKey, options))) {
      cacheStats.misses++
      await saveCacheMetadata()
      return null
    }

    const cachePath = path.join(CACHE_DIR, cacheKey)
    const data = await fs.readFile(cachePath)
    cacheStats.hits++
    logger.info(`从缓存获取数据: ${cacheKey} (命中: ${cacheStats.hits}, 未命中: ${cacheStats.misses})`)
    await saveCacheMetadata()
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
    const config = getCacheConfig()

    await withRetry(
      async () => {
        await fs.writeFile(cachePath, data)
        // 更新缓存统计信息
        const stats = await fs.stat(cachePath)
        // 如果是更新现有缓存，先减去旧大小
        if (lruMap.has(cacheKey)) {
          const oldStats = await fs.stat(cachePath)
          cacheStats.totalSize -= oldStats.size
        }
        cacheStats.totalSize += stats.size
        cacheStats.misses++ // 写入缓存通常是因为未命中
        // 更新LRU映射
        updateLruMap(cacheKey)
        logger.info(`数据已写入缓存: ${cacheKey} (大小: ${formatBytes(stats.size)})`)
        // 检查缓存大小限制
        await checkCacheSizeLimit()
        // 保存元数据
        await saveCacheMetadata()
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

    const config = getCacheConfig()
    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true })
    const now = Date.now()
    let deletedCount = 0
    let deletedSize = 0

    for (const entry of entries) {
      // 跳过元数据文件
      if (entry.name === path.basename(CACHE_METADATA_FILE)) {
        continue
      }

      if (entry.isFile()) {
        const entryPath = path.join(CACHE_DIR, entry.name)
        const stats = await fs.stat(entryPath)
        const cacheKey = entry.name

        if (now - stats.mtimeMs > config.expiryMs) {
          await fs.remove(entryPath)
          deletedCount++
          deletedSize += stats.size
          // 更新缓存统计信息
          if (lruMap.has(cacheKey)) {
            lruMap.delete(cacheKey)
            cacheStats.totalSize -= stats.size
          }
          logger.debug(`已删除过期缓存: ${cacheKey} (大小: ${formatBytes(stats.size)})`)
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`已清理 ${deletedCount} 个过期缓存文件，释放 ${formatBytes(deletedSize)} 空间`)
      // 保存更新后的元数据
      await saveCacheMetadata()
    }
    else {
      logger.info('没有过期缓存需要清理')
    }
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
 * @param options 可选配置，包含contentType用于指定内容类型
 * @param retryConfig 重试配置
 * @returns 请求的数据
 */
export async function cachedFetch(
  url: string,
  fetchFunction: () => Promise<Buffer>,
  params: Record<string, any> = {},
  options: { contentType?: string, customPrefix?: string } = {},
  retryConfig?: RetryConfig,
): Promise<Buffer> {
  try {
    // 确保缓存目录已初始化
    await initializeCache()

    // 生成缓存键
    const cacheKey = generateCacheKey(url, params, options)

    // 尝试从缓存获取
    const cachedData = await getFromCache(cacheKey, { contentType: options.contentType })
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

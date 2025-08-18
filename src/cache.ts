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
// 缓存初始化状态
let isCacheInitialized = false
// 缓存预热状态
let isCacheWarmedUp = false
// 缓存统计信息更新时间
let lastStatsUpdateTime = 0
// 缓存清理间隔 (毫秒)
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000 // 5分钟

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
  // 缓存压缩配置
  compressEnabled: true,
  compressionLevel: 6,
  compressionThreshold: 10240, // 10KB
  // 缓存预热配置
  warmupEnabled: false,
  warmupKeys: [],
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
  if (isCacheInitialized) {
    logger.debug('缓存已经初始化，跳过初始化步骤')
    return
  }

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

    // 标记缓存为已初始化
    isCacheInitialized = true

    // 启动定期清理任务
    startPeriodicCleanup()

    // 如果配置了预热，则执行缓存预热
    const config = getCacheConfig()
    if (config.warmupEnabled) {
      logger.info('开始缓存预热...')
      await warmupCache()
    }
  }
  catch (error) {
    logger.error(`初始化缓存目录失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * 启动定期清理任务
 */
function startPeriodicCleanup() {
  setInterval(async () => {
    try {
      logger.debug('执行定期缓存清理...')
      await cleanupExpiredCache()
      await checkCacheSizeLimit()
    }
    catch (error) {
      logger.error(`定期清理缓存失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, CACHE_CLEANUP_INTERVAL)
  logger.info(`定期缓存清理已启动，间隔: ${CACHE_CLEANUP_INTERVAL / 1000 / 60}分钟`)
}

/**
 * 缓存预热
 */
async function warmupCache(): Promise<void> {
  try {
    const config = getCacheConfig()
    const { warmupKeys } = config
    const totalKeys = warmupKeys.length

    if (totalKeys === 0) {
      logger.info('没有配置预热键，跳过缓存预热')
      isCacheWarmedUp = true
      return
    }

    logger.info(`开始缓存预热，共 ${totalKeys} 个键`)
    let successCount = 0
    let failCount = 0

    // 并发预热，但限制并发数
    const concurrencyLimit = Math.min(5, totalKeys)
    const chunks = []
    for (let i = 0; i < totalKeys; i += concurrencyLimit) {
      chunks.push(warmupKeys.slice(i, i + concurrencyLimit))
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (key: string) => {
        try {
          // 这里假设我们有一个函数可以获取要预热的数据
          // 在实际应用中，这可能需要从API、数据库或文件系统获取数据
          logger.debug(`预热缓存键: ${key}`)
          // 注意：这里只是模拟预热过程
          // 实际应用中应该替换为真正的数据源获取逻辑
          const dummyData = Buffer.from(`Warmed up data for key: ${key}`)
          await writeToCache(key, dummyData)
          successCount++
        }
        catch (error) {
          logger.error(`预热缓存键 ${key} 失败: ${error instanceof Error ? error.message : String(error)}`)
          failCount++
        }
      })

      await Promise.all(promises)
    }

    isCacheWarmedUp = true
    logger.success(`缓存预热完成: 成功 ${successCount} 个, 失败 ${failCount} 个`)
  }
  catch (error) {
    logger.error(`缓存预热失败: ${error instanceof Error ? error.message : String(error)}`)
    isCacheWarmedUp = false
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
  options: {
    contentType?: string
    customPrefix?: string
    hashAlgorithm?: 'md5' | 'sha1' | 'sha256'
    includeTimestamp?: boolean
    timestampTtl?: number
  } = {},
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

  // 如果需要包含时间戳，添加到键中
  if (options.includeTimestamp) {
    const ttl = options.timestampTtl || 3600000 // 默认1小时
    const timestamp = Math.floor(Date.now() / ttl) * ttl
    keyString += `|ts:${timestamp}`
  }

  // 计算哈希
  const algorithm = options.hashAlgorithm || 'md5'
  const hash = crypto.createHash(algorithm).update(keyString).digest('hex')

  // 获取配置中的前缀
  const config = getCacheConfig()
  const prefix = options.customPrefix || config.keyPrefix

  // 替换Windows不允许的字符: :, \, /, *, ?, ", <, >, |
  const safePrefix = prefix ? prefix.replace(/[:\\/*?"<>|]/g, '-') : ''

  // 返回带前缀的缓存键，确保不包含Windows保留字符
  return safePrefix ? `${safePrefix}-${algorithm}-${hash}` : `${algorithm}-${hash}`
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
  options: { contentType?: string } = {},
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
 * @param options 可选配置，包含contentType用于指定内容类型和decompress用于控制解压缩
 * @returns 缓存的数据，如果缓存不存在或无效则返回null
 */
export async function getFromCache(
  cacheKey: string,
  options: { contentType?: string, decompress?: boolean } = {},
): Promise<Buffer | null> {
  try {
    if (!(await isCacheValid(cacheKey, options))) {
      cacheStats.misses++
      await updateCacheStats()
      return null
    }

    const cachePath = path.join(CACHE_DIR, cacheKey)
    // 检查是否为压缩数据
    const isCompressed = await fs.pathExists(`${cachePath}.compressed`)
    let data = await fs.readFile(cachePath)

    // 如果是压缩数据且启用了解压缩
    if (isCompressed && options.decompress !== false) {
      try {
        // 动态导入zlib模块
        const zlib = await import('node:zlib')
        // 确保返回非共享的Buffer类型
        const decompressedData = await new Promise<Buffer>((resolve, reject) => {
          zlib.gunzip(data, (err, result) => {
            if (err)
              reject(err)
            else resolve(result)
          })
        })
        data = Buffer.from(decompressedData)
        logger.debug(`缓存数据已解压缩: ${cacheKey}`)
      }
      catch (error) {
        logger.error(`解压缩缓存数据失败: ${error instanceof Error ? error.message : String(error)}`)
        // 解压缩失败，返回原始数据
        return data
      }
    }

    cacheStats.hits++
    logger.info(`从缓存获取数据: ${cacheKey} (命中: ${cacheStats.hits}, 未命中: ${cacheStats.misses})${isCompressed ? ' (已压缩)' : ''}`)
    await updateCacheStats()
    return data
  }
  catch (error) {
    logger.error(`从缓存读取数据失败: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * 更新缓存统计信息
 * 定期写入磁盘，避免频繁IO操作
 */
async function updateCacheStats(): Promise<void> {
  const now = Date.now()
  // 如果距离上次更新已经超过1秒，或者命中/未命中等于0（初始化状态）
  if (now - lastStatsUpdateTime > 1000 || (cacheStats.hits === 0 && cacheStats.misses === 0)) {
    await saveCacheMetadata()
    lastStatsUpdateTime = now
  }
}

/**
 * 将数据写入缓存
 * @param cacheKey 缓存键
 * @param data 要缓存的数据
 * @param retryConfig 重试配置
 * @param options 可选配置
 */
export async function writeToCache(
  cacheKey: string,
  data: Buffer,
  retryConfig?: RetryConfig,
  options: { compress?: boolean, compressionLevel?: number } = {},
): Promise<void> {
  try {
    const cachePath = path.join(CACHE_DIR, cacheKey)
    const config = getCacheConfig()
    const shouldCompress = options.compress !== undefined ? options.compress : config.compressEnabled
    const compressionLevel = options.compressionLevel || config.compressionLevel || 6

    // 准备要写入的数据
    let dataToWrite = data
    let isCompressed = false

    // 如果启用压缩
    if (shouldCompress && data.length > config.compressionThreshold) {
      try {
        // 动态导入zlib模块
        const zlib = await import('node:zlib')
        dataToWrite = await new Promise<Buffer>((resolve, reject) => {
          zlib.gzip(data, { level: compressionLevel }, (err, result) => {
            if (err)
              reject(err)
            else resolve(result)
          })
        })
        isCompressed = true
        logger.debug(`缓存数据已压缩: ${formatBytes(data.length)} -> ${formatBytes(dataToWrite.length)}`)
      }
      catch (error) {
        logger.warn(`压缩缓存数据失败，将使用原始数据: ${error instanceof Error ? error.message : String(error)}`)
        isCompressed = false
      }
    }

    await withRetry(
      async () => {
        // 写入数据
        await fs.writeFile(cachePath, dataToWrite)
        // 写入压缩标志文件
        if (isCompressed) {
          await fs.writeFile(`${cachePath}.compressed`, '1')
        }
        else if (await fs.pathExists(`${cachePath}.compressed`)) {
          await fs.remove(`${cachePath}.compressed`)
        }

        // 更新缓存统计信息
        const stats = await fs.stat(cachePath)
        // 如果是更新现有缓存，先减去旧大小
        if (lruMap.has(cacheKey)) {
          try {
            const oldStats = await fs.stat(cachePath)
            cacheStats.totalSize -= oldStats.size
          }
          catch (error) {
            logger.warn(`获取旧缓存大小失败: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        cacheStats.totalSize += stats.size
        cacheStats.misses++ // 写入缓存通常是因为未命中
        // 更新LRU映射
        updateLruMap(cacheKey)
        logger.info(`数据已写入缓存: ${cacheKey} (大小: ${formatBytes(stats.size)}${isCompressed ? ', 已压缩' : ''})`)
        // 检查缓存大小限制
        await checkCacheSizeLimit()
        // 更新缓存统计信息
        await updateCacheStats()
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

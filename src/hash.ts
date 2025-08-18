import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'
import pLimit from 'p-limit'
import { generateCacheKey, getFromCache, writeToCache } from './cache'
import { normalizePath } from './ignore'
import { Logger } from './logger'
import { withRetry } from './retry'

// 创建logger实例
const logger = new Logger()

// 大文件阈值 (10MB)
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024
// 大文件缓冲区大小 (640KB)
const LARGE_FILE_BUFFER_SIZE = 640 * 1024

/**
 * 计算文件的MD5哈希值
 * @param filePath 文件路径
 * @param options 可选配置项
 * @returns 文件的MD5哈希值
 */
export async function getFileHash(
  filePath: string,
  options: { useCache?: boolean, largeFileBufferSize?: number } = {},
): Promise<string> {
  const { useCache = true, largeFileBufferSize = LARGE_FILE_BUFFER_SIZE } = options

  try {
    // 检查路径是否是文件
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) {
      throw new Error(`路径 ${filePath} 不是文件，无法计算哈希值`)
    }

    // 生成缓存键
    const cacheKey = generateCacheKey('file-hash', { filePath })

    // 尝试从缓存获取
    if (useCache) {
      const cachedHash = await getFromCache(cacheKey)
      if (cachedHash) {
        return cachedHash.toString()
      }
    }

    // 根据文件大小选择不同的处理方式
    if (stats.size > LARGE_FILE_THRESHOLD) {
      // 大文件使用流式处理
      logger.debug(`文件 ${filePath} 大小为 ${(stats.size / 1024 / 1024).toFixed(2)}MB，使用流式处理`)
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5')
        const stream = fs.createReadStream(filePath, { highWaterMark: largeFileBufferSize })

        stream.on('data', (chunk) => {
          hash.update(chunk)
        })

        stream.on('error', (error) => {
          logger.error(`流式读取文件 ${filePath} 时出错:`, error)
          reject(error)
        })

        stream.on('end', () => {
          const result = hash.digest('hex')
          // 写入缓存
          if (useCache) {
            writeToCache(cacheKey, Buffer.from(result)).catch((err) => {
              logger.error(`写入缓存失败:`, err)
            })
          }
          resolve(result)
        })
      })
    }
    else {
      // 小文件直接读取
      const buffer = await fs.readFile(filePath)
      const hash = crypto.createHash('md5').update(buffer).digest('hex')

      // 写入缓存
      if (useCache) {
        await writeToCache(cacheKey, Buffer.from(hash))
      }

      return hash
    }
  }
  catch (error: any) {
    if (error.code === 'EISDIR') {
      logger.error(`错误: 尝试读取目录 ${filePath} 作为文件`)
    }
    else {
      logger.error(`计算文件 ${filePath} 哈希值时出错:`, error.message)
    }
    throw error // 重新抛出错误，确保上层能捕获
  }
}

/**
 * 计算目录中所有文件的哈希值（并行处理）
 * @param dirPath 目录路径
 * @param ignorePatterns 忽略模式列表
 * @param shouldIgnore 忽略函数
 * @param options 可选配置项
 * @returns 文件路径到哈希值的映射
 */
export async function getDirectoryHashes(
  dirPath: string,
  ignorePatterns: string[] = [],
  shouldIgnore: (path: string, patterns: string[]) => boolean,
  options: { parallelLimit?: number, useCache?: boolean, onProgress?: (processed: number, total: number) => void } = {},
): Promise<Record<string, string>> {
  const { parallelLimit = 10, useCache = true, onProgress } = options
  // 使用p-limit控制并行数量
  const limit = pLimit(parallelLimit)

  try {
    // 检查路径是否是目录
    const stats = await fs.stat(dirPath)
    if (!stats.isDirectory()) {
      throw new Error(`路径 ${dirPath} 不是目录，无法计算哈希值`)
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const hashes: Record<string, string> = {}
    const totalEntries = entries.length
    let processedEntries = 0

    // 创建处理条目的任务数组
    const tasks = entries.map(async (entry) => {
      try {
        const entryPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(process.cwd(), entryPath)
        // 规范化路径分隔符，确保在Windows上也能正确匹配
        const normalizedPath = normalizePath(relativePath)

        if (shouldIgnore(normalizedPath, ignorePatterns)) {
          return
        }

        // 先检查条目是否是目录
        if (entry.isDirectory()) {
          const subHashes = await getDirectoryHashes(
            entryPath,
            ignorePatterns,
            shouldIgnore,
            { parallelLimit, useCache },
          )
          Object.assign(hashes, subHashes)
        }
        else {
          // 检查路径是否存在且是文件
          if (await fs.pathExists(entryPath)) {
            const entryStats = await fs.stat(entryPath)
            if (entryStats.isFile()) {
              // 为文件哈希计算添加重试机制
              hashes[relativePath] = await withRetry(
                () => getFileHash(entryPath, { useCache }),
                { maxRetries: 3, initialDelay: 1000, backoffFactor: 2 },
              )
            }
            else {
              logger.warn(`警告: 条目 ${entry.name} 不是文件，跳过`)
            }
          }
          else {
            logger.warn(`警告: 条目 ${entry.name} 不存在，跳过`)
          }
        }
      }
      catch (error: any) {
        logger.error(`处理条目 ${entry.name} 时出错:`, error)
        // 继续处理其他条目，而不是中断整个过程
      }
      finally {
        processedEntries++
        if (onProgress) {
          onProgress(processedEntries, totalEntries)
        }
      }
    })

    // 使用p-limit控制并行执行
    const limitedTasks = tasks.map(task => limit(() => task))

    // 等待所有任务完成
    await Promise.all(limitedTasks)

    return hashes
  }
  catch (error: any) {
    logger.error(`计算目录 ${dirPath} 哈希值时出错:`, error)
    return {}
  }
}

/**
 * 保存哈希值到文件
 * @param filePath 保存哈希值的文件路径
 * @param hashes 哈希值映射
 */
export async function saveHashes(filePath: string, hashes: Record<string, string>): Promise<void> {
  await fs.writeJson(filePath, hashes, { spaces: 2 })
}

/**
 * 从文件加载哈希值
 * @param filePath 哈希值文件路径
 * @returns 哈希值映射，如果文件不存在则返回空对象
 */
export async function loadHashes(filePath: string): Promise<Record<string, string>> {
  if (await fs.pathExists(filePath)) {
    return fs.readJson(filePath)
  }
  return {}
}

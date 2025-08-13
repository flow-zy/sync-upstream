import type { RetryConfig } from './types'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'
import { logger } from './logger'
import { withRetry } from './retry'

// 定义分块大小 (5MB)
const CHUNK_SIZE = 5 * 1024 * 1024

/**
 * 计算文件的SHA-256哈希值
 * @param filePath 文件路径
 * @returns 文件的SHA-256哈希值
 */
export async function getFileSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })

  return new Promise((resolve, reject) => {
    fileStream.on('data', (chunk) => {
      hash.update(chunk)
    })

    fileStream.on('end', () => {
      resolve(hash.digest('hex'))
    })

    fileStream.on('error', (error) => {
      reject(new Error(`计算文件SHA-256哈希值失败: ${error.message}`))
    })
  })
}

/**
 * 分块读取文件
 * @param filePath 文件路径
 * @param onChunk 处理每个块的回调函数
 * @returns 总块数
 */
export async function readFileInChunks(
  filePath: string,
  onChunk: (chunk: Buffer, chunkIndex: number, totalChunks: number) => Promise<void>,
): Promise<number> {
  try {
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) {
      throw new Error(`路径 ${filePath} 不是文件`)
    }

    const fileSize = stats.size
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)
    logger.info(`开始分块读取文件: ${filePath}, 总大小: ${fileSize} 字节, 总块数: ${totalChunks}`)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, fileSize)
      const chunkSize = end - start

      const buffer = Buffer.alloc(chunkSize)
      const fileDescriptor = await fs.open(filePath, 'r')
      try {
        await fs.read(fileDescriptor, buffer, 0, chunkSize, start)
        await onChunk(buffer, i, totalChunks)
        logger.debug(`已读取块 ${i + 1}/${totalChunks}`)
      }
      finally {
        await fs.close(fileDescriptor)
      }
    }

    logger.info(`文件分块读取完成: ${filePath}`)
    return totalChunks
  }
  catch (error) {
    logger.error(`分块读取文件失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * 分块写入文件
 * @param filePath 文件路径
 * @param chunks 块数据数组
 * @param retryConfig 重试配置
 */
export async function writeFileInChunks(
  filePath: string,
  chunks: { index: number, data: Buffer }[],
  retryConfig?: RetryConfig,
): Promise<void> {
  try {
    // 确保目录存在
    await fs.ensureDir(path.dirname(filePath))

    // 按照块索引排序
    chunks.sort((a, b) => a.index - b.index)

    const fileDescriptor = await fs.open(filePath, 'w')
    try {
      for (const chunk of chunks) {
        const position = chunk.index * CHUNK_SIZE
        await withRetry(
          async () => {
            await fs.write(fileDescriptor, chunk.data, 0, chunk.data.length, position)
            logger.debug(`已写入块 ${chunk.index + 1}`)
          },
          retryConfig || { maxRetries: 3, initialDelay: 1000, backoffFactor: 2 },
        )
      }
    }
    finally {
      await fs.close(fileDescriptor)
    }

    logger.info(`文件分块写入完成: ${filePath}`)
  }
  catch (error) {
    logger.error(`分块写入文件失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

/**
 * 检查文件是否为大文件
 * @param filePath 文件路径
 * @param threshold 大文件阈值 (字节)
 * @returns 是否为大文件
 */
export async function isLargeFile(filePath: string, threshold: number = 100 * 1024 * 1024): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile() && stats.size >= threshold
  }
  catch (error) {
    logger.error(`检查文件大小失败: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

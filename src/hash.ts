import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'
import { normalizePath } from './ignore'

/**
 * 计算文件的MD5哈希值
 * @param filePath 文件路径
 * @returns 文件的MD5哈希值
 */
export async function getFileHash(filePath: string): Promise<string> {
  try {
    // 检查路径是否是文件
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) {
      throw new Error(`路径 ${filePath} 不是文件，无法计算哈希值`)
    }

    const buffer = await fs.readFile(filePath)
    return crypto.createHash('md5').update(buffer).digest('hex')
  } catch (error: any) {
    if (error.code === 'EISDIR') {
      console.error(`错误: 尝试读取目录 ${filePath} 作为文件`)
    } else {
      console.error(`计算文件 ${filePath} 哈希值时出错:`, error.message)
    }
    throw error // 重新抛出错误，确保上层能捕获
  }
}

/**
 * 计算目录中所有文件的哈希值
 * @param dirPath 目录路径
 * @param ignorePatterns 忽略模式列表
 * @returns 文件路径到哈希值的映射
 */
export async function getDirectoryHashes(
  dirPath: string,
  ignorePatterns: string[] = [],
  shouldIgnore: (path: string, patterns: string[]) => boolean,
): Promise<Record<string, string>> {
  try {
    const hashes: Record<string, string> = {};
    
    // 检查路径是否是目录
    const stats = await fs.stat(dirPath)
    if (!stats.isDirectory()) {
      throw new Error(`路径 ${dirPath} 不是目录，无法计算哈希值`)
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      try {
        const entryPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(process.cwd(), entryPath)
        // 规范化路径分隔符，确保在Windows上也能正确匹配
        const normalizedPath = normalizePath(relativePath)

        if (shouldIgnore(normalizedPath, ignorePatterns)) {
          continue
        }

        // 先检查条目是否是目录
        if (entry.isDirectory()) {
          const subHashes = await getDirectoryHashes(entryPath, ignorePatterns, shouldIgnore)
          Object.assign(hashes, subHashes)
        }
        else {
          // 额外检查，确保我们不会尝试将目录当作文件处理
          try {
            // 首先检查路径是否存在
            if (!(await fs.pathExists(entryPath))) {
              console.warn(`警告: 条目 ${entry.name} 不存在，跳过`)
              continue
            }
            
            const entryStats = await fs.stat(entryPath)
            if (entryStats.isDirectory()) {
              console.warn(`警告: 条目 ${entry.name} 被识别为文件，但实际是目录，跳过`)
              continue
            }
            
            if (!entryStats.isFile()) {
              console.warn(`警告: 条目 ${entry.name} 既不是文件也不是目录，跳过`)
              continue
            }
            
            hashes[relativePath] = await getFileHash(entryPath)
          } catch (statError: any) {
            console.error(`获取条目 ${entry.name} 状态时出错:`, statError.message)
            continue // 跳过此条目
          }
        }
      } catch (error: any) {
        console.error(`处理条目 ${entry.name} 时出错:`, error.message)
        // 继续处理其他条目，而不是中断整个过程
      }
    }

    return hashes
  } catch (error: any) {
    console.error(`计算目录 ${dirPath} 哈希值时出错:`, error.message)
    // 不再重新抛出错误，避免中断上层调用
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

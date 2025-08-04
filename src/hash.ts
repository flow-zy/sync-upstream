import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'

/**
 * 计算文件的MD5哈希值
 * @param filePath 文件路径
 * @returns 文件的MD5哈希值
 */
export async function getFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  return crypto.createHash('md5').update(buffer).digest('hex')
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
  const hashes: Record<string, string> = {}
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name)
    const relativePath = path.relative(process.cwd(), entryPath)

    if (shouldIgnore(relativePath, ignorePatterns)) {
      continue
    }

    if (entry.isDirectory()) {
      const subHashes = await getDirectoryHashes(entryPath, ignorePatterns, shouldIgnore)
      Object.assign(hashes, subHashes)
    }
    else {
      hashes[relativePath] = await getFileHash(entryPath)
    }
  }

  return hashes
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

import path from 'node:path'
// src/ignore.ts
import fs from 'fs-extra'
import micromatch from 'micromatch'

/**
 * 加载忽略模式
 */
export async function loadIgnorePatterns(baseDir: string): Promise<string[]> {
  const ignoreFile = path.join(baseDir, '.syncignore')
  if (await fs.pathExists(ignoreFile)) {
    try {
      const content = await fs.readFile(ignoreFile, 'utf8')
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
    }
    catch (error) {
      console.error('读取 .syncignore 文件失败:', error)
    }
  }
  return []
}

/**
 * 检查路径是否应该被忽略
 */
export function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  return micromatch.isMatch(filePath, ignorePatterns)
}

// src/ignore.ts
import path from 'node:path'
import fs from 'fs-extra'
import micromatch from 'micromatch'

/**
 * 规范化路径分隔符为正斜杠
 */
export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

/**
 * 加载忽略模式
 */
export async function loadIgnorePatterns(baseDir: string): Promise<string[]> {
  // 默认忽略模式，确保node_modules被排除
  const defaultPatterns = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']

  const ignoreFile = path.join(baseDir, '.syncignore')
  if (await fs.pathExists(ignoreFile)) {
    try {
      const content = await fs.readFile(ignoreFile, 'utf8')
      const filePatterns = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
      // 合并默认模式和文件中的模式
      return [...defaultPatterns, ...filePatterns]
    }
    catch (error) {
      console.error('读取 .syncignore 文件失败:', error)
    }
  }
  return defaultPatterns
}

/**
 * 检查路径是否应该被忽略
 */
export function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  // 规范化路径分隔符，确保在Windows上也能正确匹配
  const normalizedPath = normalizePath(filePath)
  return micromatch.isMatch(normalizedPath, ignorePatterns)
}

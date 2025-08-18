// src/ignore.ts
import path from 'node:path'
import fs from 'fs-extra'
import picomatch from 'picomatch'
import { logger } from './logger'

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
  let patterns = [...defaultPatterns]

  // 加载 .gitignore 文件
  const gitIgnoreFile = path.join(baseDir, '.gitignore')
  if (await fs.pathExists(gitIgnoreFile)) {
    try {
      const content = await fs.readFile(gitIgnoreFile, 'utf8')
      const gitPatterns = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
      patterns = [...patterns, ...gitPatterns]
      logger.debug(`从 .gitignore 加载了 ${gitPatterns.length} 个忽略模式`)
    }
    catch (error) {
      logger.error('读取 .gitignore 文件失败:', error)
    }
  }

  // 加载 .syncignore 文件
  const syncIgnoreFile = path.join(baseDir, '.syncignore')
  if (await fs.pathExists(syncIgnoreFile)) {
    try {
      const content = await fs.readFile(syncIgnoreFile, 'utf8')
      const syncPatterns = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
      patterns = [...patterns, ...syncPatterns]
      logger.debug(`从 .syncignore 加载了 ${syncPatterns.length} 个忽略模式`)
    }
    catch (error) {
      logger.error('读取 .syncignore 文件失败:', error)
    }
  }

  return patterns
}

/**
 * 检查路径是否应该被忽略
 */
export function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  // 规范化路径分隔符，确保在Windows上也能正确匹配
  const normalizedPath = normalizePath(filePath)
  return picomatch.isMatch(normalizedPath, ignorePatterns)
}

import path from 'node:path'
import fs from 'fs-extra'
import { getDirectoryHashes, getFileHash } from '../src/hash'
import { shouldIgnore } from '../src/ignore'

describe('hash.ts', () => {
  describe('getFileHash', () => {
    const testFilePath = path.join(__dirname, 'test-file.txt')

    beforeEach(async () => {
      // 创建测试文件
      await fs.writeFile(testFilePath, 'test content')
    })

    afterEach(async () => {
      // 清理测试文件
      if (await fs.pathExists(testFilePath)) {
        await fs.unlink(testFilePath)
      }
    })

    it('should return correct hash for a file', async () => {
      const hash = await getFileHash(testFilePath)
      expect(hash).toBe('9a0364b9e99bb480dd25e1f0284c8555') // MD5 hash of 'test content'
    })

    it('should throw error for a directory', async () => {
      await expect(getFileHash(__dirname)).rejects.toThrow()
    })
  })

  describe('getDirectoryHashes', () => {
    const testDir = path.join(__dirname, 'test-dir')
    const testFilePath = path.join(testDir, 'test-file.txt')
    const ignoredFilePath = path.join(testDir, 'ignored-file.txt')

    beforeEach(async () => {
      // 创建测试目录和文件
      await fs.ensureDir(testDir)
      await fs.writeFile(testFilePath, 'test content')
      await fs.writeFile(ignoredFilePath, 'ignored content')
    })

    afterEach(async () => {
      // 清理测试目录
      if (await fs.pathExists(testDir)) {
        await fs.remove(testDir)
      }
    })

    it('should return hashes for all files in directory', async () => {
      const hashes = await getDirectoryHashes(testDir, [], shouldIgnore)
      expect(Object.keys(hashes)).toHaveLength(2)
      expect(hashes[path.relative(process.cwd(), testFilePath)]).toBe('9a0364b9e99bb480dd25e1f0284c8555')
      expect(hashes[path.relative(process.cwd(), ignoredFilePath)]).toBe('a1b7d9d5f3f27ff3e43c7b953c81c810')
    })

    it('should ignore files matching ignore patterns', async () => {
      const hashes = await getDirectoryHashes(testDir, ['**/ignored-file.txt'], shouldIgnore)
      expect(Object.keys(hashes)).toHaveLength(1)
      expect(hashes).toHaveProperty(path.relative(process.cwd(), testFilePath))
      expect(hashes).not.toHaveProperty(path.relative(process.cwd(), ignoredFilePath))
    })

    it('should throw error for a non-directory path', async () => {
      await expect(getDirectoryHashes(testFilePath, [], shouldIgnore)).rejects.toThrow()
    })
  })
})

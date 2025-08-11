import path from 'node:path'
import fs from 'fs-extra'
import simpleGit from 'simple-git'
import { isGitRepository } from '../src/cli'

describe('cli.ts', () => {
  describe('isGitRepository', () => {
    const testDir = path.join(__dirname, 'test-git-dir')
    const nonGitDir = path.join(__dirname, 'non-git-dir')

    beforeEach(async () => {
      // 创建测试目录
      await fs.ensureDir(testDir)
      await fs.ensureDir(nonGitDir)

      // 在testDir中初始化Git仓库
      const git = simpleGit(testDir)
      await git.init()
      // 创建一个文件并提交
      const testFilePath = path.join(testDir, 'test-file.txt')
      await fs.writeFile(testFilePath, 'test content')
      await git.add(testFilePath)
      await git.commit('Initial commit')
    })

    afterEach(async () => {
      // 清理测试目录
      if (await fs.pathExists(testDir)) {
        await fs.remove(testDir)
      }
      if (await fs.pathExists(nonGitDir)) {
        await fs.remove(nonGitDir)
      }
    })

    it('should return true for a Git repository directory', async () => {
      // 临时更改工作目录
      const originalCwd = process.cwd()
      process.chdir(testDir)

      try {
        const result = await isGitRepository()
        expect(result).toBe(true)
      }
      finally {
        // 恢复原始工作目录
        process.chdir(originalCwd)
      }
    })

    it('should return false for a non-Git directory', async () => {
      // 临时更改工作目录
      const originalCwd = process.cwd()
      process.chdir(nonGitDir)

      try {
        const result = await isGitRepository()
        expect(result).toBe(false)
      }
      finally {
        // 恢复原始工作目录
        process.chdir(originalCwd)
      }
    })
  })
})

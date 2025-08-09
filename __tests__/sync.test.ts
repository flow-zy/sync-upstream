import fs from 'fs-extra'
import path from 'node:path'
import { UpstreamSyncer } from '../src/sync'
import { SyncOptions, ConflictResolutionStrategy, AuthType, AuthConfig } from '../src/types'
import { logger } from '../src/logger'
import simpleGit from 'simple-git'

// 重置所有模拟
beforeEach(() => {
  jest.clearAllMocks()
})

// 模拟 simple-git
jest.mock('simple-git', () => jest.fn(() => ({
  getRemotes: jest.fn().mockResolvedValue([{ name: 'origin', url: 'https://github.com/user/repo.git' }]),
  remote: jest.fn().mockResolvedValue(undefined),
  addRemote: jest.fn().mockResolvedValue(undefined),
  fetch: jest.fn().mockResolvedValue(undefined),
  checkoutBranch: jest.fn().mockResolvedValue(undefined),
  status: jest.fn().mockResolvedValue({ files: [] }),
  commit: jest.fn().mockResolvedValue(undefined),
  push: jest.fn().mockResolvedValue(undefined),
  checkout: jest.fn().mockResolvedValue(undefined),
  deleteLocalBranch: jest.fn().mockResolvedValue(undefined),
})))

// 模拟 fs-extra
jest.mock('fs-extra', () => ({
  ensureDir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  pathExists: jest.fn().mockResolvedValue(true),
  copyFile: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
}))

// 模拟其他依赖
jest.mock('../src/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    step: jest.fn(),
    setLevel: jest.fn(),
  },
  LogLevel: {
    VERBOSE: 'verbose',
    ERROR: 'error',
  },
}))

jest.mock('../src/hash', () => ({
  getDirectoryHashes: jest.fn().mockResolvedValue({}),
  loadHashes: jest.fn().mockResolvedValue({}),
  saveHashes: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/ignore', () => ({
  loadIgnorePatterns: jest.fn().mockResolvedValue([]),
  shouldIgnore: jest.fn().mockReturnValue(false),
}))

jest.mock('../src/conflict', () => ({
  ConflictResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue('use-source'),
  })),
  ConflictResolutionStrategy,
}))

jest.mock('../src/retry', () => ({
  withRetry: jest.fn().mockImplementation((fn) => fn()),
}))

jest.mock('../src/prompts', () => ({
  displaySummary: jest.fn(),
}))

const mockOptions: SyncOptions = {
  upstreamRepo: 'https://github.com/open-source/project.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src/core', 'docs'],
  commitMessage: 'Sync upstream changes',
  autoPush: false,
  previewOnly: false,
  concurrencyLimit: 5,
  conflictResolutionConfig: {
    defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,
  },
}

describe('UpstreamSyncer', () => {
  let syncer: UpstreamSyncer

  beforeEach(() => {
    syncer = new UpstreamSyncer(mockOptions)
  })

  describe('constructor', () => {
    it('should initialize with correct options', () => {
      expect(syncer).toBeDefined()
      // 访问私有属性进行测试
      // @ts-expect-error - accessing private property
      expect(syncer.options).toEqual(mockOptions)
      // @ts-expect-error - accessing private property
      expect(syncer.concurrencyLimit).toBe(5)
      // @ts-expect-error - accessing private property
      expect(syncer.forceOverwrite).toBe(false)
    })

    it('should initialize with authentication config if provided', () => {
      const authConfig: AuthConfig = {
        type: AuthType.USER_PASS,
        username: 'testuser',
        password: 'testpass',
      }

      const optionsWithAuth = { ...mockOptions, authConfig }
      const syncerWithAuth = new UpstreamSyncer(optionsWithAuth)

      // @ts-expect-error - accessing private property
      expect(syncerWithAuth.options.authConfig).toEqual(authConfig)
    })
  })

  describe('setupUpstream', () => {
    it('should add upstream remote if it does not exist', async () => {
      const gitInstance = simpleGit()
      // @ts-expect-error - accessing private property
      (syncer.git as unknown) = gitInstance

      // 模拟 getRemotes 返回没有 upstream 的结果
      (gitInstance.getRemotes as jest.Mock).mockResolvedValueOnce([{ name: 'origin', url: 'https://github.com/user/repo.git' }])

      await syncer['setupUpstream']()

      expect(gitInstance.addRemote).toHaveBeenCalledWith('upstream', mockOptions.upstreamRepo)
      expect(logger.info).toHaveBeenCalledWith(`添加上游仓库: ${mockOptions.upstreamRepo}`)
      expect(logger.success).toHaveBeenCalledWith('上游仓库配置完成')
    })

    it('should update upstream remote URL if it exists', async () => {
      const gitInstance = simpleGit()
      // @ts-expect-error - accessing private property
      (syncer.git as unknown) = gitInstance

      // 模拟 getRemotes 返回包含 upstream 的结果
      (gitInstance.getRemotes as jest.Mock).mockResolvedValueOnce([
        { name: 'origin', url: 'https://github.com/user/repo.git' },
        { name: 'upstream', url: 'https://old-url.com/repo.git' }
      ])

      await syncer['setupUpstream']()

      expect(gitInstance.remote).toHaveBeenCalledWith(['set-url', 'upstream', mockOptions.upstreamRepo])
      expect(logger.info).toHaveBeenCalledWith(`已存在 upstream 远程仓库，更新 URL: ${mockOptions.upstreamRepo}`)
      expect(logger.success).toHaveBeenCalledWith('上游仓库配置完成')
    })

    it('should handle authentication for upstream repo', async () => {
      const authConfig: AuthConfig = {
        type: AuthType.USER_PASS,
        username: 'testuser',
        password: 'testpass',
      }

      const optionsWithAuth = { ...mockOptions, authConfig }
      const syncerWithAuth = new UpstreamSyncer(optionsWithAuth)

      const gitInstance = simpleGit()
      // @ts-expect-error - accessing private property
      (syncerWithAuth.git as unknown) = gitInstance

      // 模拟 getRemotes 返回没有 upstream 的结果
      (gitInstance.getRemotes as jest.Mock).mockResolvedValueOnce([{ name: 'origin', url: 'https://github.com/user/repo.git' }])

      await syncerWithAuth['setupUpstream']()

      // 应该使用带认证信息的 URL
      const expectedUrl = new URL(mockOptions.upstreamRepo)
      expectedUrl.username = encodeURIComponent('testuser')
      expectedUrl.password = encodeURIComponent('testpass')

      expect(gitInstance.addRemote).toHaveBeenCalledWith('upstream', expectedUrl.toString())
    })
  })

  describe('fetchUpstream', () => {
    it('should fetch upstream changes with retry', async () => {
      const gitInstance = simpleGit()
      // @ts-expect-error - accessing private property
      (syncer.git as unknown) = gitInstance

      await syncer['fetchUpstream']()

      expect(gitInstance.fetch).toHaveBeenCalledWith('upstream', mockOptions.upstreamBranch)
      expect(logger.info).toHaveBeenCalledWith('正在从上游仓库获取更新...')
      expect(logger.success).toHaveBeenCalledWith('成功获取上游仓库更新')
    })
  })

  // 更多测试用例可以在这里添加...
}))
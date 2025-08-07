import path from 'node:path'
import fs from 'fs-extra'
import { ConflictResolutionStrategy, ConflictResolver } from '../src/conflict'

// 测试前创建临时目录和文件
beforeAll(async () => {
  // 创建测试目录
  await fs.mkdir(path.join(__dirname, 'test-source'), { recursive: true })
  await fs.mkdir(path.join(__dirname, 'test-target'), { recursive: true })

  // 创建源文件
  await fs.writeFile(
    path.join(__dirname, 'test-source', 'file1.txt'),
    'This is the source content',
  )
  await fs.writeFile(
    path.join(__dirname, 'test-source', 'file2.txt'),
    'Source content for file 2',
  )
  await fs.mkdir(path.join(__dirname, 'test-source', 'subdir'), { recursive: true })
  await fs.writeFile(
    path.join(__dirname, 'test-source', 'subdir', 'file3.txt'),
    'Source content in subdirectory',
  )

  // 创建目标文件
  await fs.writeFile(
    path.join(__dirname, 'test-target', 'file1.txt'),
    'This is the target content',
  )
  await fs.writeFile(
    path.join(__dirname, 'test-target', 'file4.txt'),
    'Target only file',
  )
  await fs.mkdir(path.join(__dirname, 'test-target', 'subdir'), { recursive: true })
  await fs.writeFile(
    path.join(__dirname, 'test-target', 'subdir', 'file3.txt'),
    'Target content in subdirectory',
  )

  // 创建类型冲突（源是文件，目标是目录）
  await fs.writeFile(
    path.join(__dirname, 'test-source', 'conflict-type.txt'),
    'This is a file in source',
  )
  await fs.mkdir(path.join(__dirname, 'test-target', 'conflict-type.txt'), { recursive: true })
})

// 测试后清理临时文件
afterAll(async () => {
  await fs.remove(path.join(__dirname, 'test-source'))
  await fs.remove(path.join(__dirname, 'test-target'))
})

// 测试内容冲突解决
describe('conflictResolver - Content Conflict', () => {
  it('should detect content conflicts', async () => {
    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.PROMPT_USER,
    })

    const conflict = await resolver.detectFileConflict(
      path.join(__dirname, 'test-source', 'file1.txt'),
      path.join(__dirname, 'test-target', 'file1.txt'),
    )

    expect(conflict).not.toBeNull()
    if (conflict) {
      expect(conflict.type).toBe('content')
      expect(conflict.sourceHash).not.toBe(conflict.targetHash)
    }
  })

  it('should resolve content conflict using source', async () => {
    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,
    })

    const conflict = await resolver.detectFileConflict(
      path.join(__dirname, 'test-source', 'file1.txt'),
      path.join(__dirname, 'test-target', 'file1.txt'),
    )

    expect(conflict).not.toBeNull()
    if (conflict) {
      await resolver.resolveConflict(conflict)
      const targetContent = await fs.readFile(
        path.join(__dirname, 'test-target', 'file1.txt'),
        'utf8',
      )
      const sourceContent = await fs.readFile(
        path.join(__dirname, 'test-source', 'file1.txt'),
        'utf8',
      )
      expect(targetContent).toBe(sourceContent)
    }
  })

  it('should resolve content conflict keeping target', async () => {
    // 重置file1.txt的目标内容
    await fs.writeFile(
      path.join(__dirname, 'test-target', 'file1.txt'),
      'This is the target content',
    )

    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.KEEP_TARGET,
    })

    const conflict = await resolver.detectFileConflict(
      path.join(__dirname, 'test-source', 'file1.txt'),
      path.join(__dirname, 'test-target', 'file1.txt'),
    )

    expect(conflict).not.toBeNull()
    if (conflict) {
      await resolver.resolveConflict(conflict)
      const targetContent = await fs.readFile(
        path.join(__dirname, 'test-target', 'file1.txt'),
        'utf8',
      )
      expect(targetContent).toBe('This is the target content')
    }
  })
})

// 测试类型冲突解决
describe('conflictResolver - Type Conflict', () => {
  it('should detect type conflicts', async () => {
    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.PROMPT_USER,
    })

    const conflict = await resolver.detectFileConflict(
      path.join(__dirname, 'test-source', 'conflict-type.txt'),
      path.join(__dirname, 'test-target', 'conflict-type.txt'),
    )

    expect(conflict).not.toBeNull()
    if (conflict) {
      expect(conflict.type).toBe('type')
      expect(conflict.sourceType).toBe('file')
      expect(conflict.targetType).toBe('directory')
    }
  })

  it('should resolve type conflict using source', async () => {
    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,
    })

    const conflict = await resolver.detectFileConflict(
      path.join(__dirname, 'test-source', 'conflict-type.txt'),
      path.join(__dirname, 'test-target', 'conflict-type.txt'),
    )

    expect(conflict).not.toBeNull()
    if (conflict) {
      await resolver.resolveConflict(conflict)
      const targetStat = await fs.stat(
        path.join(__dirname, 'test-target', 'conflict-type.txt'),
      )
      expect(targetStat.isFile()).toBe(true)
    }
  })
})

// 测试目录冲突检测
describe('conflictResolver - Directory Conflicts', () => {
  it('should detect conflicts in directories', async () => {
    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.PROMPT_USER,
    })

    const conflicts = await resolver.detectDirectoryConflicts(
      path.join(__dirname, 'test-source'),
      path.join(__dirname, 'test-target'),
    )

    // 应该检测到file1.txt和subdir/file3.txt的内容冲突，以及conflict-type.txt的类型冲突
    expect(conflicts.length).toBeGreaterThanOrEqual(3)
  })
})

// 测试自动解决功能
describe('conflictResolver - Auto Resolution', () => {
  it('should auto-resolve conflicts based on file type', async () => {
    // 创建一个具有.txt扩展名的测试文件
    const testFilePath = path.join(__dirname, 'test-source', 'auto-resolve.txt')
    const targetFilePath = path.join(__dirname, 'test-target', 'auto-resolve.txt')
    await fs.writeFile(testFilePath, 'Auto resolve source content')
    await fs.writeFile(targetFilePath, 'Auto resolve target content')

    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,
      autoResolveTypes: ['.txt'],
    })

    const conflict = await resolver.detectFileConflict(testFilePath, targetFilePath)
    expect(conflict).not.toBeNull()

    if (conflict) {
      // 使用PROMPT_USER策略，但因为是自动解决类型，应该会使用默认策略
      await resolver.resolveConflict(conflict, ConflictResolutionStrategy.PROMPT_USER)
      const targetContent = await fs.readFile(targetFilePath, 'utf8')
      const sourceContent = await fs.readFile(testFilePath, 'utf8')
      // 应该使用源文件内容
      expect(targetContent).toBe(sourceContent)
    }
  })
})

// 测试日志记录功能
describe('conflictResolver - Log Resolution', () => {
  it('should log resolution when enabled', async () => {
    // 重置file1.txt的目标内容
    const sourceFilePath = path.join(__dirname, 'test-source', 'file1.txt')
    const targetFilePath = path.join(__dirname, 'test-target', 'file1.txt')
    await fs.writeFile(targetFilePath, 'This is the target content')

    // 保存原始的debug日志方法
    const originalDebug = console.debug
    const logs: string[] = []

    // 替换debug日志方法以捕获日志
    console.debug = (...args: any[]) => {
      logs.push(args.join(' '))
    }

    const resolver = new ConflictResolver({
      defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,
      logResolutions: true,
    })

    const conflict = await resolver.detectFileConflict(sourceFilePath, targetFilePath)
    expect(conflict).not.toBeNull()

    if (conflict) {
      await resolver.resolveConflict(conflict)
      // 恢复原始的debug日志方法
      console.debug = originalDebug

      // 检查是否有日志记录
      expect(logs.some(log => log.includes('冲突解决日志'))).toBe(true)
    }
  })
})

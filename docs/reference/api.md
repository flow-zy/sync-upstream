# API 参考

sync-upstream 提供了命令行API和编程API，以下是详细说明。

## 命令行API

### 基本命令

```bash
sync-upstream [options]
```

### 选项

#### --config, -c

- **类型**: `string`
- **描述**: 指定配置文件路径。
- **示例**: `--config=path/to/your/config.js`

#### --upstreamRepo

- **类型**: `string`
- **描述**: 上游仓库地址。
- **示例**: `--upstreamRepo=https://github.com/example/upstream-repo.git`

#### --upstreamBranch

- **类型**: `string`
- **描述**: 上游分支名称。
- **示例**: `--upstreamBranch=main`

#### --targetBranch

- **类型**: `string`
- **描述**: 目标分支名称。
- **示例**: `--targetBranch=master`

#### --maxParallelFiles

- **类型**: `number`
- **描述**: 并行处理的最大文件数。
- **示例**: `--maxParallelFiles=10`

#### --maxRetries

- **类型**: `number`
- **描述**: 网络请求最大重试次数。
- **示例**: `--maxRetries=5`

#### --initialRetryDelay

- **类型**: `number`
- **描述**: 初始重试延迟（毫秒）。
- **示例**: `--initialRetryDelay=3000`

#### --retryDelayFactor

- **类型**: `number`
- **描述**: 重试延迟因子。
- **示例**: `--retryDelayFactor=2`

#### --previewMode

- **类型**: `boolean`
- **描述**: 是否启用预览模式。
- **示例**: `--previewMode=false`

#### --autoPush

- **类型**: `boolean`
- **描述**: 是否自动推送到目标仓库。
- **示例**: `--autoPush=true`

#### --conflictResolution

- **类型**: `'ask' | 'ours' | 'theirs'`
- **描述**: 冲突解决策略。
- **示例**: `--conflictResolution=theirs`

#### --version, -v

- **描述**: 显示当前版本号。
- **示例**: `--version`

#### --help, -h

- **描述**: 显示帮助信息。
- **示例**: `--help`

## 编程API

sync-upstream 也提供了编程API，可以在Node.js项目中直接使用。

### 安装

```bash
pnpm add sync-upstream
```

### 使用示例

```javascript
const { syncUpstream } = require('sync-upstream')

// 配置选项
const options = {
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  targetBranch: 'master',
  syncDirs: [
    {
      upstream: 'packages/core',
      target: 'packages/core'
    }
  ],
  maxParallelFiles: 5,
  maxRetries: 3,
  initialRetryDelay: 2000,
  retryDelayFactor: 1.5,
  previewMode: true
}

// 执行同步
async function runSync() {
  try {
    const result = await syncUpstream(options)
    console.log('Sync completed successfully:', result)
  }
  catch (error) {
    console.error('Sync failed:', error)
  }
}

runSync()
```

### API 方法

#### syncUpstream(options)

- **描述**: 执行上游仓库同步操作。
- **参数**:
  - `options`: 配置选项，与配置文件中的选项相同。
- **返回**: `Promise<SyncResult>`
  - `SyncResult`: 同步结果对象，包含以下属性：
    - `success`: 是否同步成功
    - `changedFiles`: 更改的文件列表
    - `conflicts`: 冲突的文件列表
    - `message`: 同步结果消息

### 类型定义

```typescript
interface SyncDir {
  upstream: string
  target: string
}

interface SyncOptions {
  upstreamRepo: string
  upstreamBranch: string
  targetBranch: string
  syncDirs: SyncDir[]
  maxParallelFiles?: number
  maxRetries?: number
  initialRetryDelay?: number
  retryDelayFactor?: number
  previewMode?: boolean
  autoPush?: boolean
  ignorePatterns?: string[]
  conflictResolution?: 'ask' | 'ours' | 'theirs'
}

interface SyncResult {
  success: boolean
  changedFiles: string[]
  conflicts: string[]
  message: string
}
```

# API 参考

sync-upstream 提供了命令行API和编程API，以下是详细说明。

## 命令行API

### 基本命令

```bash
sync-upstream [options]
```

### 选项

| 参数 | 别名 | 类型 | 示例值 | 说明 |
|---|---|---|---|---|
| `--repo` | `-r` | `<url>` | `https://github.com/vuejs/vue.git` | 上游仓库 URL |
| `--dirs` | `-d` | `<目录>` | `src,packages` | 要同步的目录，多个目录用逗号分隔 |
| `--branch` | `-b` | `<分支>` | `main` | 上游分支 (默认: main) |
| `--company-branch` | `-c` | `<分支>` | `company/main` | 公司仓库分支 (默认: main) |
| `--message` | `-m` | `<消息>` | `"Sync upstream changes"` | 提交消息 |
| `--push` | `-p` | `boolean` | 无 | 自动推送变更 |
| `--force` | `-f` | `boolean` | 无 | 强制覆盖本地文件，不使用增量复制 (默认: true) |
| `--verbose` | `-V` | `boolean` | 无 | 显示详细日志信息 |
| `--silent` | `-s` | `boolean` | 无 | 静默模式，不输出日志 |
| `--dry-run` | `-n` | `boolean` | 无 | 试运行模式，不实际执行同步操作 |
| `--preview-only` | `-P` | `boolean` | 无 | 预览模式，只显示变更，不实际修改文件 |
| `--config` | `-C` | `<路径>` | `sync.config.js` | 指定配置文件路径 |
| `--config-format` | `-F` | `<格式>` | `json` | 配置文件格式 (json, yaml, toml) |
| `--retry-max` | `--rm` | `<次数>` | `5` | 网络请求最大重试次数 (默认: 3) |
| `--retry-delay` | `--rd` | `<毫秒>` | `3000` | 初始重试延迟时间 (默认: 2000) |
| `--retry-backoff` | `--rb` | `<因子>` | `2` | 重试退避因子 (默认: 1.5) |
| `--concurrency` | `--cl` | `<数量>` | `10` | 并行处理的最大文件数量 (默认: 5) |
| `--version` | `-v` | `boolean` | 无 | 显示版本信息 |
| `--help` | `-h` | `boolean` | 无 | 显示帮助信息 |
| `--non-interactive` | `-y` | `boolean` | 无 | 非交互式模式，跳过所有确认提示 |

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

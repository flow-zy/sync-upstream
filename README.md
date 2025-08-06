# Sync Tool

A tool for synchronizing code with upstream repositories with incremental updates and parallel processing.

## Features
- Incremental sync using file hashes
- Parallel directory processing
- Git integration
- Configurable ignore patterns
- Conflict resolution
- Network request retry mechanism with exponential backoff
- Directory and file type change detection
- Windows path compatibility

## Installation

```bash
npm install -g sync-upstream
```

## Usage

```bash
sync-upstream --config sync.config.js
```

## Configuration

支持多种配置格式: JSON、YAML 和 TOML。默认会查找以下文件:
- `.sync-toolrc.json`
- `.sync-toolrc.yaml`
- `.sync-toolrc.yml`
- `.sync-toolrc.toml`
- `sync-tool.config.json`
- `sync-tool.config.yaml`
- `sync-tool.config.yml`
- `sync-tool.config.toml`
- `sync.config.js` (JavaScript模块)

### JSON 格式示例

```json
{
  "localRepoPath": "./my-project",
  "upstreamRepoUrl": "https://github.com/example/upstream-repo.git",
  "upstreamBranch": "main",
  "localBranch": "main",
  "ignorePatterns": ["node_modules", "dist", ".git"],
  "concurrencyLimit": 5,
  "retryConfig": {
    "maxRetries": 3,
    "initialDelay": 2000,
    "backoffFactor": 1.5
  },
  "forceOverwrite": true,
  "verbose": false,
  "silent": false,
  "dryRun": false
}
```

### YAML 格式示例

```yaml
localRepoPath: ./my-project
upstreamRepoUrl: https://github.com/example/upstream-repo.git
upstreamBranch: main
localBranch: main
ignorePatterns:
  - node_modules
  - dist
  - .git
concurrencyLimit: 5
retryConfig:
  maxRetries: 3
  initialDelay: 2000
  backoffFactor: 1.5
forceOverwrite: true
verbose: false
silent: false
dryRun: false
```

### TOML 格式示例

```toml
localRepoPath = "./my-project"
upstreamRepoUrl = "https://github.com/example/upstream-repo.git"
upstreamBranch = "main"
localBranch = "main"
ignorePatterns = [
  "node_modules",
  "dist",
  ".git"
]
concurrencyLimit = 5

[retryConfig]
maxRetries = 3
initialDelay = 2000
backoffFactor = 1.5
forceOverwrite = true
verbose = false
silent = false
dryRun = false
```

### JavaScript 模块格式示

Create a `sync.config.js` file with the following structure:

```javascript
module.exports = {
  // Path to the local repository
  localRepoPath: './my-project',
  // Upstream repository URL
  upstreamRepoUrl: 'https://github.com/example/upstream-repo.git',
  // Upstream branch to sync with
  upstreamBranch: 'main',
  // Local branch to sync to
  localBranch: 'main',
  // Patterns to ignore during sync
  ignorePatterns: ['node_modules', 'dist', '.git'],
  // Concurrency limit for parallel processing
  concurrencyLimit: 5,
  // 可选：网络请求重试配置
  retryConfig: {
    maxRetries: 3, // 最大重试次数
    initialDelay: 2000, // 初始延迟时间(ms)
    backoffFactor: 1.5 // 退避因子
  }
}
```

### 重试机制配置详解

重试机制用于处理网络请求失败的情况，目前支持`git.fetch`和`git.push`操作的重试。

#### 配置选项

- `maxRetries`: 最大重试次数 (默认: 3)
- `initialDelay`: 初始重试延迟时间(毫秒) (默认: 2000)
- `backoffFactor`: 重试退避因子 (默认: 1.5)

#### 重试策略

采用指数退避策略，每次重试的延迟时间为: `initialDelay * (backoffFactor ^ (retryCount - 1))`

例如，默认配置下:
- 第1次重试延迟: 2000ms
- 第2次重试延迟: 2000 * 1.5 = 3000ms
- 第3次重试延迟: 2000 * 1.5^2 = 4500ms

### 命令行参数配置

除了配置文件外，还可以通过命令行参数配置所有选项。命令行参数会覆盖配置文件中的对应设置。

```bash
# 指定配置文件路径
--config <path> 或 -C <path>

# 指定配置文件格式 (json, yaml, toml)
--config-format <format> 或 -F <format>

# 启用详细日志输出
--verbose 或 -V

# 静默模式，只输出错误信息
--silent 或 -s

# 试运行模式，不实际修改文件
--dry-run 或 -n

# 设置最大重试次数
--retry-max <num> 或 --rm <num>

# 设置初始重试延迟
--retry-delay <ms> 或 --rd <ms>

# 设置重试退避因子
--retry-backoff <factor> 或 --rb <factor>
```

完整命令示例:

```bash
sync-upstream --config ./custom-config.yaml --config-format yaml --verbose --dry-run
```

```bash
sync-upstream --repo https://github.com/example/upstream-repo.git --dirs src/core,docs --retry-max 5 --retry-delay 3000 --retry-backoff 2.0 -V -n
```

## API

### Classes

#### UpstreamSyncer

Main class for handling synchronization with upstream repositories.

```typescript
import { UpstreamSyncer } from 'sync-upstream'

const syncer = new UpstreamSyncer({
  localRepoPath: './my-project',
  upstreamRepoUrl: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  localBranch: 'main',
  ignorePatterns: ['node_modules', 'dist', '.git'],
  concurrencyLimit: 5,
  // 可选：网络请求重试配置
  retryConfig: {
    maxRetries: 3, // 最大重试次数
    initialDelay: 2000, // 初始延迟时间(ms)
    backoffFactor: 1.5 // 退避因子
  }
})

// 使用async/await方式调用
async function syncWithUpstream() {
  try {
    await syncer.run()
    console.log('Sync completed successfully')
  }
  catch (err) {
    console.error('Sync failed:', err)
  }
}

syncWithUpstream()
```

### Configuration Options

The `UpstreamSyncer` class accepts the following configuration options:

- `localRepoPath`: Path to the local repository
- `upstreamRepoUrl`: Upstream repository URL
- `upstreamBranch`: Upstream branch to sync with
- `localBranch`: Local branch to sync to
- `ignorePatterns`: Patterns to ignore during sync
- `concurrencyLimit`: Concurrency limit for parallel processing
- `forceOverwrite`: Whether to force overwrite existing files (default: true)
- `verbose`: Whether to enable verbose logging (default: false)
- `silent`: Whether to enable silent mode (only error messages) (default: false)
- `dryRun`: Whether to enable dry-run mode (no actual changes) (default: false)
- `retryConfig`: Optional configuration for network request retries
  - `maxRetries`: Maximum number of retry attempts (default: 3)
  - `initialDelay`: Initial delay between retries in milliseconds (default: 2000)
  - `backoffFactor`: Exponential backoff factor (default: 1.5)

## License

MIT

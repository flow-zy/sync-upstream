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
    maxRetries: 3,     // 最大重试次数
    initialDelay: 2000, // 初始延迟时间(ms)
    backoffFactor: 1.5  // 退避因子
  }
}
```

## API

### Classes

#### UpstreamSyncer

Main class for handling synchronization with upstream repositories.

```typescript
import { UpstreamSyncer } from 'sync-tool'

const syncer = new UpstreamSyncer({
  localRepoPath: './my-project',
  upstreamRepoUrl: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  localBranch: 'main',
  ignorePatterns: ['node_modules', 'dist', '.git'],
  concurrencyLimit: 5,
  // 可选：网络请求重试配置
  retryConfig: {
    maxRetries: 3,     // 最大重试次数
    initialDelay: 2000, // 初始延迟时间(ms)
    backoffFactor: 1.5  // 退避因子
  }
})

// 使用async/await方式调用
async function syncWithUpstream() {
  try {
    await syncer.run()
    console.log('Sync completed successfully')
  } catch (err) {
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
- `retryConfig`: Optional configuration for network request retries
  - `maxRetries`: Maximum number of retry attempts (default: 3)
  - `initialDelay`: Initial delay between retries in milliseconds (default: 2000)
  - `backoffFactor`: Exponential backoff factor (default: 1.5)

## License

ISC

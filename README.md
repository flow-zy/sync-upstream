# Sync upstream

A tool for synchronizing code with upstream repositories with incremental updates and parallel processing.

> **注意**：运行此工具前，确保当前目录已使用 Git 初始化。如果不是 Git 仓库，工具将退出并显示错误信息。

## Features
- Incremental sync using file hashes
- Parallel directory processing
- Git integration
- Configurable ignore patterns
- Conflict resolution

## Installation

```bash
npm install -g sync-upstream
```

## Usage

```bash
sync-upstream --config sync.config.js
```

### 基本用法示例

```bash
# 使用配置文件
sync-upstream --config ./path/to/sync.config.js

# 直接通过命令行参数配置
sync-upstream --upstreamRepo https://github.com/example/upstream.git --upstreamBranch main --companyBranch develop --syncDirs src,tests

# 静默模式运行（只输出错误信息）
sync-upstream --config sync.config.js --silent

# 详细输出模式
sync-upstream --config sync.config.js --verbose

# 执行干运行（不实际修改文件）
sync-upstream --config sync.config.js --dryRun
```

### 前置条件
- 当前目录必须是已初始化的 Git 仓库
- 已配置好上游仓库（可通过命令行参数或配置文件）
- 确保有足够的权限访问上游仓库和本地仓库

## Configuration

### 认证配置

工具支持三种认证方式用于访问私有仓库：

#### 认证类型

```typescript
import { AuthType } from 'sync-upstream'

enum AuthType {
  /** SSH 认证 */
  SSH = 'ssh',
  /** 用户名和密码认证 */
  USER_PASS = 'user_pass',
  /** 个人访问令牌认证 */
  PAT = 'pat'
}
```

#### 认证配置示例

```typescript
// SSH 认证配置
const authConfig = {
  type: AuthType.SSH,
  privateKeyPath: '/path/to/your/private-key.pem',
  passphrase: 'optional-passphrase' // 如果私钥有密码
}

// 用户名和密码认证配置
const authConfig = {
  type: AuthType.USER_PASS,
  username: 'your-username',
  password: 'your-password'
}

// 个人访问令牌认证配置
const authConfig = {
  type: AuthType.PAT,
  token: 'your-personal-access-token'
}
```

### 冲突解决配置

冲突解决器可以通过配置来自定义其行为。以下是可用的配置选项：

```typescript
import { ConflictResolutionStrategy } from 'sync-upstream'

// 冲突解决器配置示例
export const conflictResolverConfig = {
  // 默认冲突解决策略
  // USE_SOURCE: 使用源文件内容覆盖目标文件
  // KEEP_TARGET: 保留目标文件内容
  // PROMPT_USER: 提示用户选择
  defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,

  // 自动解决冲突的文件类型列表
  // 对于这些文件类型，即使策略设置为PROMPT_USER，也会使用默认策略
  autoResolveTypes: ['.txt', '.md', '.json', '.config.js'],

  // 是否记录冲突解决日志
  logResolutions: true,

  // 忽略的路径模式
  ignorePaths: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
}
```

### 配置选项详解

- `defaultStrategy`: 默认冲突解决策略，可选值为`USE_SOURCE`、`KEEP_TARGET`或`PROMPT_USER`。
- `autoResolveTypes`: 自动解决冲突的文件类型列表，对于这些文件类型，即使策略设置为`PROMPT_USER`，也会使用默认策略。
- `logResolutions`: 是否记录冲突解决日志，默认为`false`。
- `ignorePaths`: 忽略的路径模式，支持通配符。
- `concurrencyLimit`: 并行处理的最大文件数量，默认为5。
- `authConfig`: 认证配置，用于访问私有仓库，详细信息见认证配置部分。

## 基本配置

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
  "authConfig": {
    "type": "ssh",
    "privateKeyPath": "/path/to/your/private-key.pem"
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

# 上游仓库URL
--upstreamRepo <url>

# 上游仓库分支
--upstreamBranch <branch>

# 公司仓库分支
--companyBranch <branch>

# 要同步的目录(用逗号分隔)
--syncDirs <dir1,dir2,...>

# 提交消息
--commitMessage <message>

# 是否自动推送到公司仓库
--autoPush <true|false>

# 最大重试次数
--maxRetries <number>

# 初始重试延迟时间(毫秒)
--initialDelay <number>

# 重试退避因子
--backoffFactor <number>

# 是否强制覆盖文件
--forceOverwrite <true|false>

# 是否输出详细日志
--verbose <true|false>

# 是否静默模式(只输出错误)
--silent <true|false>

# 是否执行干运行(不实际修改文件)
--dryRun <true|false>

# 并行处理的最大文件数量
--concurrency <number> 或 -cl <number>

# 认证类型 (ssh, user_pass, pat)
--authType <type>

# SSH 私钥路径
--sshKeyPath <path>

# SSH 私钥密码
--sshPassphrase <passphrase>

# 用户名 (用于 user_pass 认证)
--username <username>

# 密码 (用于 user_pass 认证)
--password <password>

# 个人访问令牌 (用于 pat 认证)
--token <token>
```

## 故障排除

### 常见问题

1. **Git仓库未初始化**
   - 错误信息: `Error: Not a git repository`
   - 解决方法: 确保在运行工具前已使用`git init`初始化仓库，并配置了远程仓库。

2. **无法访问上游仓库**
   - 错误信息: `Error: Failed to fetch upstream repository`
   - 解决方法: 检查网络连接，确保上游仓库URL正确，并且您有访问权限。

3. **冲突解决失败**
   - 错误信息: `Error: Conflict resolution failed`
   - 解决方法: 手动解决冲突后重新运行工具，或修改冲突解决策略。

4. **文件权限问题**
   - 错误信息: `Error: Permission denied`
   - 解决方法: 确保您对本地仓库目录有写入权限。

### 日志查看

工具会生成日志文件，默认位于`./sync-upstream.log`。您可以通过查看日志文件了解详细的错误信息和操作历史。

```bash
# 查看最新日志
tail -f sync-upstream.log
```

## API文档

### 核心类和方法

#### UpstreamSyncer类

```typescript
import { UpstreamSyncer } from 'sync-upstream'

// 创建实例
const syncer = new UpstreamSyncer(options)

// 执行同步
await syncer.run()
```

#### 配置选项接口

```typescript
interface SyncOptions {
  upstreamRepo: string;
  upstreamBranch: string;
  companyBranch: string;
  syncDirs: string[];
  commitMessage?: string;
  autoPush?: boolean;
  forceOverwrite?: boolean;
  verbose?: boolean;
  silent?: boolean;
  dryRun?: boolean;
  retryConfig?: RetryConfig;
  conflictResolutionConfig?: ConflictResolutionConfig;
  concurrencyLimit?: number;
  authConfig?: AuthConfig;
}

interface AuthConfig {
  type: AuthType;
  privateKeyPath?: string;
  passphrase?: string;
  username?: string;
  password?: string;
  token?: string;
}

enum AuthType {
  SSH = 'ssh',
  USER_PASS = 'user_pass',
  PAT = 'pat'
}
```

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

### 冲突解决器 API

#### 枚举

##### ConflictType

冲突类型枚举。

```typescript
enum ConflictType {
  /** 文件内容冲突 */
  CONTENT = 'content',
  /** 文件类型冲突（一个是文件，一个是目录） */
  TYPE = 'type',
  /** 重命名冲突 */
  RENAME = 'rename',
}
```

##### ConflictResolutionStrategy

冲突解决策略枚举。

```typescript
enum ConflictResolutionStrategy {
  /** 使用源文件覆盖目标文件 */
  USE_SOURCE = 'use-source',
  /** 保留目标文件 */
  KEEP_TARGET = 'keep-target',
  /** 尝试自动合并（仅适用于文本文件） */
  AUTO_MERGE = 'auto-merge',
  /** 提示用户解决 */
  PROMPT_USER = 'prompt-user',
}
```

#### 接口

##### ConflictResolutionConfig

冲突解决配置接口。

```typescript
interface ConflictResolutionConfig {
  /** 默认解决策略 */
  defaultStrategy: ConflictResolutionStrategy
  /** 自动解决的文件类型列表 */
  autoResolveTypes?: string[]
  /** 是否记录冲突解决日志 */
  logResolutions?: boolean
}
```

##### ConflictInfo

冲突信息接口。

```typescript
interface ConflictInfo {
  /** 冲突类型 */
  type: ConflictType
  /** 源文件路径 */
  sourcePath: string
  /** 目标文件路径 */
  targetPath: string
  /** 源文件哈希（内容冲突时） */
  sourceHash?: string
  /** 目标文件哈希（内容冲突时） */
  targetHash?: string
  /** 源文件类型（类型冲突时） */
  sourceType?: 'file' | 'directory'
  /** 目标文件类型（类型冲突时） */
  targetType?: 'file' | 'directory'
}
```

#### 类

##### ConflictResolver

冲突解决器类。

```typescript
class ConflictResolver {
  /**
   * 构造函数
   * @param config 冲突解决配置
   */
  constructor(config: ConflictResolutionConfig)

  /**
   * 检测文件冲突
   * @param sourcePath 源文件路径
   * @param targetPath 目标文件路径
   * @returns 冲突信息，如果没有冲突则返回null
   */
  public async detectFileConflict(
    sourcePath: string,
    targetPath: string,
  ): Promise<ConflictInfo | null>

  /**
   * 检测目录冲突
   * @param sourceDir 源目录路径
   * @param targetDir 目标目录路径
   * @param ignorePatterns 忽略模式
   * @returns 冲突信息列表
   */
  public async detectDirectoryConflicts(
    sourceDir: string,
    targetDir: string,
    ignorePatterns: string[] = [],
  ): Promise<ConflictInfo[]>

  /**
   * 解决单个冲突
   * @param conflict 冲突信息
   * @param strategy 解决策略（可选，默认使用配置中的策略）
   * @returns 是否成功解决
   */
  public async resolveConflict(
    conflict: ConflictInfo,
    strategy?: ConflictResolutionStrategy,
  ): Promise<boolean>

  /**
   * 解决多个冲突
   * @param conflicts 冲突信息列表
   * @returns 成功解决的冲突数量
   */
  public async resolveConflicts(conflicts: ConflictInfo[]): Promise<number>
}
```

### 同步器 API

#### 类

#### UpstreamSyncer

Main class for handling synchronization with upstream repositories.

```typescript
import type { SyncOptions } from 'sync-upstream'
import { UpstreamSyncer } from 'sync-upstream'

// 创建同步器实例
const options: Partial<SyncOptions> = {
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src/core', 'docs'],
  commitMessage: 'Sync upstream changes',
  autoPush: false,
  forceOverwrite: true,
  verbose: true
}

const syncer = new UpstreamSyncer(options)

// 执行同步
async function runSync() {
  try {
    await syncer.sync()
    console.log('Sync completed successfully')
  }
  catch (error) {
    console.error('Sync failed:', error)
  }
}

runSync()
```

#### Methods

##### sync()

Executes the synchronization process.

```typescript
async sync(): Promise<void>
```

##### getStatus()

Returns the current status of the synchronization process.

```typescript
getStatus(): SyncStatus
```

### Interfaces

#### SyncOptions

```typescript
interface SyncOptions {
  // Upstream repository URL
  upstreamRepo: string
  // Upstream branch name
  upstreamBranch: string
  // Company repository branch name
  companyBranch: string
  // Directories to sync
  syncDirs: string[]
  // Commit message for changes
  commitMessage: string
  // Whether to automatically push to company repository
  autoPush: boolean
  // Whether to force overwrite local files
  forceOverwrite?: boolean
  // Enable verbose logging
  verbose?: boolean
  // Silent mode (only errors)
  silent?: boolean
  // Dry run mode (no actual changes)
  dryRun?: boolean
  // Retry configuration
  retryConfig?: RetryConfig
  // Conflict resolver instance
  conflictResolver?: ConflictResolver
  // Patterns to ignore during sync
  ignorePatterns?: string[]
  // Concurrency limit for file operations
  concurrencyLimit?: number
}
```

#### RetryConfig

```typescript
interface RetryConfig {
  // Maximum number of retries
  maxRetries: number
  // Initial delay in milliseconds
  initialDelay: number
  // Backoff factor
  backoffFactor: number
}
```

#### SyncStatus

```typescript
enum SyncStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

## Examples

### Basic Usage

```javascript
const { UpstreamSyncer } = require('sync-upstream')

const syncer = new UpstreamSyncer({
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src', 'docs'],
  commitMessage: 'Sync upstream changes'
})

syncer.sync()
  .then(() => console.log('Sync successful'))
  .catch(err => console.error('Sync failed:', err))
```

### Custom Retry Configuration

```javascript
const { UpstreamSyncer } = require('sync-upstream')

const syncer = new UpstreamSyncer({
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src'],
  commitMessage: 'Sync upstream changes',
  retryConfig: {
    maxRetries: 5,
    initialDelay: 3000,
    backoffFactor: 2.0
  }
})

syncer.sync()
```

### Conflict Resolution Example

```javascript
const { ConflictResolver, ConflictResolutionStrategy } = require('sync-upstream')

// 创建冲突解决器实例
const conflictResolver = new ConflictResolver({
  defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,
  autoResolveTypes: ['.txt', '.md', '.json'],
  logResolutions: true
})

// 检测文件冲突
async function detectAndResolveConflict() {
  try {
    const conflict = await conflictResolver.detectFileConflict(
      './source/file.txt',
      './target/file.txt'
    )

    if (conflict) {
      console.log('检测到冲突:', conflict)
      // 解决冲突
      const resolved = await conflictResolver.resolveConflict(conflict)
      console.log('冲突解决:', resolved ? '成功' : '失败')
    }
    else {
      console.log('没有检测到冲突')
    }
  }
  catch (error) {
    console.error('处理冲突时出错:', error)
  }
}

detectAndResolveConflict()
```

### Dry Run Mode

```javascript
const { UpstreamSyncer } = require('sync-upstream')

const syncer = new UpstreamSyncer({
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src', 'docs'],
  commitMessage: 'Sync upstream changes',
  dryRun: true
})

syncer.sync()
  .then(() => console.log('Dry run completed successfully'))
  .catch(err => console.error('Dry run failed:', err))
```

### Advanced Configuration Example

```javascript
const { UpstreamSyncer } = require('sync-upstream')
const { ConflictResolver, ConflictResolutionStrategy } = require('sync-upstream')

// 配置冲突解决器
const conflictResolver = new ConflictResolver({
  defaultStrategy: ConflictResolutionStrategy.MERGE,
  autoResolveTypes: ['.json', '.md'],
  logResolutions: true,
  ignorePaths: ['package-lock.json', 'yarn.lock']
})

// 创建同步器实例并集成冲突解决器
const syncer = new UpstreamSyncer({
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src', 'docs'],
  commitMessage: 'Sync upstream changes',
  dryRun: false,
  verbose: true,
  conflictResolver,
  ignorePatterns: ['node_modules', 'dist', '.git'],
  concurrencyLimit: 5,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 2000,
    backoffFactor: 1.5
  }
})

syncer.sync()
  .then(() => console.log('Sync completed successfully'))
  .catch(err => console.error('Sync failed:', err))
```

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

MIT

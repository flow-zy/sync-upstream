# 配置参考

sync-upstream 支持多种配置项，以下是所有配置项的详细说明。配置文件可以是 JavaScript、JSON、YAML 或 TOML 格式。

## 配置项列表

### upstreamRepo

- **类型**: `string`
- **必填**: 是
- **描述**: 上游仓库的 Git URL。对应命令行参数 `--repo` 或 `-r`。
- **示例**: `'https://github.com/example/upstream-repo.git'`

### upstreamBranch

- **类型**: `string`
- **必填**: 是
- **描述**: 上游仓库的分支名称。对应命令行参数 `--branch` 或 `-b`。
- **默认值**: `'main'`
- **示例**: `'main'`, `'dev'`

### companyBranch

- **类型**: `string`
- **必填**: 是
- **描述**: 目标仓库的分支名称。对应命令行参数 `--company-branch` 或 `-c`。
- **默认值**: `'main'`
- **示例**: `'company/main'`, `'develop'`

### syncDirs

- **类型**: `Array<string> | Array<{upstream: string, target: string}>`
- **必填**: 是
- **描述**: 要同步的目录。可以是字符串数组（简单模式）或对象数组（高级模式，指定上游和目标目录映射）。对应命令行参数 `--dirs` 或 `-d`。
- **示例**: 简单模式
  ```javascript
  ['src', 'packages']
  ```
  高级模式
  ```javascript
  [
    {
      upstream: 'packages/core',
      target: 'packages/core'
    },
    {
      upstream: 'packages/utils',
      target: 'packages/tools'
    }
  ]
  ```

### commitMessage

- **类型**: `string`
- **必填**: 否
- **描述**: 提交消息。对应命令行参数 `--message` 或 `-m`。
- **示例**: `'Sync upstream changes'`

### autoPush

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否自动将更改推送到公司仓库。对应命令行参数 `--push` 或 `-p`。
- **示例**: `true`

### forceOverwrite

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `true`
- **描述**: 是否强制覆盖本地文件，不使用增量复制。对应命令行参数 `--force` 或 `-f`。
- **示例**: `false`

### verbose

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否显示详细日志信息。对应命令行参数 `--verbose` 或 `-V`。
- **示例**: `true`

### silent

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否启用静默模式，不输出日志。对应命令行参数 `--silent` 或 `-s`。
- **示例**: `true`

### dryRun

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否启用试运行模式，不实际执行同步操作。对应命令行参数 `--dry-run` 或 `-n`。
- **示例**: `true`

### previewOnly

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否启用预览模式，只显示变更，不实际修改文件。对应命令行参数 `--preview-only` 或 `-P`。
- **示例**: `true`

### ignorePatterns

- **类型**: `Array<string>`
- **必填**: 否
- **默认值**: `[]`
- **描述**: 忽略的文件模式数组，支持 glob 模式。
- **示例**: `['node_modules', 'dist', '*.log']`

### retryConfig

- **类型**: `{maxRetries: number, initialDelay: number, backoffFactor: number}`
- **必填**: 否
- **默认值**: `{maxRetries: 3, initialDelay: 2000, backoffFactor: 1.5}`
- **描述**: 网络请求重试配置。对应命令行参数 `--retry-max`/`--rm`、`--retry-delay`/`--rd` 和 `--retry-backoff`/`--rb`。
- **示例**: `{maxRetries: 5, initialDelay: 3000, backoffFactor: 2}`

### concurrencyLimit

- **类型**: `number`
- **必填**: 否
- **默认值**: `5`
- **描述**: 并行处理的最大文件数量。对应命令行参数 `--concurrency` 或 `--cl`。
- **示例**: `10`

### nonInteractive

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否启用非交互式模式，跳过所有确认提示。对应命令行参数 `--non-interactive` 或 `-y`。
- **示例**: `true`

### authConfig

- **类型**: `{type: 'ssh' | 'pat' | 'github-app' | 'oidc', ...}`
- **必填**: 否
- **描述**: 认证配置，支持 SSH、PAT (Personal Access Token)、GitHub App 和 OIDC 等认证方式。
- **示例**: `{type: 'pat', token: process.env.GITHUB_TOKEN}`

### lfsConfig

- **类型**: `{useLFS: boolean, largeFileThreshold: number, lfsTrackPatterns: Array<string>}`
- **必填**: 否
- **默认值**: `{useLFS: true, largeFileThreshold: 5 * 1024 * 1024, lfsTrackPatterns: ['*.zip', '*.tar.gz', '*.pdf', '*.jpg', '*.png']}`
- **描述**: Git LFS (Large File Storage) 配置。
- **示例**: `{useLFS: true, largeFileThreshold: 10 * 1024 * 1024, lfsTrackPatterns: ['*.bin', '*.iso']}`

### cacheConfig

- **类型**: `{useCache: boolean, cacheDir: string, cacheExpiryDays: number}`
- **必填**: 否
- **默认值**: `{useCache: true, cacheDir: './.sync-cache', cacheExpiryDays: 7}`
- **描述**: 缓存配置。
- **示例**: `{useCache: true, cacheDir: './.custom-cache', cacheExpiryDays: 14}`
- **示例**: `['node_modules/**', 'dist/**', '*.log']`

### conflictResolution

- **类型**: `'ask' | 'ours' | 'theirs'`
- **必填**: 否
- **默认值**: `'ask'`
- **描述**: 冲突解决策略。
  - `'ask'`: 询问用户如何解决冲突
  - `'ours'`: 使用目标仓库的代码
  - `'theirs'`: 使用上游仓库的代码
- **示例**: `'theirs'`

## 配置示例

### 完整配置示例

```javascript
// .sync-upstream.config.js
module.exports = {
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  targetBranch: 'master',
  syncDirs: [
    {
      upstream: 'packages/core',
      target: 'packages/core'
    },
    {
      upstream: 'packages/utils',
      target: 'packages/tools'
    }
  ],
  maxParallelFiles: 10,
  maxRetries: 5,
  initialRetryDelay: 3000,
  retryDelayFactor: 2,
  previewMode: false,
  autoPush: true,
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    '*.log'
  ],
  conflictResolution: 'theirs'
}
```

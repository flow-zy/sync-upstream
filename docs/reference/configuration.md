# 配置参考

sync-upstream 支持多种配置项，以下是所有配置项的详细说明。

## 配置项列表

### upstreamRepo

- **类型**: `string`
- **必填**: 是
- **描述**: 上游仓库的Git URL。
- **示例**: `'https://github.com/example/upstream-repo.git'`

### upstreamBranch

- **类型**: `string`
- **必填**: 是
- **描述**: 上游仓库的分支名称。
- **示例**: `'main'`, `'dev'`

### targetBranch

- **类型**: `string`
- **必填**: 是
- **描述**: 目标仓库的分支名称。
- **示例**: `'master'`, `'develop'`

### syncDirs

- **类型**: `Array<{upstream: string, target: string}>`
- **必填**: 是
- **描述**: 同步目录配置数组，指定哪些目录需要从上游仓库同步到目标仓库。
- **示例**:
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

### maxParallelFiles

- **类型**: `number`
- **必填**: 否
- **默认值**: `5`
- **描述**: 并行处理的最大文件数。
- **示例**: `10`

### maxRetries

- **类型**: `number`
- **必填**: 否
- **默认值**: `3`
- **描述**: 网络请求失败后的最大重试次数。
- **示例**: `5`

### initialRetryDelay

- **类型**: `number`
- **必填**: 否
- **默认值**: `2000`
- **描述**: 初始重试延迟时间（毫秒）。
- **示例**: `3000`

### retryDelayFactor

- **类型**: `number`
- **必填**: 否
- **默认值**: `1.5`
- **描述**: 重试延迟因子，每次重试的延迟时间会乘以该因子。
- **示例**: `2`

### previewMode

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `true`
- **描述**: 是否启用预览模式。启用时，只显示将要进行的更改，不实际修改文件。
- **示例**: `false`

### autoPush

- **类型**: `boolean`
- **必填**: 否
- **默认值**: `false`
- **描述**: 是否自动将更改推送到目标仓库。
- **示例**: `true`

### ignorePatterns

- **类型**: `Array<string>`
- **必填**: 否
- **默认值**: `[]`
- **描述**: 忽略的文件模式数组，支持glob模式。
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

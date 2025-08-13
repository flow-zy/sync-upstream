# 配置指南

sync-upstream 支持多种配置方式，您可以根据项目需求选择最适合的方式。

## 配置文件

sync-upstream 默认会在项目根目录下查找 `.sync-upstream.config.js` 或 `.sync-upstream.config.ts` 文件。您也可以通过 `--config` 选项指定自定义配置文件路径。

### 基本配置示例

```javascript
// .sync-upstream.config.js
module.exports = {
  // 上游仓库地址
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  // 上游分支
  upstreamBranch: 'main',
  // 目标分支
  targetBranch: 'master',
  // 同步目录，可以是父级目录或子级目录
  syncDirs: [
    'src', // 同步整个src目录
    'src/components', // 同步src/components子目录
    'src/utils/**' // 使用通配符同步所有子目录
  ],
  // 或者使用对象格式进行更复杂的映射
  // syncDirs: [
  //   {
  //     // 上游目录
  //     upstream: 'packages/core',
  //     // 目标目录
  //     target: 'packages/core'
  //   }
  // ],
  // 并行处理的最大文件数
  maxParallelFiles: 5,
  // 网络请求最大重试次数
  maxRetries: 3,
  // 初始重试延迟（毫秒）
  initialRetryDelay: 2000,
  // 重试延迟因子
  retryDelayFactor: 1.5,
  // 是否启用预览模式
  previewMode: true
}
```

## 命令行参数

您也可以通过命令行参数来配置sync-upstream。命令行参数会覆盖配置文件中的同名配置。

```bash
sync-upstream --upstreamRepo=https://github.com/example/upstream-repo.git --upstreamBranch=main --targetBranch=master
```

## 配置项说明

### 必选配置

- `upstreamRepo`: 上游仓库地址
- `upstreamBranch`: 上游分支
- `companyBranch`: 公司（目标）分支
- `syncDirs`: 同步目录数组，可以是字符串（目录路径）或对象
  - 字符串格式: 直接指定要同步的目录路径，支持子目录和通配符
  - 对象格式:
    - `upstream`: 上游目录
    - `target`: 目标目录

### 可选配置

- `maxParallelFiles`: 并行处理的最大文件数，默认为5
- `maxRetries`: 网络请求最大重试次数，默认为3
- `initialRetryDelay`: 初始重试延迟（毫秒），默认为2000
- `retryDelayFactor`: 重试延迟因子，默认为1.5
- `previewMode`: 是否启用预览模式，默认为true
- `autoPush`: 是否自动推送到目标仓库，默认为false
- `ignorePatterns`: 忽略的文件模式数组，默认为[]
- `conflictResolution`: 冲突解决策略，可选值为'ask'、'ours'、'theirs'，默认为'ask'

## 下一步

配置完成后，您可以继续阅读 [使用指南](/guide/usage) 来了解如何使用sync-upstream。

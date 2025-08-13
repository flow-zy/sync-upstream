# 使用指南

配置完成后，您可以通过以下方式使用sync-upstream工具。

## 非交互式模式

您可以使用非交互式模式跳过交互式提示，直接使用配置文件或命令行参数提供的设置运行同步。

```bash
# 使用非交互式模式

sync-upstream -y
# 或

sync-upstream --non-interactive
```

### 智能参数提示

非交互式模式会**智能地只提示未通过配置参数提供的选项**，已通过配置文件或命令行参数提供的值将被直接使用，不会再次提示。这使得自动化脚本更加简洁高效。

例如，如果您提供了仓库URL、分支和同步目录，非交互式模式将只提示网络请求重试配置和并发限制等未提供的参数：

```bash
# 提供部分参数的非交互式模式示例

sync-upstream -y --repo https://github.com/example/repo --dirs src --branch main --company-branch develop
```

非交互式模式特别适用于自动化脚本或CI/CD环境中。

## 基本使用

## 基本使用

### 同步代码

在项目根目录下运行以下命令：

```bash
sync-upstream
```

该命令会根据配置文件中的设置，同步上游仓库的代码到目标仓库。

### 指定配置文件

如果您的配置文件不在默认位置，可以使用 `--config` 选项指定：

```bash
sync-upstream --config=path/to/your/config.js
```

### 覆盖配置项

您可以通过命令行参数覆盖配置文件中的配置项：

```bash
sync-upstream --upstreamBranch=dev --targetBranch=develop
```

## 高级用法

### 预览模式

默认情况下，sync-upstream 会运行在预览模式，只显示将要进行的更改，而不会实际修改文件。您可以通过以下方式禁用预览模式：

```bash
sync-upstream --previewMode=false
```

或者在配置文件中设置：

```javascript
module.exports = {
  // ...其他配置
  previewMode: false
}
```

### 冲突解决

当出现代码冲突时，sync-upstream 会根据配置的冲突解决策略进行处理：

- `ask`: 询问用户如何解决冲突（默认）
- `ours`: 使用目标仓库的代码
- `theirs`: 使用上游仓库的代码

您可以通过以下方式指定冲突解决策略：

```bash
sync-upstream --conflictResolution=theirs
```

或者在配置文件中设置：

```javascript
module.exports = {
  // ...其他配置
  conflictResolution: 'theirs'
}
```

### 忽略文件

您可以配置忽略某些文件或目录，使其不会被同步：

```javascript
module.exports = {
  // ...其他配置
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    '*.log'
  ]
}
```

## 示例

### 示例1：基本同步

```bash
sync-upstream
```

### 示例2：指定分支并禁用预览模式

```bash
sync-upstream --upstreamBranch=dev --targetBranch=develop --previewMode=false
```

### 示例3：使用特定配置文件

```bash
sync-upstream --config=./sync-config.js
```

## 下一步

了解更多高级功能，请查看 [API 参考](/reference/api) 部分。

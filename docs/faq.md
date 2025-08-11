# 常见问题

## 基础问题

### 什么是 sync-upstream?

sync-upstream 是一个用于将代码与上游仓库同步的工具，它支持增量更新和并行处理，可以帮助开发团队更高效地同步和整合上游代码变更。

### sync-upstream 与 git pull 有什么区别?

虽然两者都涉及代码同步，但有以下主要区别：
- **增量更新**: sync-upstream 只同步有变化的文件，而 git pull 会拉取整个分支的变更
- **并行处理**: sync-upstream 支持多线程同时处理多个文件，提高同步速度
- **冲突解决**: sync-upstream 提供更智能的冲突检测和解决机制
- **灵活性**: sync-upstream 支持更丰富的配置选项和自定义规则

### 如何安装 sync-upstream?

可以通过 npm 或 pnpm 进行安装：
```bash
# 使用 pnpm 安装\pnpm add -g sync-upstream

# 使用 npm 安装
npm install -g sync-upstream
```

## 配置问题

### 如何配置同步规则?

可以通过创建 `.sync-upstream.config.js` 或 `.sync-upstream.config.ts` 文件来配置同步规则。例如：
```javascript
module.exports = {
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  targetBranch: 'master',
  syncDirs: [
    {
      upstream: 'packages/core',
      target: 'packages/core'
    }
  ]
}
```

### 如何忽略某些文件或目录?

可以使用 `ignorePatterns` 配置项来忽略特定的文件或目录：
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

## 使用问题

### 如何解决代码冲突?

sync-upstream 提供了三种冲突解决策略：
- `ask`: 询问用户如何解决冲突（默认）
- `ours`: 使用目标仓库的代码
- `theirs`: 使用上游仓库的代码

可以通过配置文件或命令行参数指定：
```bash
sync-upstream --conflictResolution=theirs
```

### 如何提高同步速度?

可以通过以下方式提高同步速度：
- 增加 `maxParallelFiles` 配置项的值，提高并行处理数量
- 使用增量更新功能（默认启用）
- 合理配置 `ignorePatterns`，减少不必要的文件同步
- 确保网络连接稳定

## 高级问题

### 如何集成到 CI/CD 流程中?

sync-upstream 可以作为 CI/CD 流程的一部分，自动同步上游代码变更。例如，在 GitHub Actions 中：
```yaml
- name: Sync upstream changes
  run: |
    npm install -g sync-upstream
    sync-upstream --previewMode=false
```

### 如何进行身份验证?

sync-upstream 支持三种身份验证方式：
- SSH: 通过 SSH 密钥进行认证
- USER_PASS: 通过用户名和密码进行认证
- PAT: 通过个人访问令牌进行认证

可以通过配置文件指定：
```javascript
module.exports = {
  // ...其他配置
  authType: 'SSH',
  sshKeyPath: '/path/to/ssh/key'
}
```

## 故障排除

### 同步失败如何处理?

如果同步失败，可以尝试以下步骤：
1. 检查网络连接是否稳定
2. 检查配置文件是否正确
3. 检查身份验证信息是否有效
4. 增加 `maxRetries` 配置项的值，提高重试次数
5. 查看详细日志，定位问题原因

### 日志在哪里查看?

sync-upstream 的日志会输出到控制台。可以通过配置 `logLevel` 来调整日志详细程度：
```javascript
module.exports = {
  // ...其他配置
  logLevel: 'debug' // 可选值: 'error', 'warn', 'info', 'debug'
}
```

# sync-upstream

🚀 **企业级上游代码同步管理工具**

---

## 为什么需要 sync-upstream？

在开源协作与企业开发中，您是否遇到过这些痛点？
- 手动同步上游代码耗时耗力，容易出错
- 全量复制浪费带宽和存储空间
- 代码冲突难以解决，缺乏审计跟踪
- 无法可靠地回滚到之前的同步状态
- 团队协作中同步流程不透明

**sync-upstream** 应运而生，专为解决这些问题而设计。

---

## 什么是 sync-upstream？

sync-upstream 是一款面向企业与开源团队的**上游代码生命周期管理**工具。它能够将开源仓库的更新，以**增量、并行、可审计、可回滚**的方式，安全地同步到您的私有分支。

无论是维护企业内部的开源分叉版本，还是定期合并上游社区的更新，sync-upstream 都能让这个过程变得简单、可靠且高效。

> **注意**：运行此工具前，确保当前目录已使用 Git 初始化。

---

## 核心特性

### 🔄 智能同步引擎
- **增量哈希 diff**：仅同步变更文件，节省带宽和时间
- **并行文件处理**：自适应并发（CPU×2，上限 64），大幅提升处理速度
- **大文件支持**：LFS / Git-Annex 集成，轻松处理 2GB+ 二进制文件
- **本地缓存代理**：内网缓存，带宽节省 80%，加速团队协作

### 🔐 安全与合规
- **多认证方式**：支持 SSH / PAT / GitHub App / OIDC
- **最小权限原则**：临时凭证/短期令牌，自动过期
- **Policy-as-Code**：许可证扫描、敏感词拦截（即将上线）
- **审计日志**：完整记录同步过程，支持 Prometheus + Jaeger（即将上线）

### 🧩 灵活配置
- **多格式支持**：JS/JSON/YAML/TOML，自动探测 `.sync-toolrc.*`
- **多环境管理**：开发/测试/生产环境配置分离与一键切换（开发中）
- **声明式冲突解决**：YAML 策略引擎，支持文件级/目录级/语义级冲突处理
- **分支策略自动化**：基于规则自动创建和管理分支，支持FEATURE、RELEASE、HOTFIX和DEVELOP四种策略

### 🚀 高效协作
- **灰度发布 & 一键回滚**：dry-run → canary → full → revert（已完成，查看 [FEATURES_DETAILED.md](FEATURES_DETAILED.md) 获取详细说明）
- **Web Dashboard**：实时落后 commit 数、一键审批（即将上线）
- **CI/CD 集成**：与 GitHub Actions 等工具无缝集成（开发中）
- **Webhook集成**：支持接收上游仓库的Webhook通知，实现自动触发同步（已完成）

---

## 使用场景

1. **企业开源分叉维护**
   当您的团队基于开源项目创建了企业定制版本，需要定期合并上游更新时

2. **多仓库协同开发**
   当您需要从多个开源仓库中同步特定模块到您的项目中时

3. **安全合规审核**
   当您需要在同步过程中自动检测许可证合规性和敏感信息时

4. **分布式团队协作**
   当您的团队分布在不同地区，需要高效同步代码变更时

5. **标准化开发流程**
   当您需要自动创建和管理符合团队规范的分支（如特性分支、发布分支等）时

---

## 30 秒极速上手

### 1. 安装
```bash
npm install -g sync-upstream
```

### 2. 一条命令运行（零配置）
```bash
# 直接运行，工具会交互式询问上游地址、分支、目录
sync-upstream
```

### 3. 推荐单文件配置（sync.config.js）
```js
module.exports = {
  upstreamRepo: 'https://github.com/vuejs/vue.git',
  upstreamBranch: 'main',
  companyBranch: 'company/main',
  syncDirs: ['src', 'packages'],
  ignorePatterns: ['node_modules', 'dist', '*.log'],
  authConfig: { type: 'pat', token: process.env.GITHUB_TOKEN },
  retryConfig: { maxRetries: 3, initialDelay: 2000, backoffFactor: 1.5 },
  concurrencyLimit: 8,
  forceOverwrite: false,
  verbose: true,
  dryRun: false,
  // LFS 配置
  useLFS: true,
  largeFileThreshold: 5 * 1024 * 1024, // 5MB
  lfsTrackPatterns: ['*.zip', '*.tar.gz', '*.pdf', '*.jpg', '*.png'],
  // 缓存配置
  useCache: true,
  cacheDir: './.sync-cache',
  cacheExpiryDays: 7,
  // 分支策略配置
  branchStrategyConfig: {
    enable: true,
    strategy: 'FEATURE', // 可选值: FEATURE, RELEASE, HOTFIX, DEVELOP
    baseBranch: 'main',
    branchPattern: 'feature/{name}', // 支持{name}, {date}, {author}等变量
    autoSwitchBack: true,
    autoDeleteMergedBranches: false
  },
  // Webhook配置
  webhookConfig: {
    enable: true,
    port: 3000,
    path: '/webhook',
    secret: 'your-secure-webhook-secret', // 生产环境中请使用环境变量
    allowedEvents: ['push', 'pull_request'],
    triggerBranch: 'main'
  }
}
```
保存后执行：
```bash
sync-upstream --config sync.config.js
```

---

## CLI 速查表

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
| `--gray-release` | `-gr` | `boolean` | 无 | 启用灰度发布模式 |
| `--full-release` | `-fr` | `boolean` | 无 | 执行全量发布 |
| `--rollback` | `-ro` | `boolean` | 无 | 执行回滚操作 |
| `--branch-strategy` | 无 | `<策略>` | `FEATURE` | 分支策略类型 (FEATURE, RELEASE, HOTFIX, DEVELOP) |
| `--base-branch` | 无 | `<分支>` | `main` | 基础分支，用于创建新分支 |
| `--branch-pattern` | 无 | `<模式>` | `feature/{name}` | 分支命名模式，支持{name}, {date}, {author}等变量 |
| `--webhook-enable` | `-we` | `boolean` | 无 | 启用Webhook集成 |
| `--webhook-port` | `-wp` | `<端口>` | `3000` | Webhook监听端口 |
| `--webhook-path` | `-wpa` | `<路径>` | `/webhook` | Webhook路径 |
| `--webhook-secret` | `-ws` | `<密钥>` | `your-secret` | Webhook验证密钥 |
| `--webhook-events` | `-wev` | `<事件>` | `push,pull_request` | 允许的事件类型列表，多个事件用逗号分隔 |
| `--webhook-branch` | `-wb` | `<分支>` | `main` | 触发同步的分支 |

---

## 常见问题速查

| 错误提示 | 解决步骤 |
|---|---|
| `Error: Not a git repository` | `git init && git remote add origin <url>` |
| `Failed to fetch upstream` | 检查网络、URL、Token 权限 |
| `Permission denied` | 确认本地目录可写或私钥权限 600 |

---

## 路线图

项目的详细发展计划请查看完整的 [ROADMAP.md](ROADMAP.md) 文件。

### 近期规划
- **2025 Q3**
  - Web Dashboard Beta（实时冲突热力图）
  - Policy-as-Code GA（Rego 规则引擎）

- **2025 Q4**
  - AI 冲突助手 GA（自动生成合并摘要）
  - SaaS 多租户上线

### 已完成功能
- 增量哈希 diff
- 并行文件处理
- 大文件 LFS / Git-Annex 支持
- 本地缓存代理
- 声明式冲突解决
- 多认证方式支持
- 预览模式
- 重试机制

---

## 贡献指南

我们欢迎社区贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与项目开发。

---

License: MIT

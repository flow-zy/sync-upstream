# sync-upstream

---

## 1. 项目定位
sync-upstream 是一款面向企业与开源团队的「上游代码生命周期管理」工具。
一句话：**把开源仓库的更新，以增量、并行、可审计、可回滚的方式，安全地同步到你的私有分支**。
> **注意**：运行此工具前，确保当前目录已使用 Git 初始化。如果不是 Git 仓库，工具将退出并显示错误信息。
---

## 2. 功能总览

### 状态说明
| 状态标记 | 含义 |
|---|---|
| 🧠 | 研讨中：正在进行需求分析和可行性研究 |
| 📋 | 待开发：需求已明确，等待排期开发 |
| ⏳ | 开发中：正在积极开发中 |
| ✅ | 已完成：功能已开发完成并通过测试 |

### 功能总览

| 一级功能 | 二级能力 | 状态 | 关键描述 |
|---|---|---|---|
| **配置管理** | 多格式配置（JS/JSON/YAML/TOML） | ✅ | 自动探测 `.sync-toolrc.*` |
|  | 配置热重载/实时更新 | ⏳ | 无需重启应用，动态应用配置变更 |
|  | 多环境配置管理 | ⏳ | 开发/测试/生产环境配置分离与一键切换 |
|  | 配置校验 | 📋 | 自动验证配置文件的语法和逻辑正确性 |
| **认证安全** | SSH / PAT / GitHub App / OIDC | ✅ | 支持环境变量与 Vault 注入 |
|  | 临时凭证/短期令牌 | ⏳ | 最小权限原则，自动过期的访问凭证 |
|  | IP 白名单/访问控制 | 📋 | 基于 IP 地址的访问控制策略 |
|  | MFA 多因素认证 | 🧠 | 增强账户安全性，防止未授权访问 |
| **同步引擎** | 增量哈希 diff | ✅ | 仅同步变更文件，节省带宽 |
|  | 并行文件处理 | ✅ | 自适应并发（CPU×2，上限 64） |
|  | 大文件 LFS / Git-Annex | ✅ | 分块续传，2 GB+ 二进制无压力 |
|  | 本地缓存代理 | ✅ | 内网缓存，带宽节省 80% |
|  | 灰度发布 & 一键回滚 | ⏳ | dry-run → canary → full → revert |
|  | 智能带宽控制 | 📋 | 根据网络状况动态调整传输速率 |
|  | 定时同步任务 | 🧠 | 基于 cron 表达式的定期自动同步功能 |
| **冲突解决** | 策略引擎（文件级/目录级/语义级） | ✅ | YAML 声明式策略 |
|  | 冲突可视化对比 | ⏳ | 直观展示文件差异，辅助冲突解决 |
|  | AI 辅助冲突解决 | 🧠 | 基于机器学习的智能冲突解决建议 |
| **治理与合规** | Policy-as-Code（Rego） | ⏳ | 许可证扫描、敏感词拦截 |
|  | 审计日志 & Metrics | ⏳ | Prometheus + Jaeger |
|  | 合规报告生成 | 📋 | 自动生成满足行业标准的合规性报告 |
|  | 数据脱敏 | 🧠 | 自动识别并保护敏感信息 |
| **事件集成** | CloudEvents → Kafka/SNS | ⏳ | 打通 DevOps 流水线 |
|  | Webhook 支持 | ⏳ | 自定义事件通知与回调机制 |
| **运营界面** | Web Dashboard | ⏳ | 实时落后 commit 数、一键审批 |
|  | CI/CD 深度集成 | ⏳ | 与 GitHub Actions 等工具的无缝集成 |
|  | IDE 插件 | ⏳ | VS Code、IntelliJ 等 IDE 的集成插件 |
| **多后端** | Git / Mercurial / Perforce / SVN | ⏳ | 插件化适配遗留系统 |
|  | 对象存储集成 | ⏳ | S3、GCS 等云存储服务同步支持 |
|  | 数据库同步 | 🧠 | 结构与数据的差异化同步 |
| **监控告警** | 实时监控面板 | ⏳ | 同步状态、性能指标可视化 |
|  | 异常告警通知 | ⏳ | 邮件、Slack、钉钉等多渠道告警 |
| **可用性增强** | 离线工作模式 | ⏳ | 无网络时支持本地操作，恢复后自动同步 |
|  | 自动修复 | ⏳ | 检测并尝试自动修复同步问题 |
| **性能优化** | 压缩传输 | 📋 | 自动选择最优压缩算法减少传输大小 |
|  | CDN 集成 | 🧠 | 利用内容分发网络加速全球同步 |
|  | 预取策略 | 🧠 | 智能预测并提前下载需要同步的文件 |
| **集成扩展** | ChatOps 支持 | 📋 | 通过 Slack、Microsoft Teams 等聊天工具进行操作 |
|  | 多语言支持 | 🧠 | 界面支持多种语言 |
|  | API 网关集成 | 🧠 | 与 API 网关服务的无缝集成，支持细粒度访问控制 |

---

## 3. 30 秒极速上手

### 3.1 安装
```bash
npm install -g sync-upstream
```

### 3.2 一条命令运行（零配置）
```bash
# 直接运行，工具会交互式询问上游地址、分支、目录
sync-upstream
```

### 3.3 推荐单文件配置（sync.config.js）
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
  cacheExpiryDays: 7
}
```
保存后执行：
```bash
sync-upstream --config sync.config.js
```

---

## 4. CLI 速查表

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
---

## 5. 常见问题速查

| 错误提示 | 解决步骤 |
|---|---|
| `Error: Not a git repository` | `git init && git remote add origin <url>` |
| `Failed to fetch upstream` | 检查网络、URL、Token 权限 |
| `Permission denied` | 确认本地目录可写或私钥权限 600 |

---

## 6. 路线图（Roadmap 2025）

- **Q3**
  - Web Dashboard Beta（实时冲突热力图）
  - Policy-as-Code GA（Rego 规则引擎）

- **Q4**
  - AI 冲突助手 GA（自动生成合并摘要）
  - SaaS 多租户上线

- **2026 H1**
  - 双向同步（自动向上游提 PR）
  - 企业级权限管理

已完成功能：
- 本地缓存代理
- 大文件 LFS / Git-Annex 支持

---

License: MIT

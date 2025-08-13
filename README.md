# sync-upstream

---

## 1. 项目定位
sync-upstream 是一款面向企业与开源团队的「上游代码生命周期管理」工具。
一句话：**把开源仓库的更新，以增量、并行、可审计、可回滚的方式，安全地同步到你的私有分支**。
> **注意**：运行此工具前，确保当前目录已使用 Git 初始化。如果不是 Git 仓库，工具将退出并显示错误信息。
---

## 2. 功能总览

| 一级功能 | 二级能力 | 状态 | 关键描述 |
|---|---|---|---|
| **配置管理** | 多格式配置（JS/JSON/YAML/TOML） | ✅ | 自动探测 `.sync-toolrc.*` |
| **认证安全** | SSH / PAT / GitHub App / OIDC | ✅ | 支持环境变量与 Vault 注入 |
| **同步引擎** | 增量哈希 diff | ✅ | 仅同步变更文件，节省带宽 |
|  | 并行文件处理 | ✅ | 自适应并发（CPU×2，上限 64） |
|  | 大文件 LFS / Git-Annex | ✅ | 分块续传，2 GB+ 二进制无压力 |
|  | 本地缓存代理 | ✅ | 内网缓存，带宽节省 80% |
| **冲突解决** | 策略引擎（文件级/目录级/语义级） | ✅ | YAML 声明式策略 |
|  | AI 冲突摘要 | 🧪 | GPT-4 自动生成合并建议 |
|  | 灰度发布 & 一键回滚 | ⏳ | dry-run → canary → full → revert |
| **治理与合规** | Policy-as-Code（Rego） | ⏳ | 许可证扫描、敏感词拦截 |
|  | 审计日志 & Metrics | ⏳ | Prometheus + Jaeger |
| **事件集成** | CloudEvents → Kafka/SNS | ⏳ | 打通 DevOps 流水线 |
| **运营界面** | Web Dashboard | ⏳ | 实时落后 commit 数、一键审批 |
| **多后端** | Git / Mercurial / Perforce / SVN | ⏳ | 插件化适配遗留系统 |

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

| 参数 | 示例值 | 说明 |
|---|---|---|
| `--config` | `./sync.config.js` | 指定配置文件 |
| `--upstreamRepo` | `https://github.com/foo/bar.git` | 上游仓库 |
| `--upstreamBranch` | `main` | 上游分支 |
| `--companyBranch` | `develop` | 本地目标分支 |
| `--syncDirs` | `src,tests` | 需同步目录（逗号分隔） |
| `--dryRun` | 无需值 | 只预览，不修改文件 |
| `--verbose` | 无需值 | 输出详细日志 |
| `--silent` | 无需值 | 只输出错误 |

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

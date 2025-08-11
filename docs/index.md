---
# sync-upstream
layout: home

hero:
  name: "sync-upstream"
  text: "上游代码同步工具"
  tagline: 增量更新与并行处理，高效同步上游仓库代码
  image:
    src: /sync-upstream-hero.svg
    alt: sync-upstream
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/installation
    - theme: alt
      text: 配置参考
      link: /reference/configuration
    - theme: alt
      text: 功能记录
      link: /features

features:
  - icon: 💨
    title: 增量更新
    details: 只同步有变化的文件，避免重复处理，提高效率
  - icon: 🚀
    title: 并行处理
    details: 多线程同时处理多个文件，显著提升大规模项目的同步速度
  - icon: 🔄
    title: 冲突解决
    details: 智能检测和处理代码冲突，提供清晰的冲突标记和解决方案
  - icon: ⚙️
    title: 配置灵活
    details: 支持多种配置方式，可根据项目需求自定义同步规则
  - icon: 👀
    title: 预览模式
    details: 支持预览模式，在实际修改前查看将要进行的更改
  - icon: 🔁
    title: 重试机制
    details: 智能重试失败的网络请求，提高稳定性
---

## 什么是 sync-upstream?
sync-upstream 是一个用于将代码与上游仓库同步的工具，它支持增量更新和并行处理，可以帮助开发团队更高效地同步和整合上游代码变更。

## 为什么选择 sync-upstream?
- **高效性**: 增量更新和并行处理显著提高同步速度
- **可靠性**: 智能重试机制和冲突解决确保同步成功率
- **灵活性**: 丰富的配置选项适应不同项目需求
- **易用性**: 简洁的命令行界面和详细的文档
- **安全性**: 预览模式避免意外修改

## 适用场景
- **开源项目维护**: 轻松同步上游仓库的最新变更，保持项目更新
- **多团队协作**: 整合不同团队的代码变更，减少冲突
- **框架定制**: 基于上游框架进行定制开发时，方便同步框架更新
- **微服务架构**: 在多个服务之间同步共享代码
- **CI/CD集成**: 作为持续集成/持续部署流程的一部分

## 快速示例

```bash
# 安装
pnpm add -g sync-upstream

# 配置
cat > .sync-upstream.config.js << EOF
module.exports = {
  upstreamRepo: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  targetBranch: 'master',
  syncDirs: [
    { upstream: 'packages/core', target: 'packages/core' }
  ]
}
EOF

# 运行同步
sync-upstream
```

想要了解更多，请查看 [快速开始](/guide/installation) 部分或 [更新日志](/changelog)。

import { BranchStrategy } from './types'

// 分支策略配置示例
// 更多详情请查看文档

export const branchStrategyConfig = {
  // 是否启用分支策略自动化
  enable: true,

  // 分支策略类型
  // FEATURE: 基于特性的分支策略
  // RELEASE: 基于发布的分支策略
  // HOTFIX: 基于修复的分支策略
  // DEVELOP: 基于开发的分支策略
  strategy: BranchStrategy.FEATURE,

  // 基础分支名称，用于创建新分支
  baseBranch: 'main',

  // 分支命名模式，支持变量替换
  // {feature}: 特性名称 (从环境变量 FEATURE_NAME 获取，默认 'feature')
  // {release}: 发布版本 (从环境变量 RELEASE_VERSION 获取，默认 '1.0.0')
  // {hotfix}: 热修复版本 (从环境变量 HOTFIX_VERSION 获取，默认 '1.0.1')
  // {date}: 当前日期 (格式: YYYYMMDD)
  branchPattern: 'feature/{feature}-{date}',

  // 是否在同步完成后自动切换回原分支
  autoSwitchBack: true,

  // 自动删除已合并的临时分支
  autoDeleteMergedBranches: false,
}

// 使用示例:
// 1. 特性分支策略
// 用于开发新特性，从 main 分支创建，命名格式为 feature/feature-name-YYYYMMDD
const featureStrategy = {
  enable: true,
  strategy: BranchStrategy.FEATURE,
  baseBranch: 'main',
  branchPattern: 'feature/{feature}-{date}',
  autoSwitchBack: true,
  autoDeleteMergedBranches: false,
}

// 2. 发布分支策略
// 用于发布准备，从 main 分支创建，命名格式为 release/v1.0.0-YYYYMMDD
const releaseStrategy = {
  enable: true,
  strategy: BranchStrategy.RELEASE,
  baseBranch: 'main',
  branchPattern: 'release/v{release}-{date}',
  autoSwitchBack: true,
  autoDeleteMergedBranches: false,
}

// 3. 热修复分支策略
// 用于紧急修复，从 main 分支创建，命名格式为 hotfix/v1.0.1-YYYYMMDD
const hotfixStrategy = {
  enable: true,
  strategy: BranchStrategy.HOTFIX,
  baseBranch: 'main',
  branchPattern: 'hotfix/v{hotfix}-{date}',
  autoSwitchBack: true,
  autoDeleteMergedBranches: true,
}

// 4. 开发分支策略
// 用于日常开发，从 develop 分支创建，命名格式为 develop/feature-name-YYYYMMDD
const developStrategy = {
  enable: true,
  strategy: BranchStrategy.DEVELOP,
  baseBranch: 'develop',
  branchPattern: 'develop/{feature}-{date}',
  autoSwitchBack: true,
  autoDeleteMergedBranches: false,
}

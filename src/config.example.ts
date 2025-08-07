import { ConflictResolutionStrategy } from './conflict'

// 冲突解决器配置示例
export const conflictResolverConfig = {
  // 默认冲突解决策略
  // USE_SOURCE: 使用源文件内容覆盖目标文件
  // KEEP_TARGET: 保留目标文件内容
  // PROMPT_USER: 提示用户选择
  defaultStrategy: ConflictResolutionStrategy.USE_SOURCE,

  // 自动解决冲突的文件类型列表
  // 对于这些文件类型，即使策略设置为PROMPT_USER，也会使用默认策略
  autoResolveTypes: ['.txt', '.md', '.json', '.config.js'],

  // 是否记录冲突解决日志
  logResolutions: true,

  // 忽略的路径模式
  ignorePaths: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
}

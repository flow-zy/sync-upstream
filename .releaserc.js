module.exports = {
  // 配置提交消息格式
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
    { type: 'docs', section: 'Documentation' },
    { type: 'style', section: 'Styles' },
    { type: 'refactor', section: 'Code Refactoring' },
    { type: 'perf', section: 'Performance Improvements' },
    { type: 'test', section: 'Tests' },
    { type: 'build', section: 'Build System' },
    { type: 'ci', section: 'CI/CD' },
    { type: 'chore', section: 'Chores', hidden: true },
    { type: 'revert', section: 'Reverts' },
  ],
  // 配置版本号格式
  bumpFiles: [
    {
      filename: 'package.json',
      type: 'json',
    },
    {
      filename: 'package-lock.json',
      type: 'json',
    },
  ],
  // 配置CHANGELOG.md生成
  commitUrlFormat: 'https://github.com/your-username/sync-tool/commit/{{hash}}',
  compareUrlFormat: 'https://github.com/your-username/sync-tool/compare/{{previousTag}}...{{currentTag}}',
  // 自定义更新日志标题
  header: 'CHANGELOG',
  // 是否在生成版本后自动提交
  commit: true,
  // 是否在生成版本后自动打标签
  tag: true,
  // 预发布版本配置
  prerelease: false,
  // 预发布版本标识符格式
  prereleaseId: 'beta',
  // 在预发布版本中包含所有提交历史
  commitAll: false,
}

import type { SyncOptions } from './types'
import chalk from 'chalk'
import prompts from 'prompts'

export async function promptForOptions(initialOptions: Partial<SyncOptions> = {}) {
  console.log(chalk.bold.cyan('\n🔄 仓库目录同步工具\n'))

  const response = await prompts([
    {
      type: 'text',
      name: 'upstreamRepo',
      message: '请输入上游仓库URL:',
      initial: initialOptions.upstreamRepo || '',
      validate: value => value.trim() ? true : '仓库URL不能为空',
    },
    {
      type: 'text',
      name: 'upstreamBranch',
      message: '上游分支名称:',
      initial: initialOptions.upstreamBranch || 'master',
    },
    {
      type: 'text',
      name: 'companyBranch',
      message: '目标仓库分支名称:',
      initial: initialOptions.companyBranch || 'master',
    },
    {
      type: 'list',
      name: 'syncDirs',
      message: '要同步的目录(用逗号分隔):',
      initial: initialOptions.syncDirs?.join('') || '',
      separator: ',',
      format: value => value.map((item: string) => item.trim()).filter(Boolean),
    },
    {
      type: 'text',
      name: 'commitMessage',
      message: '提交消息:',
      initial: initialOptions.commitMessage || 'Sync upstream changes',
    },
    {
      type: 'confirm',
      name: 'autoPush',
      message: '是否自动推送到目标仓库?',
      initial: initialOptions.autoPush !== undefined ? initialOptions.autoPush : true,
    },
    {
      type: 'number',
      name: 'maxRetries',
      message: '网络请求最大重试次数:',
      initial: initialOptions.retryConfig?.maxRetries || 3,
      min: 0,
    },
    {
      type: 'number',
      name: 'initialDelay',
      message: '初始重试延迟时间(毫秒):',
      initial: initialOptions.retryConfig?.initialDelay || 2000,
      min: 100,
    },
    {
      type: 'number',
      name: 'backoffFactor',
      message: '重试退避因子:',
      initial: initialOptions.retryConfig?.backoffFactor || 1.5,
      min: 1,
      max: 5,
      float: true,
    },
    {
      type: 'number',
      name: 'concurrencyLimit',
      message: '并行处理的最大文件数量:',
      initial: initialOptions.concurrencyLimit || 5,
      min: 1,
      max: 20,
    },
    {
      type: 'confirm',
      name: 'previewOnly',
      message: '是否启用预览模式? (只显示变更，不实际修改文件)',
      initial: initialOptions.previewOnly !== undefined ? initialOptions.previewOnly : false,
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: '确认开始同步?',
      initial: true,
    },
  ])

  if (!response.confirm) {
    console.log(chalk.yellow('操作已取消'))
    process.exit(0)
  }

  return {
    upstreamRepo: response.upstreamRepo,
    upstreamBranch: response.upstreamBranch,
    companyBranch: response.companyBranch,
    syncDirs: response.syncDirs,
    commitMessage: response.commitMessage,
    autoPush: response.autoPush,
    previewOnly: response.previewOnly,
    retryConfig: {
      maxRetries: response.maxRetries,
      initialDelay: response.initialDelay,
      backoffFactor: response.backoffFactor,
    },
    concurrencyLimit: response.concurrencyLimit,
  }
}

export function displaySummary(options: SyncOptions) {
  console.log(chalk.bold.blue('\n🔍 配置摘要:'))
  console.log(chalk.cyan(`  - 上游仓库: ${options.upstreamRepo}`))
  console.log(chalk.cyan(`  - 上游分支: ${options.upstreamBranch}`))
  console.log(chalk.cyan(`  - 公司分支: ${options.companyBranch}`))
  console.log(chalk.yellow(`  - 同步目录: ${options.syncDirs.join(', ')}`))
  console.log(chalk.magenta(`  - 提交消息: ${options.commitMessage}`))
  console.log(chalk.green(`  - 自动推送: ${options.autoPush ? '是' : '否'}`))
  console.log(chalk.yellow(`  - 预览模式: ${options.previewOnly ? '启用' : '禁用'}`))
  console.log(chalk.blue(`  - 最大重试次数: ${options.retryConfig?.maxRetries || 3}`))
  console.log(chalk.blue(`  - 初始重试延迟: ${options.retryConfig?.initialDelay || 2000}ms`))
  console.log(chalk.blue(`  - 重试退避因子: ${options.retryConfig?.backoffFactor || 1.5}`))
  console.log(chalk.bold.blue(`${'='.repeat(40)}\n`))
}

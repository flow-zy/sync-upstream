import type { SyncOptions } from './types'
import chalk from 'chalk'
import prompts from 'prompts'

export async function promptForOptions(initialOptions: Partial<SyncOptions> = {}) {
  console.log(chalk.bold.cyan('\n🔄 开源仓库目录同步工具\n'))

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
      message: '公司仓库分支名称:',
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
      message: '是否自动推送到公司仓库?',
      initial: initialOptions.autoPush !== undefined ? initialOptions.autoPush : true,
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
  console.log(chalk.bold.blue(`${'='.repeat(40)}\n`))
}

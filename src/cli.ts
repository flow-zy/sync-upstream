#!/usr/bin/env node

import type { SyncOptions } from './types'
import chalk from 'chalk'
import minimist from 'minimist'
import { loadConfig } from './config'
import { promptForOptions } from './prompts'
import { UpstreamSyncer } from './sync'
import pkg from '../package.json'

// 解析命令行参数
const args = minimist(process.argv.slice(2), {
  string: ['repo', 'branch', 'company-branch', 'dirs', 'message'],
  boolean: ['push', 'v', 'version', 'force'],
  alias: {
    r: 'repo',
    b: 'branch',
    c: 'company-branch',
    d: 'dirs',
    m: 'message',
    p: 'push',
    f: 'force',
    h: 'help',
    v: 'version',
  },
  default: {
    branch: 'master',
    'company-branch': 'master',
    dirs: '',
    message: 'Sync upstream changes to specified directories',
    push: false,
    force: true,
  },
})

// 显示版本信息
if (args.version) {
  console.log(chalk.bold.cyan(`sync-upstream v${pkg.version}`))
  process.exit(0)
}

// 显示帮助信息
if (args.help) {
  console.log(chalk.bold.cyan('仓库目录 - 交互版\n'))
  console.log('用法: sync-upstream [选项]\n')
  console.log('选项:')
  console.log('  -r, --repo <url>        上游仓库 URL')
  console.log('  -d, --dirs <目录>       要同步的目录，多个目录用逗号分隔')
  console.log('  -b, --branch <分支>      上游分支 (默认: main)')
  console.log('  -c, --company-branch <分支>  公司仓库分支 (默认: main)')
  console.log('  -m, --message <消息>    提交消息')
  console.log('  -p, --push              自动推送变更')
  console.log('  -f, --force             强制覆盖本地文件，不使用增量复制 (默认: true)')
  console.log('  -v, --version           显示版本信息')
  console.log('  -h, --help              显示帮助信息\n')
  console.log('示例:')
  console.log('  sync-upstream -r https://github.com/open-source/project.git -d src/core,docs')
  console.log('\n如果没有提供参数，将启动交互式向导')
  process.exit(0)
}

// 准备初始配置
const initialOptions: Partial<SyncOptions> = {
  upstreamRepo: args.repo,
  upstreamBranch: args.branch,
  companyBranch: args['company-branch'],
  syncDirs: args.dirs ? args.dirs.split(',').map((dir: string) => dir.trim()) : [],
  commitMessage: args.message,
  autoPush: args.push,
  forceOverwrite: args.force,
}

// 加载配置文件
let configOptions: Partial<SyncOptions> = {}

// 运行同步
;(async () => {
  try {
    // 加载配置文件
    configOptions = await loadConfig()

    // 合并配置文件和命令行参数，命令行参数优先级更高
    // 使用对象展开运算符，命令行参数会覆盖配置文件中的同名参数
    const mergedOptions: Partial<SyncOptions> = {
      ...configOptions,
      ...initialOptions,
    }

    // 特别处理 syncDirs，如果命令行参数为空但配置文件有值，则使用配置文件的值
    if (!mergedOptions.syncDirs || mergedOptions.syncDirs.length === 0) {
      mergedOptions.syncDirs = configOptions.syncDirs
    }

    // 如果缺少必要参数，启动交互式提示
    let options: SyncOptions
    if (
      !mergedOptions.upstreamRepo ||
      !mergedOptions.syncDirs ||
      mergedOptions.syncDirs.length === 0
    ) {
      options = await promptForOptions(mergedOptions)
    } else {
      // 使用合并后的参数
      options = {
        upstreamRepo: mergedOptions.upstreamRepo!,
        upstreamBranch: mergedOptions.upstreamBranch || 'master',
        companyBranch: mergedOptions.companyBranch || 'master',
        syncDirs: mergedOptions.syncDirs!,
        commitMessage: mergedOptions.commitMessage || 'Sync upstream changes',
        autoPush: mergedOptions.autoPush || false,
      }
    }

    const syncer = new UpstreamSyncer(options)
    await syncer.run()
  } catch (error) {
    console.error(chalk.red('发生错误:'), error)
    process.exit(1)
  }
})()

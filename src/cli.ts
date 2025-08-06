#!/usr/bin/env node

import type { SyncOptions } from './types'
import chalk from 'chalk'
import minimist from 'minimist'
import pkg from '../package.json'
import { loadConfig } from './config'
import { promptForOptions } from './prompts'
import { UpstreamSyncer } from './sync'

// 解析命令行参数
const args = minimist(process.argv.slice(2), {
  // 使用string类型并在后续代码中转换为数字
  string: ['repo', 'branch', 'company-branch', 'dirs', 'message', 'config', 'config-format', 'retry-max', 'retry-delay', 'retry-backoff'],
  boolean: ['push', 'v', 'version', 'force', 'verbose', 'silent', 'dry-run'],
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
    V: 'verbose',
    s: 'silent',
    n: 'dry-run',
    C: 'config',
    F: 'config-format',
    rm: 'retry-max',
    rd: 'retry-delay',
    rb: 'retry-backoff',
  },
  default: {
    'branch': 'master',
    'company-branch': 'master',
    'dirs': '',
    'message': 'Sync upstream changes to specified directories',
    'push': false,
    'force': true,
    'verbose': false,
    'silent': false,
    'dry-run': false,
    'config': '',
    'config-format': 'json',
    'retry-max': undefined,
    'retry-delay': undefined,
    'retry-backoff': undefined,
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
  console.log('  -V, --verbose           显示详细日志信息')
  console.log('  -s, --silent            静默模式，不输出日志')
  console.log('  -n, --dry-run           试运行模式，不实际执行同步操作')
  console.log('  -C, --config <路径>     指定配置文件路径')
  console.log('  -F, --config-format <格式> 配置文件格式 (json, yaml, toml)')
  console.log('  --rm, --retry-max <次数>   网络请求最大重试次数 (默认: 3)')
  console.log('  --rd, --retry-delay <毫秒>  初始重试延迟时间 (默认: 2000)')
  console.log('  --rb, --retry-backoff <因子> 重试退避因子 (默认: 1.5)')
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
  verbose: args.verbose,
  silent: args.silent,
  dryRun: args['dry-run'],
  retryConfig: {
    maxRetries: args['retry-max'],
    initialDelay: args['retry-delay'],
    backoffFactor: args['retry-backoff'],
  },
}

// 加载配置文件
let configOptions: Partial<SyncOptions> = {}

// 如果指定了配置文件路径，则使用该文件
const configPath = args.config ? args.config : null
const configFormat = args['config-format'] as 'json' | 'yaml' | 'toml'

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
      !mergedOptions.upstreamRepo
      || !mergedOptions.syncDirs
      || mergedOptions.syncDirs.length === 0
    ) {
      options = await promptForOptions(mergedOptions)
    }
    else {
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
  }
  catch (error) {
    console.error(chalk.red('发生错误:'), error)
    process.exit(1)
  }
})()

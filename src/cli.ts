import type { SyncOptions } from './types'
import minimist from 'minimist'

import { bold, cyan, green, red, yellow } from 'picocolors'
import simpleGit from 'simple-git'
import pkg from '../package.json'
import { loadConfig } from './config'
import { promptForOptions } from './prompts'
import { UpstreamSyncer } from './sync'

// 检查当前目录是否是Git仓库
async function isGitRepository(): Promise<boolean> {
  try {
    const git = simpleGit()
    await git.status()
    return true
  }
  catch (error) {
    return false
  }
}

// 解析命令行参数
const args = minimist(process.argv.slice(2), {
  // 使用string类型并在后续代码中转换为数字
  string: ['repo', 'branch', 'company-branch', 'dirs', 'message', 'config', 'config-format', 'retry-max', 'retry-delay', 'retry-backoff', 'concurrency'],
  boolean: ['push', 'v', 'version', 'force', 'verbose', 'silent', 'dry-run', 'preview-only', 'non-interactive', 'gray-release', 'full-release', 'rollback'],
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
      P: 'preview-only',
      C: 'config',
      F: 'config-format',
      rm: 'retry-max',
      rd: 'retry-delay',
      rb: 'retry-backoff',
      cl: 'concurrency',
      y: 'non-interactive',
      gr: 'gray-release',
      fr: 'full-release',
      ro: 'rollback',
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
    'preview-only': false,
    'config': '',
    'config-format': 'json',
    'retry-max': undefined,
    'retry-delay': undefined,
    'retry-backoff': undefined,
    'concurrency': undefined,
  },
})

// 显示版本信息
if (args.version) {
  console.log(bold(cyan(`sync-upstream v${pkg.version}`)))
  process.exit(0)
}

// 显示帮助信息
if (args.help) {
  console.log(bold(cyan('仓库目录 - 交互版\n')))
  console.log('用法: sync-upstream [选项]\n')
  console.log('选项:')
  console.log(green('  -r, --repo <url>        上游仓库 URL'))
  console.log(green('  -d, --dirs <目录>       要同步的目录，多个目录用逗号分隔'))
  console.log(green('  -b, --branch <分支>      上游分支 (默认: main)'))
  console.log(green('  -c, --company-branch <分支>  公司仓库分支 (默认: main)'))
  console.log(green('  -m, --message <消息>    提交消息'))
  console.log(green('  -p, --push              自动推送变更'))
  console.log(green('  -f, --force             强制覆盖本地文件，不使用增量复制 (默认: true)'))
  console.log(green('  -V, --verbose           显示详细日志信息'))
  console.log(green('  -s, --silent            静默模式，不输出日志'))
  console.log(green('  -n, --dry-run           试运行模式，不实际执行同步操作'))
  console.log(green('  -P, --preview-only      预览模式，只显示变更，不实际修改文件'))
  console.log(green('  -C, --config <路径>     指定配置文件路径'))
  console.log(green('  -F, --config-format <格式> 配置文件格式 (json, yaml, toml)'))
  console.log(green('  --rm, --retry-max <次数>   网络请求最大重试次数 (默认: 3)'))
  console.log(green('  --rd, --retry-delay <毫秒>  初始重试延迟时间 (默认: 2000)'))
  console.log(green('  --rb, --retry-backoff <因子> 重试退避因子 (默认: 1.5)'))
  console.log(green('  --cl, --concurrency <数量> 并行处理的最大文件数量 (默认: 5)'))
  console.log(green('  -v, --version           显示版本信息'))
  console.log(green('  -h, --help              显示帮助信息'))
  console.log(green('  -y, --non-interactive   非交互式模式，跳过所有确认提示'))
  console.log(green('  --gr, --gray-release    启用灰度发布模式'))
  console.log(green('  --fr, --full-release    执行全量发布'))
  console.log(green('  --ro, --rollback        执行回滚操作\n'))
  console.log('示例:')
  console.log(bold(cyan('  sync-upstream -r https://github.com/open-source/project.git -d src/core,docs')))
  console.log(`\n${yellow('如果没有提供参数，将启动交互式向导')}`)
  process.exit(0)
}

// 检查是否在Git仓库中
async function run() {
  const isGitRepo = await isGitRepository()
  if (!isGitRepo) {
    console.error(red('错误: 当前目录不是Git仓库。请在Git初始化后的目录中运行此工具。'))
    process.exit(1)
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
    previewOnly: args['preview-only'],
    concurrencyLimit: args.concurrency ? Number.parseInt(args.concurrency, 10) : undefined,
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

  // 确定是否启用非交互式模式
  // 只有当明确指定-y或--non-interactive时才是非交互式模式
  const nonInteractive = args['non-interactive'] || false

  // 即使在非交互式模式下，如果缺少必要参数（upstreamRepo或syncDirs），也强制进入交互式模式
  const forceInteractive = !mergedOptions.upstreamRepo || !mergedOptions.syncDirs || mergedOptions.syncDirs.length === 0
  const actualNonInteractive = nonInteractive && !forceInteractive

  // 启动交互式提示
  const options = await promptForOptions(mergedOptions, actualNonInteractive)

  try {
    const syncer = new UpstreamSyncer(options)
    
    // 处理灰度发布相关命令
    if (args['gray-release']) {
      console.log(bold(cyan('启用灰度发布模式...')))
      // 这里可以添加灰度发布的特定配置
      options.grayRelease = options.grayRelease || {
        enabled: true,
        strategy: 'PERCENTAGE',
        percentage: 20
      }
    }
    
    if (args['full-release']) {
      console.log(bold(cyan('执行全量发布...')))
      await syncer.executeFullRelease()
      process.exit(0)
    }
    
    if (args['rollback']) {
      console.log(bold(cyan('执行回滚操作...')))
      await syncer.rollback()
      process.exit(0)
    }
    
    await syncer.run()
  }
  catch (error) {
    console.error(red('发生错误:'), error)
    process.exit(1)
  }
}

// 运行主函数
run()

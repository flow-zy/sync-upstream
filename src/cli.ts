import type { SyncOptions } from './types'
import toml from '@iarna/toml'
import fs from 'fs-extra'
import yaml from 'js-yaml'
import json5 from 'json5'
import minimist from 'minimist'
import { bold, cyan, green, yellow } from 'picocolors'
import simpleGit from 'simple-git'
import pkg from '../package.json'

import { DEFAULT_CONFIG, generateDefaultConfig, loadConfig, validateConfig } from './config'

import { logger, LogLevel } from './logger'
import { promptForOptions } from './prompts'
import { UpstreamSyncer } from './sync'
import { GrayReleaseStrategy } from './types'

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
  string: ['repo', 'branch', 'company-branch', 'dirs', 'message', 'config', 'config-format', 'retry-max', 'retry-delay', 'retry-backoff', 'concurrency', 'webhook-port', 'webhook-path', 'webhook-secret', 'webhook-events', 'webhook-branch'],
  boolean: ['push', 'v', 'version', 'force', 'verbose', 'silent', 'dry-run', 'preview-only', 'non-interactive', 'gray-release', 'full-release', 'rollback', 'webhook-enable', 'generate-config'],
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
    g: 'generate-config',
    gr: 'gray-release',
    fr: 'full-release',
    ro: 'rollback',
    we: 'webhook-enable',
    wp: 'webhook-port',
    wpa: 'webhook-path',
    ws: 'webhook-secret',
    wev: 'webhook-events',
    wb: 'webhook-branch',
  },
  default: {
    'branch': 'main',
    'company-branch': undefined,
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
    'generate-config': false,
    'retry-max': undefined,
    'retry-delay': undefined,
    'retry-backoff': undefined,
    'concurrency': undefined,
    'webhook-enable': false,
    'webhook-port': '3000',
    'webhook-path': '/webhook',
    'webhook-secret': '',
    'webhook-events': 'push',
    'webhook-branch': 'main',
  },
})

// 显示版本信息
if (args.version) {
  logger.success(bold(cyan(`sync-upstream v${pkg.version}`)))
  process.exit(0)
}

// 显示帮助信息
if (args.help) {
  logger.info(bold(cyan('仓库目录 - 交互版\n')))
  logger.info('用法: sync-upstream [选项]\n')
  logger.info('选项:')
  logger.info(green('  -r, --repo <url>        上游仓库 URL'))
  logger.info(green('  -d, --dirs <目录>       要同步的目录，多个目录用逗号分隔'))
  logger.info(green('  -b, --branch <分支>      上游分支 (默认: main)'))
  logger.info(green('  -c, --company-branch <分支>  目标仓库分支 (默认: main)'))
  logger.info(green('  -m, --message <消息>    提交消息'))
  logger.info(green('  -p, --push              自动推送变更'))
  logger.info(green('  -f, --force             强制覆盖本地文件，不使用增量复制 (默认: true)'))
  logger.info(green('  -V, --verbose           显示详细日志信息'))
  logger.info(green('  -s, --silent            静默模式，不输出日志'))
  logger.info(green('  -n, --dry-run           试运行模式，不实际执行同步操作'))
  logger.info(green('  -P, --preview-only      预览模式，只显示变更，不实际修改文件'))
  logger.info(green('  -C, --config <路径>     指定配置文件路径'))
  logger.info(green('  -F, --config-format <格式> 配置文件格式 (json, yaml, toml)'))
  logger.info(green('  -g, --generate-config   生成默认配置文件'))
  logger.info(green('  --rm, --retry-max <次数>   网络请求最大重试次数 (默认: 3)'))
  logger.info(green('  --rd, --retry-delay <毫秒>  初始重试延迟时间 (默认: 2000)'))
  logger.info(green('  --rb, --retry-backoff <因子> 重试退避因子 (默认: 1.5)'))
  logger.info(green('  --cl, --concurrency <数量> 并行处理的最大文件数量 (默认: 5)'))
  logger.info(green('  -v, --version           显示版本信息'))
  logger.info(green('  -h, --help              显示帮助信息'))
  logger.info(green('  -y, --non-interactive   非交互式模式，跳过所有确认提示'))
  logger.info(green('  -gr, --gray-release     启用灰度发布模式'))
  logger.info(green('  -fr, --full-release     执行全量发布'))
  logger.info(green('  -ro, --rollback         执行回滚操作'))
  logger.info(green('  -we, --webhook-enable   启用Webhook功能'))
  logger.info(green('  -wp, --webhook-port     Webhook监听端口'))
  logger.info(green('  -wpa, --webhook-path    Webhook路径'))
  logger.info(green('  -ws, --webhook-secret   Webhook密钥'))
  logger.info(green('  -wev, --webhook-events  Webhook允许的事件类型'))
  logger.info(green('  -wb, --webhook-branch   Webhook触发分支\n'))
  logger.info('示例:')
  logger.info(bold(cyan('  sync-upstream -r https://github.com/open-source/project.git -d src/core,docs')))
  logger.info(`\n${yellow('如果没有提供参数，将启动交互式向导')}`)
  process.exit(0)
}

// 生成默认配置文件
if (args['generate-config']) {
  (async () => {
    const configPath = args.config || './sync-upstream.config.json'
    const configFormat = args['config-format'] as 'json' | 'yaml' | 'toml'
    logger.info(`正在生成默认配置文件到 ${configPath} (格式: ${configFormat})`)
    await generateDefaultConfig(configPath, configFormat)
    process.exit(0)
  })()
}

// 检查是否在Git仓库中
async function run() {
  const isGitRepo = await isGitRepository()
  if (!isGitRepo) {
    logger.error('当前目录不是Git仓库。请在Git初始化后的目录中运行此工具。')
    process.exit(1)
  }

  // 根据命令行参数设置日志级别
  if (args.silent) {
    logger.setLevel(LogLevel.ERROR)
  }
  else if (args.verbose) {
    logger.setLevel(LogLevel.VERBOSE)
  }
  else {
    logger.setLevel(LogLevel.INFO)
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
    nonInteractive: args['non-interactive'],
    concurrencyLimit: args.concurrency ? Number.parseInt(args.concurrency, 10) : undefined,
    retryConfig: {
      maxRetries: args['retry-max'],
      initialDelay: args['retry-delay'],
      backoffFactor: args['retry-backoff'],
    },
    // 灰度发布配置
    grayReleaseConfig: args['gray-release'] ? {
      enable: true,
      strategy: GrayReleaseStrategy.PERCENTAGE, // 默认策略
      percentage: 100, // 默认100%
    } : undefined,
    // Webhook配置
    webhookConfig: args['webhook-enable']
      ? {
          enable: true,
          port: Number.parseInt(args['webhook-port'], 10),
          path: args['webhook-path'],
          secret: args['webhook-secret'],
          allowedEvents: args['webhook-events'].split(',').map((event: string) => event.trim()),
          triggerBranch: args['webhook-branch'],
        }
      : undefined,
    // 全量发布和回滚标记
    fullRelease: args['full-release'],
    rollback: args.rollback,
  }

  // 加载配置文件
  let configOptions: Partial<SyncOptions> = {}

  // 如果指定了配置文件路径，则使用该文件
  const configPath = args.config ? args.config : null
  const configFormat = args['config-format'] as 'json' | 'yaml' | 'toml'

  // 加载配置文件
  if (configPath) {
    try {
      logger.trace(`尝试加载指定的配置文件: ${configPath}`)
      const fileContent = await fs.readFile(configPath, 'utf8')
      let config: Partial<SyncOptions> = {}

      // 根据文件扩展名选择解析方法
      if (configPath.endsWith('.json5')) {
        config = json5.parse(fileContent)
      }
      else if (configPath.endsWith('.json')) {
        config = JSON.parse(fileContent)
      }
      else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        config = yaml.load(fileContent) as Partial<SyncOptions>
      }
      else if (configPath.endsWith('.toml')) {
        config = toml.parse(fileContent) as Partial<SyncOptions>
      }
      else {
        // 尝试作为JSON解析
        config = JSON.parse(fileContent)
      }

      // 验证配置
      validateConfig(config)
      logger.debug(`指定的配置文件 ${configPath} 加载成功`)
      configOptions = { ...DEFAULT_CONFIG, ...config }
    }
    catch (error) {
      logger.error(`读取指定的配置文件 ${configPath} 失败`, error as Error)
      process.exit(1)
    }
  }
  else {
    // 未指定配置文件，查找默认配置文件
    configOptions = await loadConfig()
  }

  // 合并配置文件和命令行参数，配置文件优先级更高
  // 先处理对象类型的配置项
  const mergedOptions: Partial<SyncOptions> = {
    ...initialOptions,
    ...configOptions,
  }

  // 特别处理 syncDirs 数组
  // 如果配置文件中指定了 syncDirs，则优先使用配置文件的值
  if (configOptions.syncDirs && configOptions.syncDirs.length > 0) {
    mergedOptions.syncDirs = configOptions.syncDirs
  }
  else if (initialOptions.syncDirs && initialOptions.syncDirs.length > 0) {
  // 如果配置文件中没有指定，但命令行参数中有值，则使用命令行的值
    mergedOptions.syncDirs = initialOptions.syncDirs
  }
  else {
  // 如果都没有指定，则设为空数组
    mergedOptions.syncDirs = []
  }

  // 确定是否启用非交互式模式
  // 只有当明确指定-y或--non-interactive时才是非交互式模式
  const nonInteractive = args['non-interactive'] || false

  // 即使在非交互式模式下，如果缺少必要参数（upstreamRepo或syncDirs），也强制进入交互式模式
  const forceInteractive = !mergedOptions.upstreamRepo || !mergedOptions.syncDirs || mergedOptions.syncDirs.length === 0
  const actualNonInteractive = nonInteractive && !forceInteractive

  // 检查是否有未知参数
  const unknownParams = Object.keys(args).filter(key => !['_', 'repo', 'r', 'branch', 'b', 'company-branch', 'c', 'dirs', 'd', 'message', 'm', 'push', 'p', 'force', 'f', 'verbose', 'V', 'silent', 's', 'dry-run', 'n', 'preview-only', 'P', 'config', 'C', 'config-format', 'F', 'retry-max', 'rm', 'retry-delay', 'rd', 'retry-backoff', 'rb', 'concurrency', 'cl', 'non-interactive', 'y', 'gray-release', 'gr', 'full-release', 'fr', 'rollback', 'ro', 'help', 'h', 'version', 'v', 'webhook-enable', 'webhook-port', 'webhook-path', 'webhook-secret', 'webhook-events', 'webhook-branch', 'we', 'wp', 'wpa', 'ws', 'wev', 'wb', 'generate-config', 'g'].includes(key))
  if (unknownParams.length > 0) {
    logger.error('检测到未知的配置项:', undefined, { unknownParams })
    logger.warn('请使用 --help 查看所有可用的配置项')
    process.exit(1)
  }

  // 启动交互式提示
  const options = await promptForOptions(mergedOptions, actualNonInteractive) as SyncOptions

  try {
    const startTime = performance.now()
    const syncer = new UpstreamSyncer(options)
    await syncer.run()
    const endTime = performance.now()
    logger.perf('同步操作总耗时', endTime - startTime)
  }
  catch (error) {
    logger.error('发生错误:', error as Error)
    process.exit(1)
  }
}

// 运行主函数
run()

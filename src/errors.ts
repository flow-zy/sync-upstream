import chalk from 'chalk'

/**
 * 自定义错误基类
 */
export abstract class SyncError extends Error {
  public readonly code: string
  public readonly originalError?: Error
  public readonly timestamp: Date

  constructor(message: string, code: string, originalError?: Error) {
    super(message)
    this.code = code
    this.originalError = originalError
    this.timestamp = new Date()
    this.name = this.constructor.name

    // 修复继承链
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * 显示友好的错误信息
   */
  public display(): void {
    console.error(chalk.bold.red(`
❌ ${this.name} (${this.code}):`))
    console.error(chalk.red(this.message))

    if (this.originalError) {
      console.error(chalk.yellow('原始错误:'))
      console.error(chalk.yellow(this.originalError.message))
    }
  }
}

/**
 * 配置错误
 */
export class ConfigError extends SyncError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONFIG_ERROR', originalError)
  }
}

/**
 * Git 错误
 */
export class GitError extends SyncError {
  constructor(message: string, originalError?: Error) {
    super(message, 'GIT_ERROR', originalError)
  }
}

/**
 * 文件系统错误
 */
export class FsError extends SyncError {
  constructor(message: string, originalError?: Error) {
    super(message, 'FS_ERROR', originalError)
  }
}

/**
 * 网络错误
 */
export class NetworkError extends SyncError {
  constructor(message: string, originalError?: Error) {
    super(message, 'NETWORK_ERROR', originalError)
  }
}

/**
 * 用户取消操作错误
 */
export class UserCancelError extends SyncError {
  constructor(message: string = '用户取消了操作') {
    super(message, 'USER_CANCEL')
  }
}

/**
 * 同步过程错误
 */
export class SyncProcessError extends SyncError {
  constructor(message: string, originalError?: Error) {
    super(message, 'SYNC_PROCESS_ERROR', originalError)
  }
}

/**
 * 错误处理工具函数
 */
export function handleError(error: Error): void {
  if (error instanceof SyncError) {
    error.display()
  }
  else {
    console.error(chalk.bold.red('\n❌ 发生未知错误:'))
    console.error(chalk.red(error.message))
    console.error(chalk.red(error.stack || ''))
  }
  console.error(chalk.red('='.repeat(50)))
}

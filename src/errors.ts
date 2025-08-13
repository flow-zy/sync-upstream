import { blue, bold, red, yellow } from 'picocolors'
import { logger } from './logger'

// 错误类型枚举
export enum ErrorType {
  CONFIG = 'CONFIG_ERROR',
  GIT = 'GIT_ERROR',
  FS = 'FS_ERROR',
  NETWORK = 'NETWORK_ERROR',
  USER_CANCEL = 'USER_CANCEL',
  SYNC_PROCESS = 'SYNC_PROCESS_ERROR',
  CONFLICT = 'CONFLICT_ERROR',
  AUTHENTICATION = 'AUTH_ERROR',
  PERMISSION = 'PERMISSION_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
}

// 错误严重程度枚举
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 自定义错误基类
 */
export abstract class SyncError extends Error {
  public readonly code: string
  public readonly originalError?: Error
  public readonly timestamp: Date
  public readonly severity: ErrorSeverity
  public readonly context?: Record<string, any>

  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    originalError?: Error,
    context?: Record<string, any>,
  ) {
    super(message)
    this.code = code
    this.severity = severity
    this.originalError = originalError
    this.timestamp = new Date()
    this.context = context
    this.name = this.constructor.name

    // 修复继承链
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * 显示友好的错误信息
   */
  public display(): void {
    const severityColor = this.getSeverityColor()
    console.error(severityColor(`
❌ ${this.name} (${this.code}):`))
    console.error(severityColor(this.message))

    if (this.context) {
      console.error(blue('错误上下文:'))
      console.error(blue(JSON.stringify(this.context, null, 2)))
    }

    if (this.originalError) {
      console.error(yellow('原始错误:'))
      console.error(yellow(this.originalError.message))
      // 记录完整错误栈到日志
      logger.error(`原始错误栈: ${this.originalError.stack || '无'}`)
    }

    // 记录错误到日志
    this.logError()
  }

  /**
   * 根据错误严重程度获取对应的颜色
   */
  private getSeverityColor() {
    switch (this.severity) {
      case ErrorSeverity.INFO:
        return blue
      case ErrorSeverity.WARNING:
        return yellow
      case ErrorSeverity.ERROR:
        return red
      case ErrorSeverity.CRITICAL:
        return bold(red)
      default:
        return red
    }
  }

  /**
   * 记录错误到日志
   */
  private logError(): void {
    const errorData = {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      originalError: this.originalError?.message,
    }

    switch (this.severity) {
      case ErrorSeverity.INFO:
        logger.info(JSON.stringify(errorData))
        break
      case ErrorSeverity.WARNING:
        logger.warn(JSON.stringify(errorData))
        break
      case ErrorSeverity.ERROR:
        logger.error(JSON.stringify(errorData))
        break
      case ErrorSeverity.CRITICAL:
        logger.error(bold(red)(JSON.stringify(errorData)))
        break
    }
  }
}

/**
 * 配置错误
 */
export class ConfigError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.CONFIG, ErrorSeverity.ERROR, originalError, context)
  }
}

/**
 * Git 错误
 */
export class GitError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.GIT, ErrorSeverity.ERROR, originalError, context)
  }
}

/**
 * 文件系统错误
 */
export class FsError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.FS, ErrorSeverity.ERROR, originalError, context)
  }
}

/**
 * 网络错误
 */
export class NetworkError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.NETWORK, ErrorSeverity.WARNING, originalError, context)
  }
}

/**
 * 用户取消操作错误
 */
export class UserCancelError extends SyncError {
  constructor(message: string = '用户取消了操作', context?: Record<string, any>) {
    super(message, ErrorType.USER_CANCEL, ErrorSeverity.INFO, undefined, context)
  }
}

/**
 * 同步过程错误
 */
export class SyncProcessError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.SYNC_PROCESS, ErrorSeverity.ERROR, originalError, context)
  }
}

/**
 * 冲突错误
 */
export class ConflictError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.CONFLICT, ErrorSeverity.ERROR, originalError, context)
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.AUTHENTICATION, ErrorSeverity.CRITICAL, originalError, context)
  }
}

/**
 * 权限错误
 */
export class PermissionError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.PERMISSION, ErrorSeverity.ERROR, originalError, context)
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.TIMEOUT, ErrorSeverity.WARNING, originalError, context)
  }
}

/**
 * 验证错误
 */
export class ValidationError extends SyncError {
  constructor(message: string, originalError?: Error, context?: Record<string, any>) {
    super(message, ErrorType.VALIDATION, ErrorSeverity.WARNING, originalError, context)
  }
}

/**
 * 错误处理工具函数
 */
export function handleError(error: Error): void {
  if (error instanceof SyncError) {
    error.display()

    // 根据错误严重程度决定是否退出进程
    if (error.severity === ErrorSeverity.CRITICAL) {
      logger.error('发生严重错误，程序将退出')
      process.exit(1)
    }
  }
  else {
    const unknownError = new SyncProcessError(
      '发生未知错误',
      error,
    )
    unknownError.display()
    process.exit(1)
  }
}

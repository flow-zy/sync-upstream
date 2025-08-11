import type { ConsolaInstance } from 'consola'
import path from 'node:path'
import chalk from 'chalk'
import { consola } from 'consola'
import { format } from 'date-fns'
import fs from 'fs-extra'

// 定义日志级别
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  SUCCESS = 'success',
  WARN = 'warn',
  ERROR = 'error',
  VERBOSE = 'verbose',
}

// 日志配置接口
export interface LoggerConfig {
  level: LogLevel
  logToFile: boolean
  logFilePath: string
  showTimestamp: boolean
  showLevel: boolean
}

// 默认日志配置
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  logToFile: false,
  logFilePath: path.join(process.cwd(), 'sync-upstream.log'),
  showTimestamp: true,
  showLevel: true,
}

export class Logger {
  private consola: ConsolaInstance
  private config: LoggerConfig
  private logLevels = [
    LogLevel.DEBUG,
    LogLevel.VERBOSE,
    LogLevel.INFO,
    LogLevel.SUCCESS,
    LogLevel.WARN,
    LogLevel.ERROR,
  ]

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.consola = consola.create({
      level: this.logLevels.indexOf(this.config.level),
      formatOptions: {
        colors: true,
        date: this.config.showTimestamp,
      },
    })

    // 如果配置了日志文件，确保目录存在
    if (this.config.logToFile) {
      fs.ensureDirSync(path.dirname(this.config.logFilePath))
    }
  }

  // 获取当前时间戳
  private getTimestamp(): string {
    return format(new Date(), 'YYYY-MM-DD HH:mm:ss')
  }

  // 记录到文件
  private logToFile(level: LogLevel, message: string): void {
    if (!this.config.logToFile)
      return

    const timestamp = this.getTimestamp()
    const logMessage = this.config.showLevel
      ? `[${timestamp}] [${level.toUpperCase()}] ${message}\n`
      : `[${timestamp}] ${message}\n`

    fs.appendFile(this.config.logFilePath, logMessage)
      .catch(error => console.error('写入日志文件失败:', error))
  }

  // 调试日志
  debug(message: string): void {
    if (this.logLevels.indexOf(LogLevel.DEBUG) >= this.logLevels.indexOf(this.config.level)) {
      this.consola.debug(chalk.blue(`[DEBUG] ${message}`))
      this.logToFile(LogLevel.DEBUG, message)
    }
  }

  // 详细日志
  verbose(message: string): void {
    if (this.logLevels.indexOf(LogLevel.VERBOSE) >= this.logLevels.indexOf(this.config.level)) {
      this.consola.log(chalk.grey(`[VERBOSE] ${message}`))
      this.logToFile(LogLevel.VERBOSE, message)
    }
  }

  // 设置日志级别
  setLevel(level: LogLevel): void {
    this.config.level = level
    this.consola.level = this.logLevels.indexOf(level)
  }

  // 信息日志
  info(message: string): void {
    if (this.logLevels.indexOf(LogLevel.INFO) >= this.logLevels.indexOf(this.config.level)) {
      this.consola.info(chalk.cyan(`[INFO] ${message}`))
      this.logToFile(LogLevel.INFO, message)
    }
  }

  // 成功日志
  success(message: string): void {
    if (this.logLevels.indexOf(LogLevel.SUCCESS) >= this.logLevels.indexOf(this.config.level)) {
      this.consola.success(chalk.green(`[SUCCESS] ${message}`))
      this.logToFile(LogLevel.SUCCESS, message)
    }
  }

  // 警告日志
  warn(message: string): void {
    if (this.logLevels.indexOf(LogLevel.WARN) >= this.logLevels.indexOf(this.config.level)) {
      this.consola.warn(chalk.yellow(`[WARN] ${message}`))
      this.logToFile(LogLevel.WARN, message)
    }
  }

  // 错误日志
  error(message: string, error?: Error): void {
    if (this.logLevels.indexOf(LogLevel.ERROR) >= this.logLevels.indexOf(this.config.level)) {
      const errorMessage = error ? `${message}: ${error.message}` : message
      this.consola.error(chalk.red(`[ERROR] ${errorMessage}`))
      this.logToFile(LogLevel.ERROR, errorMessage)

      // 如果有错误堆栈，也记录下来
      if (error?.stack) {
        this.logToFile(LogLevel.ERROR, `Stack trace: ${error.stack}`)
      }
    }
  }

  // 步骤日志（用于显示同步过程中的主要步骤）
  step(stepNumber: number, message: string): void {
    const formattedMessage = chalk.bold.magenta(`
${stepNumber}. ${message}`)
    this.consola.log(formattedMessage)
    this.logToFile(LogLevel.INFO, `Step ${stepNumber}: ${message}`)
  }

  // 更新配置
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
    this.consola = consola.create({
      level: this.logLevels.indexOf(this.config.level),
      formatOptions: {
        colors: true,
        date: this.config.showTimestamp,
      },
    })
  }
}

// 创建默认 logger 实例
export const logger = new Logger()

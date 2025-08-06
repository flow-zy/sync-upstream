import { NetworkError } from './errors'
import { logger } from './logger'

type RetryableFunction<T> = () => Promise<T>

export interface RetryConfig {
  maxRetries: number
  initialDelay: number
  backoffFactor: number
}

/**
 * 通用重试工具函数
 * @param fn 要执行的异步函数
 * @param config 重试配置
 * @param isNetworkError 判断是否为网络错误的函数
 * @returns 函数执行结果
 */
export async function withRetry<T>(
  fn: RetryableFunction<T>,
  config: RetryConfig,
  isNetworkError: (error: Error) => boolean = (error) => {
    const message = error.message.toLowerCase()
    return message.includes('network') || message.includes('connect')
  },
): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = config.initialDelay * config.backoffFactor ** (attempt - 1)
        logger.info(`正在进行第 ${attempt}/${config.maxRetries} 次重试，延迟 ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      return await fn()
    }
    catch (error) {
      lastError = error as Error

      // 只有网络错误才重试
      if (!isNetworkError(lastError)) {
        logger.error(`非网络错误，不进行重试: ${lastError.message}`)
        throw lastError
      }

      // 如果达到最大重试次数，则抛出错误
      if (attempt >= config.maxRetries) {
        logger.error(`达到最大重试次数(${config.maxRetries})，请求失败: ${lastError.message}`)
        throw new NetworkError('网络请求失败', lastError)
      }

      logger.warn(`请求失败(第 ${attempt} 次尝试): ${lastError.message}`)
    }
  }

  // 理论上不会到达这里，但为了类型安全
  throw lastError!
}

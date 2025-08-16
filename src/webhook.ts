import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SyncOptions } from './types'
import { parse } from 'node:url'
import { loadConfig } from './config'
import { logger } from './logger'
import { UpstreamSyncer } from './sync'

export interface WebhookConfig {
  /** 是否启用Webhook */
  enable: boolean
  /** Webhook监听端口 */
  port: number
  /** Webhook路径 */
  path: string
  /** 用于验证Webhook请求的密钥 */
  secret: string
  /** 允许的事件类型列表 */
  allowedEvents: string[]
  /** 触发同步的分支 */
  triggerBranch: string
}

/**
 * Webhook服务器类
 * 用于接收上游仓库的Webhook通知并触发同步
 */
export class WebhookServer {
  private server: any
  private config: WebhookConfig
  private syncOptions: SyncOptions

  constructor(config: WebhookConfig, syncOptions: SyncOptions) {
    this.config = config
    this.syncOptions = syncOptions
    this.server = null
  }

  /**
   * 启动Webhook服务器
   */
  async start(): Promise<void> {
    if (!this.config.enable) {
      logger.info('Webhook已禁用，跳过启动')
      return
    }

    // 动态导入http模块，避免不必要的依赖
    const http = await import('node:http')

    this.server = http.createServer(this.handleRequest.bind(this))

    this.server.listen(this.config.port, () => {
      logger.success(`Webhook服务器已启动，监听端口: ${this.config.port}，路径: ${this.config.path}`)
    })

    // 处理服务器错误
    this.server.on('error', (error: Error) => {
      logger.error(`Webhook服务器错误: ${error.message}`)
    })
  }

  /**
   * 停止Webhook服务器
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        logger.success('Webhook服务器已停止')
      })
    }
  }

  /**
   * 处理Webhook请求
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { url, method } = req
    const parsedUrl = parse(url || '', true)

    // 检查路径是否匹配
    if (parsedUrl.pathname !== this.config.path || method !== 'POST') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    // 验证请求签名
    if (!this.verifySignature(req)) {
      res.writeHead(401)
      res.end('Unauthorized')
      return
    }

    // 解析请求体
    const body = await this.getRequestBody(req)

    // 验证事件类型
    const eventType = req.headers['x-github-event'] || req.headers['x-gitlab-event'] || ''
    if (!this.config.allowedEvents.includes(eventType as string)) {
      logger.info(`忽略不支持的事件类型: ${eventType}`)
      res.writeHead(200)
      res.end('Ignored event type')
      return
    }

    // 提取分支信息
    const branch = this.extractBranchFromPayload(body, eventType as string)
    if (!branch) {
      logger.info('无法从请求体中提取分支信息')
      res.writeHead(200)
      res.end('No branch information')
      return
    }

    // 检查是否是触发分支
    if (branch !== this.config.triggerBranch) {
      logger.info(`忽略非触发分支: ${branch}`)
      res.writeHead(200)
      res.end('Ignored branch')
      return
    }

    // 触发同步
    try {
      logger.info(`收到Webhook触发，开始同步分支: ${branch}`)
      const syncer = new UpstreamSyncer(this.syncOptions)
      await syncer.run()
      logger.success('Webhook触发的同步完成')

      res.writeHead(200)
      res.end('Sync completed successfully')
    }
    catch (error) {
      logger.error(`Webhook触发的同步失败: ${error instanceof Error ? error.message : String(error)}`)
      res.writeHead(500)
      res.end('Sync failed')
    }
  }

  /**
   * 验证Webhook请求签名
   */
  private verifySignature(req: IncomingMessage): boolean {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-gitlab-token'] || ''

    // 简化版的签名验证，实际应用中应使用正确的加密算法验证
    // 这里只是一个示例实现
    if (!signature || typeof signature !== 'string') {
      return false
    }

    // 对于演示 purposes，我们仅检查secret是否匹配
    // 实际应用中应使用HMAC等算法验证签名
    return Boolean(this.config.secret && signature.includes(this.config.secret))
  }

  /**
   * 获取请求体
   */
  private async getRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(body))
        }
        catch (error) {
          reject(new Error('无效的JSON请求体'))
        }
      })
      req.on('error', reject)
    })
  }

  /**
   * 从请求体中提取分支信息
   */
  private extractBranchFromPayload(payload: any, eventType: string): string | null {
    // 根据不同的事件类型和Git服务提供商提取分支信息
    // 这里提供了GitHub和GitLab的常见事件处理
    if (eventType === 'push') {
      // GitHub push event
      if (payload.ref) {
        return payload.ref.split('/').pop() || null
      }
      // GitLab push event
      if (payload.ref && payload.repository) {
        return payload.ref.split('/').pop() || null
      }
    }
    else if (eventType === 'pull_request') {
      // GitHub pull request event
      if (payload.pull_request && payload.pull_request.head && payload.pull_request.head.ref) {
        return payload.pull_request.head.ref
      }
    }

    return null
  }
}

/**
 * 创建Webhook服务器
 */
export async function createWebhookServer(): Promise<WebhookServer | null> {
  try {
    const syncOptions = await loadConfig()
    // 确保syncOptions中有webhookConfig
    if (!syncOptions.webhookConfig || !syncOptions.webhookConfig.enable) {
      logger.info('Webhook未配置或已禁用')
      return null
    }

    const webhookServer = new WebhookServer(syncOptions.webhookConfig, syncOptions as SyncOptions)
    await webhookServer.start()
    return webhookServer
  }
  catch (error) {
    logger.error(`创建Webhook服务器失败: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

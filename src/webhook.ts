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

    // 记录请求信息
    const eventType = req.headers['x-github-event'] || req.headers['x-gitlab-event'] || req.headers['x-bitbucket-event'] || 'unknown'
    const clientIp = this.getClientIp(req)
    logger.info(`收到Webhook请求: ${eventType} 从 ${clientIp}`)

    // 解析请求体
    let body: any
    try {
      body = await this.getRequestBody(req)
    }
    catch (parseError) {
      res.writeHead(400)
      res.end('Invalid payload format')
      logger.warn(`Webhook请求被拒绝: 无效的payload格式 - ${parseError instanceof Error ? parseError.message : String(parseError)}`)
      return
    }

    // 验证请求签名
    if (!this.verifySignature(req, JSON.stringify(body))) {
      res.writeHead(401)
      res.end('Unauthorized')
      logger.warn('Webhook请求被拒绝: 签名无效')
      return
    }

    // 验证事件类型
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

    // 记录Webhook触发历史
    this.recordWebhookEvent(eventType as string, branch, body, clientIp)

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
      res.end(`Sync failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 记录Webhook事件历史
   */
  private recordWebhookEvent(eventType: string, branch: string, payload: any, ip: string): void {
    const eventHistory = {
      timestamp: new Date().toISOString(),
      eventType,
      branch,
      ip,
      payload: JSON.stringify(payload, null, 2),
    }

    // 在实际应用中，可能会将事件历史存储到数据库或文件中
    logger.info(`Webhook事件已记录: ${eventType} 用于分支 ${branch}`)
  }

  /**
   * 获取客户端IP地址
   */
  private getClientIp(req: IncomingMessage): string {
    // 考虑代理环境下的IP获取
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string') {
      return xff.split(',')[0].trim()
    }
    return req.socket.remoteAddress || 'unknown'
  }

  /**
   * 验证Webhook请求签名
   */
  private verifySignature(req: IncomingMessage, body: string): boolean {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-gitlab-token'] || ''

    if (!signature || typeof signature !== 'string') {
      return false
    }

    // 如果没有配置secret，则跳过验证
    if (!this.config.secret) {
      logger.warn('Webhook secret未配置，跳过签名验证')
      return true
    }

    // GitHub签名验证 (x-hub-signature-256)
    if (signature.startsWith('sha256=')) {
      const crypto = require('node:crypto')
      const hmac = crypto.createHmac('sha256', this.config.secret)
      const digest = `sha256=${hmac.update(body).digest('hex')}`
      return signature === digest
    }

    // GitLab签名验证 (x-gitlab-token)
    if (req.headers['x-gitlab-token']) {
      return signature === this.config.secret
    }

    // Bitbucket签名验证 (x-hub-signature)
    if (req.headers['x-hub-signature']) {
      const crypto = require('node:crypto')
      const hmac = crypto.createHmac('sha256', this.config.secret)
      const digest = hmac.update(body).digest('hex')
      return signature === digest
    }

    // 未知的签名类型，默认拒绝
    logger.warn('未知的Webhook签名类型')
    return false
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

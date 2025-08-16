import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SyncOptions, WebhookConfig } from './types'
import { parse } from 'node:url'
import { loadConfig } from './config'
import { logger } from './logger'
import { UpstreamSyncer } from './sync'

/**
 * 延迟执行函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Webhook服务器类
 * 用于接收上游仓库的Webhook通知并触发同步
 */
export class WebhookServer {
  private server: any
  private config: WebhookConfig
  private syncOptions: SyncOptions
  private requestQueue: Array<{ timestamp: number, ip: string }> = []
  private activeRetries: Map<string, number> = new Map()

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
    const eventType = this.detectEventType(req)
    const clientIp = this.getClientIp(req)
    logger.info(`收到Webhook请求: ${eventType} 从 ${clientIp}`)

    // 安全检查: IP白名单
    if (!this.checkIpWhitelist(clientIp)) {
      res.writeHead(403)
      res.end('Forbidden: IP not in whitelist')
      logger.warn(`Webhook请求被拒绝: IP不在白名单中 - ${clientIp}`)
      return
    }

    // 安全检查: 限流
    if (!this.checkRateLimit(clientIp)) {
      const { rateLimit } = this.config.securityConfig || { rateLimit: { statusCode: 429, message: 'Rate limit exceeded' } }
      res.writeHead(rateLimit.statusCode)
      res.end(rateLimit.message)
      logger.warn(`Webhook请求被拒绝: 超出限流 - ${clientIp}`)
      return
    }

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
    if (!this.config.allowedEvents.includes(eventType)) {
      logger.info(`忽略不支持的事件类型: ${eventType}`)
      res.writeHead(200)
      res.end('Ignored event type')
      return
    }

    // 应用更精细的事件过滤规则
    if (!this.applyEventFilters(eventType, body)) {
      logger.info(`Webhook请求被过滤: ${eventType}`)
      res.writeHead(200)
      res.end('Event filtered out')
      return
    }

    // 提取分支信息
    const branch = this.extractBranchFromPayload(body, eventType)
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
    this.recordWebhookEvent(eventType, branch, body, clientIp)

    // 触发同步 (带重试机制)
    const requestId = `${clientIp}-${Date.now()}`
    try {
      await this.triggerSyncWithRetry(branch, requestId)
      logger.success('Webhook触发的同步完成')
      res.writeHead(200)
      res.end('Sync completed successfully')
    }
    catch (error) {
      logger.error(`Webhook触发的同步最终失败: ${error instanceof Error ? error.message : String(error)}`)
      res.writeHead(500)
      res.end(`Sync failed after retries: ${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
      // 清理重试记录
      this.activeRetries.delete(requestId)
    }
  }

  /**
   * 检测事件类型和平台
   */
  private detectEventType(req: IncomingMessage): string {
    // 根据请求头检测平台和事件类型
    const githubEvent = req.headers['x-github-event']
    const gitlabEvent = req.headers['x-gitlab-event']
    const bitbucketEvent = req.headers['x-bitbucket-event']
    const giteaEvent = req.headers['x-gitea-event']

    if (githubEvent) {
      return githubEvent as string
    }
    else if (gitlabEvent) {
      return gitlabEvent as string
    }
    else if (bitbucketEvent) {
      return bitbucketEvent as string
    }
    else if (giteaEvent) {
      return giteaEvent as string
    }
    else {
      return 'unknown'
    }
  }

  /**
   * 检查IP是否在白名单中
   */
  private checkIpWhitelist(ip: string): boolean {
    // 如果没有配置白名单，则默认允许所有IP
    if (!this.config.securityConfig || !this.config.securityConfig.ipWhitelist || this.config.securityConfig.ipWhitelist.length === 0) {
      return true
    }

    const { ipWhitelist } = this.config.securityConfig
    return ipWhitelist.includes(ip)
  }

  /**
   * 检查请求是否超出限流
   */
  private checkRateLimit(ip: string): boolean {
    // 如果没有配置限流，则默认允许所有请求
    if (!this.config.securityConfig || !this.config.securityConfig.rateLimit) {
      return true
    }

    const now = Date.now()
    const { maxRequestsPerSecond } = this.config.securityConfig.rateLimit

    // 清理过期的请求记录
    this.requestQueue = this.requestQueue.filter(req => now - req.timestamp < 1000)

    // 检查当前IP的请求数
    const ipRequests = this.requestQueue.filter(req => req.ip === ip)
    if (ipRequests.length >= maxRequestsPerSecond) {
      return false
    }

    // 添加新的请求记录
    this.requestQueue.push({ timestamp: now, ip })
    return true
  }

  /**
   * 应用事件过滤规则
   */
  private applyEventFilters(eventType: string, payload: any): boolean {
    // 如果没有配置事件过滤规则，则默认允许所有事件
    if (!this.config.eventFilterConfig || !this.config.eventFilterConfig.rules) {
      return true
    }

    // 查找当前事件类型的规则
    const rule = this.config.eventFilterConfig.rules.find(r => r.eventType === eventType)
    if (!rule) {
      // 没有找到规则，默认允许
      return true
    }

    // 检查所有条件是否满足
    return rule.conditions.every((condition) => {
      // 获取字段值
      const fieldValue = this.getValueFromPath(payload, condition.fieldPath)

      // 根据操作符检查条件
      switch (condition.operator) {
        case 'eq':
          return fieldValue === condition.value
        case 'ne':
          return fieldValue !== condition.value
        case 'gt':
          return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue > condition.value
        case 'lt':
          return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue < condition.value
        case 'contains':
          return Array.isArray(fieldValue)
            ? fieldValue.includes(condition.value)
            : typeof fieldValue === 'string'
              ? fieldValue.includes(condition.value)
              : false
        case 'regex':
          return typeof fieldValue === 'string' && new RegExp(condition.value).test(fieldValue)
        default:
          return false
      }
    })
  }

  /**
   * 从对象路径获取值
   */
  private getValueFromPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => {
      return acc && acc[part] !== undefined ? acc[part] : null
    }, obj)
  }

  /**
   * 带重试机制的同步触发
   */
  private async triggerSyncWithRetry(branch: string, requestId: string): Promise<void> {
    const maxRetries = this.config.retryConfig?.maxRetries || 3
    const initialDelay = this.config.retryConfig?.initialDelay || 1000
    const backoffFactor = this.config.retryConfig?.backoffFactor || 2

    // 初始化重试计数
    this.activeRetries.set(requestId, 0)

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Webhook触发同步尝试 #${attempt + 1}/${maxRetries + 1}，分支: ${branch}`)
        const syncer = new UpstreamSyncer(this.syncOptions)
        await syncer.run()
        return // 成功，不需要重试
      }
      catch (error) {
        lastError = error as Error
        logger.error(`Webhook触发同步尝试 #${attempt + 1} 失败: ${lastError.message}`)

        // 如果是最后一次尝试，则抛出错误
        if (attempt === maxRetries) {
          throw lastError
        }

        // 更新重试计数
        this.activeRetries.set(requestId, attempt + 1)

        // 计算下次重试的延迟时间（指数退避）
        const delay = initialDelay * backoffFactor ** attempt
        logger.info(`将在 ${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    // 这行代码理论上不会执行到，因为最后一次失败会在循环中抛出错误
    throw lastError || new Error('Webhook同步重试失败')
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
    // 根据平台选择不同的签名验证方式
    const platform = this.detectPlatform(req)
    const secret = this.config.secret

    // 如果没有配置secret，则跳过验证
    if (!secret) {
      logger.warn('Webhook secret未配置，跳过签名验证')
      return true
    }

    switch (platform) {
      case 'github':
        return this.verifyGitHubSignature(req, body, secret)
      case 'gitlab':
        return this.verifyGitLabSignature(req, body, secret)
      case 'bitbucket':
        return this.verifyBitbucketSignature(req, body, secret)
      case 'gitea':
        return this.verifyGiteaSignature(req, body, secret)
      default:
        logger.warn(`未知的Webhook平台: ${platform}`)
        return false
    }
  }

  /**
   * 检测Webhook平台
   */
  private detectPlatform(req: IncomingMessage): string {
    if (req.headers['x-github-event']) {
      return 'github'
    }
    else if (req.headers['x-gitlab-event']) {
      return 'gitlab'
    }
    else if (req.headers['x-bitbucket-event']) {
      return 'bitbucket'
    }
    else if (req.headers['x-gitea-event']) {
      return 'gitea'
    }
    else {
      return 'unknown'
    }
  }

  /**
   * 验证GitHub Webhook签名
   */
  private verifyGitHubSignature(req: IncomingMessage, body: string, secret: string): boolean {
    const signature = req.headers['x-hub-signature-256']
    if (!signature || typeof signature !== 'string' || !signature.startsWith('sha256=')) {
      return false
    }

    const crypto = require('node:crypto')
    const hmac = crypto.createHmac('sha256', secret)
    const digest = `sha256=${hmac.update(body).digest('hex')}`
    return signature === digest
  }

  /**
   * 验证GitLab Webhook签名
   */
  private verifyGitLabSignature(req: IncomingMessage, body: string, secret: string): boolean {
    const token = req.headers['x-gitlab-token']
    if (!token || typeof token !== 'string') {
      return false
    }
    return token === secret
  }

  /**
   * 验证Bitbucket Webhook签名
   */
  private verifyBitbucketSignature(req: IncomingMessage, body: string, secret: string): boolean {
    const signature = req.headers['x-hub-signature']
    if (!signature || typeof signature !== 'string') {
      return false
    }

    const crypto = require('node:crypto')
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(body).digest('hex')
    return signature === digest
  }

  /**
   * 验证Gitea Webhook签名
   */
  private verifyGiteaSignature(req: IncomingMessage, body: string, secret: string): boolean {
    const signature = req.headers['x-gitea-signature']
    if (!signature || typeof signature !== 'string') {
      return false
    }

    const crypto = require('node:crypto')
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(body).digest('hex')
    return signature === digest
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
    const platform = this.detectPlatformFromPayload(payload)

    // 根据不同的平台、事件类型提取分支信息
    switch (platform) {
      case 'github':
        return this.extractGitHubBranch(payload, eventType)
      case 'gitlab':
        return this.extractGitLabBranch(payload, eventType)
      case 'bitbucket':
        return this.extractBitbucketBranch(payload, eventType)
      case 'gitea':
        return this.extractGiteaBranch(payload, eventType)
      default:
        logger.warn(`无法从未知平台的请求体中提取分支信息: ${platform}`)
        return null
    }
  }

  /**
   * 从请求体检测平台
   */
  private detectPlatformFromPayload(payload: any): string {
    // 根据payload结构检测平台
    if (payload.repository && payload.repository.full_name && payload.sender) {
      return 'github'
    }
    else if (payload.project && payload.user) {
      return 'gitlab'
    }
    else if (payload.repository && payload.actor) {
      return 'bitbucket'
    }
    else if (payload.repository && payload.sender) {
      return 'gitea'
    }
    else {
      return 'unknown'
    }
  }

  /**
   * 提取GitHub分支信息
   */
  private extractGitHubBranch(payload: any, eventType: string): string | null {
    if (eventType === 'push') {
      if (payload.ref) {
        return payload.ref.split('/').pop() || null
      }
    }
    else if (eventType === 'pull_request') {
      if (payload.pull_request && payload.pull_request.head && payload.pull_request.head.ref) {
        return payload.pull_request.head.ref
      }
    }
    return null
  }

  /**
   * 提取GitLab分支信息
   */
  private extractGitLabBranch(payload: any, eventType: string): string | null {
    if (eventType === 'Push Hook') {
      if (payload.ref) {
        return payload.ref.split('/').pop() || null
      }
    }
    else if (eventType === 'Merge Request Hook') {
      if (payload.object_attributes && payload.object_attributes.source_branch) {
        return payload.object_attributes.source_branch
      }
    }
    return null
  }

  /**
   * 提取Bitbucket分支信息
   */
  private extractBitbucketBranch(payload: any, eventType: string): string | null {
    if (eventType === 'repo:push') {
      if (payload.push && payload.push.changes && payload.push.changes.length > 0) {
        const ref = payload.push.changes[0].new && payload.push.changes[0].new.name
        if (ref) {
          return ref.split('/').pop() || null
        }
      }
    }
    else if (eventType === 'pullrequest:created' || eventType === 'pullrequest:updated') {
      if (payload.pullrequest && payload.pullrequest.source && payload.pullrequest.source.branch) {
        return payload.pullrequest.source.branch.name
      }
    }
    return null
  }

  /**
   * 提取Gitea分支信息
   */
  private extractGiteaBranch(payload: any, eventType: string): string | null {
    if (eventType === 'push') {
      if (payload.ref) {
        return payload.ref.split('/').pop() || null
      }
    }
    else if (eventType === 'pull_request') {
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

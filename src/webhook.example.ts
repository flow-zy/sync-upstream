/*
 * Webhook配置示例
 * 此文件展示了如何配置Webhook集成功能
 */

import type { WebhookConfig } from './types'

// Webhook配置示例
const webhookConfig: WebhookConfig = {
  // 是否启用Webhook
  enable: true,
  // Webhook监听端口
  port: 3000,
  // Webhook路径
  path: '/webhook',
  // 用于验证Webhook请求的密钥
  // 请确保在生产环境中使用安全的密钥，并避免硬编码在代码中
  secret: 'your-secure-webhook-secret',
  // 允许的事件类型列表
  // 对于GitHub，常见事件类型包括: 'push', 'pull_request', 'create', 'delete'等
  // 对于GitLab，常见事件类型包括: 'Push Hook', 'Merge Request Hook', 'Tag Push Hook'等
  allowedEvents: ['push', 'pull_request'],
  // 触发同步的分支
  triggerBranch: 'main',
}

// 使用示例
/*
import { createWebhookServer } from './webhook'

// 启动Webhook服务器
async function startWebhookServer() {
  const webhookServer = await createWebhookServer()
  // 当需要停止服务器时
  // webhookServer?.stop()
}

// 启动服务器
startWebhookServer()
*/

export default webhookConfig

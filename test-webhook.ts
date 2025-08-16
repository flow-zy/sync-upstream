// 简单的Webhook测试脚本
// 这个脚本直接测试WebhookServer类的核心功能，不依赖完整的导入

// 模拟必要的依赖
const http = require('node:http')
const { WebhookServer } = require('./dist/index')

// 创建测试配置
const webhookConfig = {
  enable: true,
  port: 3000,
  path: '/webhook',
  secret: 'test-secret',
  allowedEvents: ['push'],
  triggerBranch: 'main',
}

// 模拟同步选项
const syncOptions = {
  upstreamRepo: 'https://github.com/example/upstream.git',
  upstreamBranch: 'main',
  companyBranch: 'main',
  syncDirs: ['src'],
  commitMessage: 'Sync from upstream',
  // 添加其他必要的配置
  forceOverwrite: true,
  concurrencyLimit: 5,
  dryRun: true, // 测试模式下不实际修改文件
  previewOnly: true,
}

// 创建并启动Webhook服务器
function startTestServer() {
  try {
    console.log('创建Webhook服务器...')
    const webhookServer = new WebhookServer(webhookConfig, syncOptions)

    // 覆盖execute方法，避免实际执行同步
    const originalRun = webhookServer.handleRequest
    webhookServer.handleRequest = async (req, res) => {
      console.log('接收到Webhook请求')
      // 模拟请求处理
      res.writeHead(200)
      res.end('测试成功')
    }

    webhookServer.start().then(() => {
      console.log('Webhook测试服务器已启动，监听端口: 3000')
      console.log('测试完成后按Ctrl+C停止服务器')
    }).catch((err) => {
      console.error('启动服务器失败:', err)
    })
  }
  catch (error) {
    console.error('测试失败:', error)
  }
}

startTestServer()

// 模拟发送Webhook请求
function simulateWebhook() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-github-event': 'push',
      'x-hub-signature-256': 'sha256=test-secret',
    },
  }

  const req = http.request(options, (res) => {
    console.log(`状态码: ${res.statusCode}`)
    res.on('data', (d) => {
      process.stdout.write(d)
    })
  })

  req.on('error', (e) => {
    console.error(`请求遇到问题: ${e.message}`)
  })

  // 发送模拟数据
  req.write(JSON.stringify({
    ref: 'refs/heads/main',
    repository: {
      full_name: 'example/upstream',
    },
  }))
  req.end()
}

// 延迟发送模拟请求，确保服务器已启动
setTimeout(simulateWebhook, 2000)

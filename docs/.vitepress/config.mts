import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/sync-upstream/',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],
  title: 'sync-upstream',
  description: '上游代码同步工具，支持增量更新与并行处理。',

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/sync-upstream-logo.svg',

    search: {
      provider: 'local',
    },
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/installation' },
      { text: '参考', link: '/reference/configuration' },
      { text: '更新日志', link: '/changelog' },
      { text: '功能记录', link: '/features' },
      { text: '常见问题', link: '/faq' },
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          { text: '安装指南', link: '/guide/installation' },
          { text: '配置指南', link: '/guide/configuration' },
          { text: '使用指南', link: '/guide/usage' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: '配置参考', link: '/reference/configuration' },
          { text: 'API 参考', link: '/reference/api' },
        ],
      },
      {
        text: '其他',
        items: [
          { text: '更新日志', link: '/changelog' },
          { text: '功能记录', link: '/features' },
          { text: '常见问题', link: '/faq' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/flow-zy/sync-upstream.git' },
    ],
  },
})

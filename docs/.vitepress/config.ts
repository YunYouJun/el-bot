import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '小云 · El Bot',
  description: '小云是跨 QQ、Mac 与 iPhone 的 AI 助理，el-bot 是背后的开源机器人与本机 AI 程序遥控框架。',
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['link', { rel: 'describedby', href: '/llms.txt' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '小云 · El Bot' }],
    ['meta', { property: 'og:description', content: '跨 QQ、Mac 与 iPhone 的 AI 助理，背后是可自部署的 el-bot 框架。' }],
    ['meta', { property: 'og:url', content: 'https://docs.bot.elpsy.cn/' }],
    ['meta', { property: 'og:image', content: 'https://docs.bot.elpsy.cn/og.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://docs.bot.elpsy.cn/og.png' }],
  ],
  themeConfig: {
    logo: {
      light: '/brand/el-bot-cloud.svg',
      dark: '/brand/el-bot-cloud-dark.svg',
      alt: '小云',
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/YunYouJun/el-bot' }],
    editLink: { pattern: 'https://github.com/YunYouJun/el-bot/edit/main/docs/:path', text: '编辑此页' },
    search: { provider: 'local' },
    outline: { label: '本页目录' },
    footer: { message: 'AGPL-3.0 Licensed', copyright: 'Copyright © 2020-present YunYouJun' },
    nav: [
      { text: '小云', link: '/yun/', activeMatch: '^/yun/' },
      {
        text: "遥控 AI 程序",
        activeMatch: "^/(codex/|development/codex-remote)",
        items: [
          { text: "功能展示", link: "/codex/" },
          { text: "选择 Codex / CodeBuddy / dsh", link: "/codex/agents" },
          { text: "安装与接入", link: "/development/codex-remote" },
          { text: "AI 快速接入", link: "/codex/ai-setup" },
          { text: "管理 Codex Desktop", link: "/codex/desktop" },
          { text: "实例隔离与恢复", link: "/codex/instances" },
          { text: "RC 验收与支持范围", link: "/codex/rc" },
        ],
      },
      { text: "指南", link: "/guide/" },
      { text: "API", link: "/api/" },
      { text: "插件", link: "/plugins/" },
      {
        text: "生态",
        items: [
          { text: "el-bot", link: "https://github.com/YunYouJun/el-bot/" },
          {
            text: "el-bot-api",
            link: "https://github.com/ElpsyCN/el-bot-api/",
          },
          {
            text: "el-bot-plugins",
            link: "https://github.com/ElpsyCN/el-bot-plugins/",
          },
          {
            text: "el-bot-template",
            link: "https://github.com/ElpsyCN/el-bot-template/",
          },
          { text: "el-bot-web", link: "https://bot.elpsy.cn" },
        ],
      },
    ],
    sidebar: {
      "/yun/": [
        { text: "小云", link: "/yun/" },
        { text: "桌面与移动客户端", link: "/development/client-tool" },
        { text: "iOS 会话与网页", link: "/development/ios-companion" },
        { text: "DSH Web 直连", link: "/development/dsh-remote-connector" },
        { text: "人物卡", link: "/development/personas" },
        { text: "手机助手", link: "/development/ios-device-assistant" },
        { text: "企业微信", link: "/guide/wecom" },
        { text: "Grok Bot 自动问答", link: "/guide/grok" },
        { text: "与 el-bot 的关系", link: "/codex/agents" },
      ],
      "/codex/": [
        { text: "功能展示", link: "/codex/" },
        { text: "图片卡片示例", link: "/codex/card-renderer" },
        { text: "选择 Codex / CodeBuddy / dsh", link: "/codex/agents" },
        { text: "安装与接入", link: "/development/codex-remote" },
        { text: "AI 快速接入", link: "/codex/ai-setup" },
        { text: "管理 Codex Desktop", link: "/codex/desktop" },
        { text: "实例隔离与恢复", link: "/codex/instances" },
        { text: "RC 验收与支持范围", link: "/codex/rc" },
        { text: "CLI 与机器人命令", link: "/guide/cli" },
      ],
      "/guide/": [
        {
          text: "快捷指南",
          link: "/guide/",
        },
        {
          text: "企微机器人",
          link: "/guide/wecom",
        },
        {
          text: "Grok Bot 自动问答",
          link: "/guide/grok",
        },
        {
          text: "终端命令",
          link: "/guide/cli",
        },
        {
          text: "配置讲解",
          link: "/guide/config",
        },
        {
          text: "数据系统",
          link: "/guide/database",
        },
        {
          text: "日志系统",
          link: "/guide/logger",
        },
        {
          text: "扩展功能",
          link: "/guide/extend",
        },
        {
          text: "常见问题",
          link: "/guide/faq",
        },
        {
          text: "关于我们",
          link: "/guide/about",
        },
      ],
      "/api/": [
        {
          text: "API",
          items: [
            {
              text: "核心 API",
              link: "/api/index",
            },
            {
              text: "状态 status",
              link: "/api/status",
            },
            {
              text: "辅助工具 utils",
              link: "/api/utils",
            },
          ],
        },
      ],
      "/plugins/": [
        {
          text: "插件",
          items: [
            {
              text: "使用说明",
              link: "/plugins/",
            },
          ],
        },
        {
          text: "默认插件",
          link: "/plugins/default",
        },
      ],
      // fallback
      "/development/": [
        { text: "工作区与发布", link: "/development/monorepo" },
        { text: "平台插件", link: "/development/platform-plugins" },
        { text: "用户指令系统", link: "/development/user-commands" },
        { text: "小云的 QQ 创造模式", link: "/development/qq-create" },
        { text: "QQ 遥控 AI 程序", link: "/development/codex-remote" },
        { text: "选择 Codex / CodeBuddy / dsh", link: "/codex/agents" },
        { text: "Markdown 图片渲染", link: "/development/card-renderer" },
        { text: "桌面与移动客户端", link: "/development/client-tool" },
        { text: "小云 iOS 会话与网页", link: "/development/ios-companion" },
        { text: "DSH Web 直连", link: "/development/dsh-remote-connector" },
        { text: "人物卡", link: "/development/personas" },
        { text: "AI 快速接入", link: "/codex/ai-setup" },
        { text: "管理 Codex Desktop", link: "/codex/desktop" },
        { text: "实例隔离与恢复", link: "/codex/instances" },
      ],
      "/": [],
    },
  },
})

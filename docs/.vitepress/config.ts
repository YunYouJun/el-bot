import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'El Bot',
  description: '可扩展的 QQ 机器人与 Codex 遥控工具',
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['link', { rel: 'describedby', href: '/llms.txt' }],
  ],
  themeConfig: {
    logo: '/brand/el-bot-mark.svg',
    socialLinks: [{ icon: 'github', link: 'https://github.com/YunYouJun/el-bot' }],
    editLink: { pattern: 'https://github.com/YunYouJun/el-bot/edit/dev/docs/:path', text: '编辑此页' },
    search: { provider: 'local' },
    outline: { label: '本页目录' },
    footer: { message: 'AGPL-3.0 Licensed', copyright: 'Copyright © 2020-present YunYouJun' },
    nav: [
      {
        text: "遥控 Codex",
        activeMatch: "^/(codex/|development/codex-remote)",
        items: [
          { text: "功能展示", link: "/codex/" },
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
      "/codex/": [
        { text: "功能展示", link: "/codex/" },
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
        { text: "QQ 遥控 Codex", link: "/development/codex-remote" },
        { text: "本机桌面客户端", link: "/development/client-tool" },
        { text: "AI 快速接入", link: "/codex/ai-setup" },
        { text: "管理 Codex Desktop", link: "/codex/desktop" },
        { text: "实例隔离与恢复", link: "/codex/instances" },
      ],
      "/": [],
    },
  },
})

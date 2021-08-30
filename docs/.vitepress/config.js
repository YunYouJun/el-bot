/**
 * @type {import('vitepress').UserConfig}
 */
module.exports = {
  head: [
    ["link", { rel: "icon", href: "/logo.svg" }],
    ["link", { rel: "manifest", href: "/manifest.json" }],
    ["meta", { name: "theme-color", content: "steelblue" }],
    ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
    [
      "meta",
      { name: "apple-mobile-web-app-status-bar-style", content: "steelblue" },
    ],
    ["link", { rel: "apple-touch-icon", href: "/logo.png" }],
    [
      "link",
      {
        rel: "mask-icon",
        href: "/logo.png",
        color: "steelblue",
      },
    ],
    [
      "meta",
      {
        name: "msapplication-TileImage",
        content: "/logo.png",
      },
    ],
    ["meta", { name: "msapplication-TileColor", content: "steelblue" }],
  ],
  title: "El Bot Docs",
  themeConfig: {
    logo: "/logo.png",
    repo: "YunYouJun/el-bot",
    docsDir: "docs",

    editLinks: true,
    editLinkText: "帮助改善此页面！( ￣□￣)/",

    smoothScroll: true,
    collapsable: false,
    nav: [
      { text: "指南", link: "/guide/" },
      { text: "API", link: "/api/" },
      { text: "插件", link: "/plugins/" },
      {
        text: "生态",
        ariaLabel: "Ecosystem",
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
          children: [
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
          children: [
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
      "/": [],
    },
  },
};

// todo
// google-analytics
// UA-168287495-1

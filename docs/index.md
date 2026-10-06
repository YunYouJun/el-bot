---
layout: home
hero:
  name: El Bot
  text: 用 QQ 遥控本机 AI 程序
  tagline: 连接 Codex、CodeBuddy 或 dsh，在 QQ 中安排任务、继续会话、处理审批、查看结果。
  actions:
    - theme: brand
      text: 选择程序并接入
      link: /codex/agents
    - theme: alt
      text: 让 AI 帮我接入
      link: /codex/ai-setup
    - theme: alt
      text: 机器人框架
      link: /guide/
features:
  - title: QQ 官方协议
    details: 用官方机器人私聊收发任务，WebSocket 模式无需公网回调地址。
  - title: 本人绑定
    details: 通过一次性绑定码识别主人，只在配置允许的项目中启动任务。
  - title: 会话与审批
    details: 每个项目独立续聊；需要升级权限时，在 QQ 查看并逐次确认。
  - title: 统一 CLI
    details: el-bot agent init、check、start 完成初始化、检查和运行；兼容 codex 入口。
---

<div class="home-codex">

<CodexShowcase />

## 三步接入自己的项目

以下使用默认 Codex。在本机安装相应 CLI 与 `el-bot` 后运行：

```bash
el-bot codex init --project /absolute/path/to/my-project --name my-project
el-bot codex check --all
el-bot codex start
```

需要 Node.js 22.18+、已登录的 Codex CLI 和 QQ 官方机器人。首次启动后，在 QQ 私聊发送终端显示的 `/pair ...` 绑定码。

::: info CodeBuddy / dsh 与版本
CodeBuddy / dsh 使用 `init --agent codebuddy` / `init --agent dsh` 和独立 profile，见[程序接入指南](/codex/agents)。新增功能需要当前源码构建或包含该功能的安装包；先核对 CLI 帮助，安装步骤见[完整接入](/development/codex-remote#安装-cli)。多实例与恢复见[实例隔离与恢复](/codex/instances)。
:::

## 让 AI 帮你完成接入

把[接入提示词](/codex/ai-setup#复制给你的-ai-助手)交给 Codex、Claude Code 或其他能运行本机命令的助手。
它可以检查环境、生成项目配置、核对连接，并给出首次 QQ 验证步骤。你在本机填写密钥、登录账号并完成绑定。

文档构建会提供 [llms.txt](/llms.txt)、[完整 Markdown](/llms-full.txt) 和各页 Markdown，方便助手直接阅读。

## 选择你的接入方式

| 需求 | 入口 |
| --- | --- |
| 从 QQ 安排本机 AI 任务 | [功能展示](/codex/) · [选择程序](/codex/agents) · [完整接入](/development/codex-remote) |
| 管理 Codex Desktop 的项目、聊天与工具 | [Desktop 接入](/codex/desktop) |
| 在本机控制机器人并打开桌面程序 | [桌面客户端](/development/client-tool) |
| 让 AI 协助安装与排错 | [AI 快速接入](/codex/ai-setup) |
| 编写自定义 QQ 机器人与插件 | [框架指南](/guide/) · [插件](/plugins/) |
| 参与工程开发或发布 | [Monorepo 与 npm OIDC](/development/monorepo) |

</div>

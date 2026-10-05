---
layout: home
hero:
  name: El Bot
  text: 用 QQ 遥控你的 Codex
  tagline: 在自己的电脑上执行任务，在 QQ 中继续会话、处理审批、查看结果。
  actions:
    - theme: brand
      text: 接入 Codex
      link: /development/codex-remote
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
    details: el-bot codex init、check、start 完成初始化、检查和运行。
---

<div class="home-codex">

<CodexShowcase />

## 三步接入自己的项目

安装包含 Codex 子命令的 `el-bot` 后，在本机运行：

```bash
el-bot codex init --project /absolute/path/to/my-project --name my-project
el-bot codex check --all
el-bot codex start
```

需要 Node.js 22.18+、已登录的 Codex CLI 和 QQ 官方机器人。首次启动后，在 QQ 私聊发送终端显示的 `/pair ...` 绑定码。

::: info 当前发布状态
使用 `pnpm add -g el-bot@next` 安装，或固定 `el-bot@1.0.0-rc.1`。完整步骤见[安装文档](/development/codex-remote#安装-cli)，多实例与归档恢复见[实例隔离与恢复](/codex/instances)。
:::

## 让 AI 帮你完成接入

把[接入提示词](/codex/ai-setup#复制给你的-ai-助手)交给 Codex、Claude Code 或其他能运行本机命令的助手。
它可以检查环境、生成项目配置、核对连接，并给出首次 QQ 验证步骤。你在本机填写密钥、登录账号并完成绑定。

文档构建会提供 [llms.txt](/llms.txt)、[完整 Markdown](/llms-full.txt) 和各页 Markdown，方便助手直接阅读。

## 选择你的接入方式

| 需求 | 入口 |
| --- | --- |
| 从 QQ 安排本机 Codex 任务 | [Codex 功能展示](/codex/) · [完整接入](/development/codex-remote) |
| 让 AI 协助安装与排错 | [AI 快速接入](/codex/ai-setup) |
| 编写自定义 QQ 机器人与插件 | [框架指南](/guide/) · [插件](/plugins/) |
| 参与工程开发或发布 | [Monorepo 与 npm OIDC](/development/monorepo) |

</div>

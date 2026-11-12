---
layout: home
hero:
  name: 小云
  text: QQ、Mac 与 iPhone 里的 AI 助理
  tagline: 由 el-bot 框架驱动。连接 Codex、CodeBuddy 或 dsh；QQ 侧不需要公网 IP 或内网穿透，模型可选 DeepSeek 国内直连。
  actions:
    - theme: brand
      text: 开始使用小云
      link: /yun/
    - theme: alt
      text: 自己部署 el-bot
      link: /codex/agents
features:
  - title: QQ 官方协议
    icon:
      src: /icons/chat.svg
      width: 24
      height: 24
      wrap: true
    details: 用官方机器人私聊收发任务，WebSocket 模式无需公网回调地址。
  - title: 本人绑定
    icon:
      src: /icons/shield.svg
      width: 24
      height: 24
      wrap: true
    details: 通过一次性绑定码识别主人，只在配置允许的项目中启动任务。
  - title: 会话与审批
    icon:
      src: /icons/approval.svg
      width: 24
      height: 24
      wrap: true
    details: 每个项目独立续聊；需要升级权限时，在 QQ 查看并逐次确认。
  - title: QQ 私聊创造模式
    icon:
      src: /icons/cli.svg
      width: 24
      height: 24
      wrap: true
    details: 主人用 /create 创建快捷指令、固定回复或群图缓存设置草稿，核对卡片后即时生效。
    link: /development/qq-create
  - title: 小云原生客户端
    icon:
      src: /icons/devices.svg
      width: 24
      height: 24
      wrap: true
    details: macOS / iOS 与 QQ 共用同一 DSH 会话，内置完整 Web 工作区、人物卡和手机能力。
  - title: 认证 DSH Web
    icon:
      src: /icons/web.svg
      width: 24
      height: 24
      wrap: true
    details: 已配对设备用一次性票据换取网页会话，上游 Cookie 不出服务端，可随时撤销。
  - title: 统一 CLI
    icon:
      src: /icons/cli.svg
      width: 24
      height: 24
      wrap: true
    details: el-bot agent init、check、start 完成初始化、检查和运行；兼容 codex 入口。
---

<div class="home-codex">

<div class="home-paths">
<a class="path-card" href="/yun/">
<span class="path-kicker">直接使用</span>
<strong>小云 AI 助理</strong>
<span class="path-detail">在 QQ、Mac、iPhone / iPad 和 DSH Web 之间继续同一套会话，不需要公网 IP 或内网穿透。</span>
</a>
<a class="path-card" href="/codex/agents">
<span class="path-kicker">自己搭建</span>
<strong>el-bot 框架</strong>
<span class="path-detail">开源 QQ 机器人与 CLI，接入 Codex、CodeBuddy 或 dsh，按需扩展插件。</span>
</a>
</div>

## 它怎么工作

<FlowDiagram />

<CodexShowcase />

## 用 el-bot 接入自己的项目

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
| 在 Mac / iPhone / iPad 上继续同一会话 | [桌面与移动客户端](/development/client-tool) · [小云 iOS 会话与网页](/development/ios-companion) |
| 在 App 内使用完整 DSH Web 与手机能力 | [小云 iOS 会话与网页](/development/ios-companion) |
| 管理人物卡与群聊记录 | [人物卡](/development/personas) |
| 管理 Codex Desktop 的项目、聊天与工具 | [Desktop 接入](/codex/desktop) |
| 让 AI 协助安装与排错 | [AI 快速接入](/codex/ai-setup) |
| 编写自定义 QQ 机器人与插件 | [框架指南](/guide/) · [插件](/plugins/) |
| 参与工程开发或发布 | [Monorepo 与 npm OIDC](/development/monorepo) |

</div>

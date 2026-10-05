---
title: QQ 遥控 Codex
description: 从 QQ 私聊安排 Codex 任务，管理桌面项目、聊天、工具与自动化。
---

# QQ 遥控 Codex

把 QQ 官方机器人作为自己电脑的任务入口。运行 `el-bot codex` 后，你可以在 QQ 中安排开发工作，并在任务完成时收到结果。
帮助、项目选择、任务状态、结果与审批以 Markdown 卡片展示，支持点选项目、刷新、翻页和处理请求的操作按钮；文字指令仍可使用。
彩色状态符号和加粗信息便于扫读，蓝色主操作、灰色辅助操作、红色停止 / 拒绝按钮使用 QQ 官方预置样式。

<CodexShowcase />

## 可以做什么

| 场景 | 在 QQ 中发送 |
| --- | --- |
| 查看帮助与快捷操作 | `/help`、`/menu` 或单独发送「帮助」「菜单」 |
| 选择项目 | `/projects` 点选项目，或发送 `/project my-project` |
| 安排任务 | `检查 README 的安装步骤，修正文档里的过期命令` |
| 继续上次工作 | 直接发送后续要求，沿用当前项目的 Codex 会话 |
| 查看进度或停止 | `/status`、`/stop` |
| 查看结果 | `/result`，长结果按页查询 |
| 处理审批 | `/approval ID` 查看全部详情后 `/approve ID` 或 `/reject ID` |
| 从新会话开始 | `/new` |
| 检查会话与恢复 | `/diagnose my-project`，失败卡片点击「新建会话」 |
| 浏览模型、技能和插件 | `/models`、`/skills`、`/plugins`、`/mcp` |
| 浏览本机协议 | `/api`、`/api schema 方法` |
| 浏览桌面项目与聊天 | `/desktop projects`、`/desktop chats` |
| 管理桌面功能 | `/desktop tools`、`/desktop call 工具 JSON` |
| 确认管理操作 | `/inspect ID` 查看全部页后 `/confirm ID`；`/cancel ID` 取消 |

帮助增加 API 管理和 Desktop 管理页；任务卡片都有「帮助菜单」入口。
基础帮助页提供「文档站点」「使用帮助」链接按钮，管理页提供 API、桌面项目、聊天和工具入口，正文提供 AI 接入指南。
输入任务按钮只填入草稿，新建会话按钮先确认。无按钮权限时可以继续使用同页的文字指令。

## 怎样接入

在运行 Codex 的电脑上安装 `el-bot`，用 `el-bot codex init --project ...` 选择项目，
用 `check --all` 检查本地登录与 QQ API，再用 `start` 启动并在 QQ 完成本人绑定。

- [手动接入与完整命令](/development/codex-remote)
- [让 AI 帮我接入](/codex/ai-setup)
- [CLI 命令与旧入口](/guide/cli)
- [管理 Codex Desktop 与版本 API](/codex/desktop)
- [实例隔离、诊断与恢复](/codex/instances)

安装 `el-bot@next`，或固定 `el-bot@1.0.0-beta.17`；完整步骤见[安装文档](/development/codex-remote#安装-cli)。不需要 YunLeFun 账户。

## 本地运行的边界

默认模式创建并维护自己的 Codex 会话，沿用本机 Codex 的账户和模型配置。配置共享后端后可以绑定该后端的已有会话；配置桌面宿主适配器后可以调用桌面工具。具体接入条件见 [Desktop 管理](/codex/desktop)。
电脑、网络和遥控进程需要持续可用。当前只接受绑定人的官方私聊；同一服务同时执行一个任务。
频道尚未接入遥控。QQ 官方频道 Markdown 目前需内邀，接入条件与区别见[频道说明](/development/codex-remote#可以在频道使用吗)。

Codex 默认可以在选定项目中写文件；需要升级权限时转发审批请求。项目白名单约束工作目录，读取范围由 Codex 的沙箱实现决定。
完整细节见[执行与审批](/development/codex-remote#执行与审批)。

## 已验证的链路

2026-10-05，使用真实 QQ 官方机器人完成私聊绑定、QQ → 本机 Codex → QQ 的文件读写任务、`/result` 查询及同一会话续聊。
升级后已在 QQ 桌面客户端验证 Markdown 状态 / 结果卡片，以及「查看结果」「刷新状态」「输入任务」按钮。
自动化测试另外覆盖官方 API、WebSocket 重连、签名验证、去重、权限、审批、停止及状态持久化。

上方对话用于展示交互方式；真实联调范围及尚未验证的环境见[联调记录](/development/codex-remote#真实-api-联调记录)。

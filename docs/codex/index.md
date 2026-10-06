---
title: QQ 遥控本机 AI 程序
description: 从 QQ 私聊安排 Codex、CodeBuddy 或 dsh 任务，继续会话、处理审批和查询结果。
---

# QQ 遥控本机 AI 程序

把 QQ 官方机器人作为自己电脑的任务入口。选择 Codex、CodeBuddy 或 dsh，运行 `el-bot agent` 后，你可以在 QQ 中安排开发工作，并在任务完成时收到结果。原有 `el-bot codex` 入口与配置继续兼容。
帮助、项目选择、任务状态、结果与审批以 Markdown 卡片展示，支持点选项目、刷新、翻页和处理请求的操作按钮；文字指令仍可使用。
彩色状态符号和加粗信息便于扫读，蓝色主操作、灰色辅助操作、红色停止 / 拒绝按钮使用 QQ 官方预置样式。

<CodexShowcase />

## 可以做什么

| 场景 | 在 QQ 中发送 |
| --- | --- |
| 查看帮助与快捷操作 | `/help`、`/menu` 或单独发送「帮助」「菜单」 |
| 选择项目 | `/projects` 点选项目，或发送 `/project my-project` |
| 安排任务 | `检查 README 的安装步骤，修正文档里的过期命令` |
| 继续上次工作 | 直接发送后续要求，沿用当前项目的会话 |
| 查看进度或停止 | `/status`、`/stop` |
| 查看结果 | `/result`，长结果按页查询 |
| 处理审批 | `/approval ID` 查看全部详情后 `/approve ID` 或 `/reject ID` |
| 从新会话开始 | `/new` |
| 检查会话与恢复 | `/diagnose my-project`，失败卡片点击「新建会话」 |

以上是共用的任务入口；ACP 的会话诊断依赖本机程序是否提供查询能力。Codex 还提供以下专用管理功能：

| 场景 | 在 QQ 中发送 |
| --- | --- |
| 浏览模型、技能和插件 | `/models`、`/skills`、`/plugins`、`/mcp` |
| 浏览本机协议 | `/api`、`/api schema 方法` |
| 浏览桌面项目与聊天 | `/desktop projects`、`/desktop chats` |
| 管理桌面功能 | `/desktop tools`、`/desktop call 工具 JSON` |
| 确认管理操作 | `/inspect ID` 查看全部页后 `/confirm ID`；`/cancel ID` 取消 |

帮助包含 API 管理和 Desktop 管理页，相关操作仅适用于 Codex；任务卡片都有「帮助菜单」入口。
基础帮助页提供「文档站点」「使用帮助」链接按钮，管理页提供 API、桌面项目、聊天和工具入口，正文提供 AI 接入指南。
输入任务按钮只填入草稿，新建会话按钮先确认。无按钮权限时可以继续使用同页的文字指令。

## 怎样接入

先看[程序选择与能力对比](/codex/agents)，在运行所选程序的电脑上安装或构建 `el-bot`。
用 `init --agent ... --project ...` 创建实例，`check --all` 检查本机协议与 QQ API，再用 `start` 启动并在 QQ 完成本人绑定。

- [CodeBuddy / dsh 配置与接入](/codex/agents)
- [手动接入与完整命令](/development/codex-remote)
- [让 AI 帮我接入](/codex/ai-setup)
- [CLI 命令与旧入口](/guide/cli)
- [管理 Codex Desktop 与版本 API](/codex/desktop)
- [实例隔离、诊断与恢复](/codex/instances)

新增 ACP 功能需要当前源码构建或包含该功能的安装包；先核对版本与 CLI 帮助，完整步骤见[安装文档](/development/codex-remote#安装-cli)。不需要 YunLeFun 账户。

## 本地运行的边界

默认 Codex 模式创建并维护自己的会话；profile 使用独立账户目录，旧默认实例沿用本机账户与模型配置。共享后端和桌面工具的接入条件见 [Desktop 管理](/codex/desktop)。CodeBuddy / dsh 沿用各自的本机账户配置，通过 ACP 创建与恢复项目会话。
电脑、网络和遥控进程需要持续可用。当前只接受绑定人的官方私聊；同一服务同时执行一个任务。
频道尚未接入遥控。QQ 官方频道 Markdown 目前需内邀，接入条件与区别见[频道说明](/development/codex-remote#可以在频道使用吗)。

需要授权的请求会转发到 QQ，查看全部详情后逐次确认。项目白名单约束工作目录；Codex 的访问范围由沙箱控制，ACP 程序按自己的工具与权限规则执行。完整细节见[执行与审批](/development/codex-remote#执行与审批)和[ACP 能力对比](/codex/agents#能力对比)。

## 已验证的链路

2026-10-05，使用真实 QQ 官方机器人完成私聊绑定、QQ → 本机 Codex → QQ 的文件读写任务、`/result` 查询及同一会话续聊。
升级后已在 QQ 桌面客户端验证 Markdown 状态 / 结果卡片，以及「查看结果」「刷新状态」「输入任务」按钮。
自动化测试另外覆盖官方 API、WebSocket 重连、签名验证、去重、权限、审批、停止及状态持久化。

CodeBuddy / dsh 已完成本机 ACP 握手与模拟协议测试，尚未完成真实 QQ 模型任务验收；上述 Codex 记录不代表其他程序也已完成端到端验证。

上方对话用于展示交互方式；真实联调范围及尚未验证的环境见[联调记录](/development/codex-remote#真实-api-联调记录)。

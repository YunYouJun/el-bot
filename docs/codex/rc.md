---
title: RC 验收与支持范围
description: 1.0.0 候选版的安装、诊断、真实 QQ 验收和正式版条件。
---

# RC 验收与支持范围

当前候选版本为 `1.0.0-rc.1`，发布到 npm `next`。测试时建议固定版本，便于记录与复现：

```bash
pnpm add -g el-bot@1.0.0-rc.1
```

RC 用于验证新用户安装和持续运行。基础范围是 QQ 官方 C2C 私聊与本机 stdio Codex：本人绑定、项目白名单、任务与结果、Markdown / 文字回复、审批与停止、实例隔离、连接诊断和明确恢复。

## 安装与迁移

```bash
pnpm add -g el-bot@next
el-bot --version
el-bot codex --profile personal init --project /absolute/path/to/project
el-bot codex --profile personal paths
el-bot codex --profile personal check --all --json
```

新 profile 在独立 Codex 目录登录；按检查报告的登录命令操作，AppSecret 只在本机填写。已有实例沿用原 profile 或三组显式路径，先检查再启动，不重复初始化、不清空状态。
完整步骤见[实例隔离与恢复](/codex/instances)和[AI 接入](/codex/ai-setup)。

库入口 `el-bot`、`el-bot/nest` 发布 ESM JavaScript 与类型声明，可由普通 Node.js 导入；旧框架启动器仍使用 Vite Node 加载 TypeScript 插件。
最低 Node.js 为 22.18.0，推荐仓库指定的 Node.js 24。发布流程先构建、安装和验证同一 tarball，再验证 Node.js 22.18.0 的 Linux / Windows / macOS 安装结果，最后执行 npm OIDC 发布。

## 真实 QQ 验收

| 项目 | 操作与预期 |
| --- | --- |
| 首次接入 | 本人在私聊发送 `/pair`，重启后仍保持原绑定 |
| 任务与结果 | 提交测试提示词，收到完成结果，`/result` 可再次查询 |
| 审批同意 | 查看全部请求详情，确认明确的测试操作，只执行一次 |
| 审批拒绝 | 拒绝测试操作；检查文件或命令确实没有执行 |
| 停止 | 执行中 `/stop`，确认最终状态为中断，旧停止按钮不停止后来的任务 |
| 重连与重启 | 网关断开后恢复；历史消息不重复启动任务，退出期间的任务不自动重放 |
| 归档恢复 | `/diagnose` 明确报告归档；`/new` 或停机后的 `recover` 只清除指定项目索引，保留主人与历史 |
| 多实例 | 两个 profile 的路径不同；错误 AppID / 环境 / Codex 目录被拒绝且原状态保留 |

自动化协议测试与真实 QQ / Codex 验收分别记录。`check --all` 通过只说明预检成功；有 QQ 返回结果才能确认端到端接通。
基础链路的已有记录见[真实 API 联调](/development/codex-remote#真实-api-联调记录)。

### RC.1 验证记录

2026-10-05 的本机验证使用同一候选 tarball：

- 完整 lint、类型检查、构建、文档构建与 132 项测试通过。
- Node.js 22.18.0 与 24.18.0 的干净安装通过，包括库 / Nest 原生导入、严格 TypeScript 消费端检查、CLI、图片渲染与 JSON 诊断。
- 真实配置中的两个旧会话已归档；报告逐项标记失败，仍继续完成 QQ 鉴权与网关预检，返回非零退出码。
- 官方 QQ 网关已验证强制断线后恢复连接，两次收到就绪事件；该测试未发送 QQ 消息或提交模型任务。
- 图片上传、QQ 展示、刷新与帮助翻页已有同一功能实现的实机记录。RC tarball 的任务执行、审批同意 / 拒绝、停止与重启后查询仍需补齐逐项验收。

这些记录不代替 GitHub 发布门禁；发布任务还需安装同一 tarball，通过最低 Node.js 版本在 Linux / Windows / macOS 上的兼容性验证。

## 实验与维护范围

- 默认 Markdown 保留复制和审批详情；图片模式只有完成当前机器人和 QQ 客户端的上传、展示、按钮与降级验证后，才能声明已接通。
- [Desktop 管理](/codex/desktop)、共享 app-server 和实验 API 需要显式配置，依赖宿主版本，不计入基础遥控的稳定性承诺。
- 群聊、频道、后台服务自动安装与开机启动尚未纳入基础范围；电脑、网络和遥控进程需要持续可用。
- Mirai / NapCat 的旧框架与插件处于迁移维护阶段，编译后的库入口可用不代表所有旧插件已完成真实联调。剩余依赖告警与插件发布范围见[已知限制](/development/monorepo#旧依赖的已知限制)。

## 进入正式版

候选版发布到 npm `next`，正式版发布到 `latest`。完成支持范围内的真实验收、迁移验证和依赖风险说明后，再发布 `1.0.0`；实验功能仍保留显式标记。
不承诺原样重放失败任务、自动取消归档或自动扩大执行权限。

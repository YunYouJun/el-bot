# @el-bot/codex

本机 AI 程序的协议客户端：Codex 使用 app-server，CodeBuddy / DeepSeek Harness 使用 ACP v1 stdio。统一接口 `AgentClient` 用于任务、会话、结果与审批；各程序的专用管理能力分别提供。

## Codex

`CodexClient` 使用已安装的 `codex` 和本机登录状态。
支持初始化、启动/恢复线程、提交/停止 turn、通知和服务端审批请求。
支持 `connection: 'desktop'` 通过 `codex app-server proxy` 连接已运行的共享后端，关闭客户端不停止 daemon。
`CodexSchema.load()` 从安装版本生成并验证 API schema；`experimentalApi` 显式开启实验协议。
`CodexDesktopClient` 通过 Codex 随应用提供的 MCP 适配器发现并调用桌面宿主工具，需要真实管道与已有聊天元数据。

这些底层客户端不负责 QQ 用户授权，调用方必须保留项目范围、单次确认与不重放约束。接入条件及验证边界见 [桌面管理](../../docs/codex/desktop.md)。

```ts
import { CodexClient } from '@el-bot/codex'

const codex = new CodexClient()
const threadId = await codex.thread({ cwd: '/absolute/project/path' })
// Register notification/request handlers before starting a turn.
await codex.turn(threadId, '/absolute/project/path', 'Explain the project')
// Close on application shutdown, after completion or interruption.
await codex.close()
```

审批由调用方通过 `request` 事件接收，再通过 `respond` 返回结果。
请求超时会终止连接，避免在执行结果不明确时重试产生重复操作。
完整实现参见 `apps/qq-codex`。

## CodeBuddy / dsh

`AcpClient` 支持新建／恢复会话、文本结果、单次审批与取消确认。CodeBuddy 使用 `--acp --permission-mode default`，dsh 使用 `--profile acp`；提供方配置由本机程序负责。

调用者必须传入真实项目白名单，并在启动任务前注册通知与审批处理器。客户端不声明文件系统或终端能力，不通过通用 RPC 暴露 ACP 的任务入口，也不提供 Codex 的操作系统沙箱。

会话恢复按程序声明的能力选择 `session/resume` 或 `session/load`，不支持时明确失败；历史回放不混入当前结果。取消等待 prompt 响应，失败或超时不能当成任务已经停止，也不能自动重试。

完整的配置、权限与功能差异见[程序选择与接入](../../docs/codex/agents.md)。QQ 层的主人绑定、持久去重、单任务准入与逐次确认由 `apps/qq-codex` 负责。

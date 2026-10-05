# @el-bot/codex

Codex app-server 的本地 stdio 客户端，使用已安装的 `codex` 和本机登录状态。
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

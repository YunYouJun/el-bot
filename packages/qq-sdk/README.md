# QQ SDK

> [QQ 官方 API 接口](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/error-trace/websocket.html)

QQ 官方机器人 API 与 webhook 验证的基础封装，当前渠道 API 仍在开发中。
此包尚不包含 Codex 执行或遥控功能。

```sh
pnpm --filter qq-sdk build
pnpm --filter qq-sdk typecheck
```

使用 tsdown 构建 `dist/index.mjs` 和 `dist/index.d.mts`，提供 ESM 入口。
`axios`、`qq-guild-bot` 与 `tweetnacl` 为显式运行依赖。

## 官方私聊回复

`qq-sdk/official` 导出 `QQBotClient`，其 `reply(openId, messageId, payload, sequence)` 支持纯文本字符串或 `QQMarkdownReply`。
后者发送 `msg_type: 2`，只包含 `markdown` 和可选的 `keyboard`，不会同时填入互斥的 `content` / `ark`。

```ts
import type { QQMarkdownReply } from 'qq-sdk/official'

const payload: QQMarkdownReply = {
  markdown: { content: '# 任务状态\n\n任务已完成' },
  keyboard: {
    content: {
      rows: [{
        buttons: [{
          id: 'status',
          render_data: { label: '刷新状态', style: 1 },
          action: {
            type: 2,
            data: '/status',
            enter: true,
            permission: { type: 0, specify_user_ids: [ownerOpenId] },
          },
        }],
      }],
    },
  },
}
await client.reply(ownerOpenId, incomingMessageId, payload, 1)
```

示例中的 `client` 为已配置凭据的 `QQBotClient`，`ownerOpenId` 与 `incomingMessageId` 来自已验证的私聊事件。
调用方负责回复窗口、序号与按钮指令的服务端校验；SDK 不自动将 Markdown 降级为纯文本。
遥控应用的分页、逐级回退与审批按钮实现位于 `apps/qq-codex`，见[卡片与按钮文档](../../docs/development/codex-remote.md#markdown-卡片与操作按钮)。

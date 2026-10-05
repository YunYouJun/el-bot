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

`qq-sdk/official` 导出 `QQBotClient`，其 `reply(openId, messageId, payload, sequence)` 支持纯文本字符串、`QQMarkdownReply` 或 `QQMediaReply`。
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
            permission: { type: 2 },
          },
        }],
      }],
    },
  },
}
await client.reply(ownerOpenId, incomingMessageId, payload, 1)
```

示例中的 `client` 为已配置凭据的 `QQBotClient`，`ownerOpenId` 与 `incomingMessageId` 来自已验证的私聊事件。
单聊按钮使用 `permission.type: 2`，避免将 C2C 的 `user_openid` 填入客户端的 `specify_user_ids` 后，手机 QQ 提示「无权限操作」。按钮只产生普通指令消息，调用方必须在服务端校验发送者身份。
调用方负责回复窗口、序号与按钮指令的服务端校验；SDK 不自动将 Markdown 降级为纯文本。
遥控应用的分页、逐级回退与审批按钮实现位于 `apps/qq-codex`，见[卡片与按钮文档](../../docs/development/codex-remote.md#markdown-卡片与操作按钮)。

## 本地图片上传

`uploadImage(openId, bytes, fileName)` 支持直接上传本地 PNG/JPEG（最多 20 MiB），无需公网文件服务器。SDK 使用官方分片上传流程，校验文件摘要，在平台提供的 HTTPS 预签名地址 PUT 数据；不会把 QQ 凭据发送给存储服务器，不自动重试失败分片，也不会发送主动消息。

```ts
import { readFile } from 'node:fs/promises'

const image = await client.uploadImage(ownerOpenId, await readFile('./result.png'), 'result.png')
await client.reply(ownerOpenId, incomingMessageId, {
  media: { file_info: image.file_info },
}, 1)
```

这会发送 `msg_type: 7`。`image.raw_url` 为平台返回的临时图片链接，也可嵌入 `QQMarkdownReply` 并搭配原生按钮；设置 `markdown.force_verify_image_resource: true` 可要求平台校验图片转存结果。`ttl` 为有效期（秒，`0` 表示长期有效）；`file_info` 原样传给同一接收人的发送接口，不解析、不写入日志。没有 `raw_url` 时仍可发送普通富媒体图片。

本次实机联调中，`raw_url` 可访问，但 Markdown 转存返回 `40034141`；普通富媒体图片正常显示，附带的键盘在 macOS QQ 中没有呈现。遥控应用因此使用独立的图片消息和按钮卡片。不要仅凭上传或发送接口成功响应，判断所有客户端的按钮和图片都已展示。

接口说明：[预上传](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_id_upload_prepare.post.html)、[分片完成](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_id_upload_part_finish.post.html)、[上传与下载链接](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_files.post.html)。

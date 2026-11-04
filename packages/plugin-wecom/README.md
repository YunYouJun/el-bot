# @el-bot/plugin-wecom

el-bot 的企业微信平台插件，同时提供独立客户端子路径和 CLI。支持两种可选机器人类型：

| `botType`       | 类型                         | 必填凭据               | 当前能力                                     |
| --------------- | ---------------------------- | ---------------------- | -------------------------------------------- |
| `smart`（默认） | 智能机器人，WebSocket 长连接 | BotID + Secret         | 接收文本、回复和主动发送，可选转发到外部服务 |
| `webhook`       | 群 Webhook 机器人            | 群机器人的 Webhook URL | 发送文本或 Markdown 群通知                   |

智能机器人只凭 BotID + Secret 就能建立长连接，不需要公网回调地址，也不需要 Grok Webhook。群 Webhook 机器人只负责发送通知，不能接收群消息。外部服务的转发 Webhook 是智能机器人的可选处理方式，与企微群 Webhook 无关。

智能机器人内部使用官方 `@wecom/aibot-node-sdk` 管理连接和收发。`wecomPlugin(options)` 通过平台接口注册到 el-bot；`WecomBridge` / `@el-bot/plugin-wecom/client` 可独立使用，不会导入框架运行时。插件、客户端、配置和 CLI 保留在同一个包内。

完整接入示例见[平台插件说明](../../docs/development/platform-plugins.md)。`wecomPlugin(await loadWecomConfig())` 可直接使用本机配置，支持命令回复和 `onSession`；仅启用本插件时不会启动 NapCat。

协议以[智能机器人长连接](https://developer.work.weixin.qq.com/document/path/101463)为准：

- 地址默认 `wss://openws.work.weixin.qq.com`（私有化部署可用 `WECOM_WS_URL` 覆盖）
- 建连后发送 `aibot_subscribe`（`bot_id` + `secret`）
- 成功后每 30 秒发送 `ping`；断线按指数退避重连
- 同一个 Bot 同时只能有一条有效长连接，新订阅会踢掉旧连接
- 长连接本身不再做消息加解密，凭证不要写进仓库

完整操作说明见[企微机器人](../../docs/guide/wecom.md)。

## 配置

环境变量优先于 `wecom.config.json`。两边都只放本机，不要提交。

| 变量                                | 必填           | 说明                                                  |
| ----------------------------------- | -------------- | ----------------------------------------------------- |
| `WECOM_BOT_TYPE`                    | 否             | `smart` 或 `webhook`，默认 `smart`                    |
| `WECOM_BOT_ID`                      | `smart` 必填   | 智能机器人 BotID                                      |
| `WECOM_BOT_SECRET`                  | `smart` 必填   | 长连接专用 Secret，不是回调 Token / EncodingAESKey    |
| `WECOM_GROUP_WEBHOOK_URL`           | `webhook` 必填 | 企微群机器人的完整 Webhook URL，包含 key              |
| `WECOM_FORWARD_WEBHOOK_URL`         | 否             | 智能机器人入站文本的外部转发目标，例如 Grok 例程      |
| `WECOM_FORWARD_WEBHOOK_AUTH_HEADER` | 否             | 转发鉴权头名称，默认 `Authorization`                  |
| `WECOM_FORWARD_WEBHOOK_AUTH_VALUE`  | 启用转发时必填 | 完整鉴权值，例如 `Bearer REPLACE_WITH_ROUTINE_KEY`    |
| `WECOM_WS_URL`                      | 否             | WebSocket 地址，默认公有云网关                        |
| `WECOM_CONFIG`                      | 否             | JSON 配置文件路径，默认当前目录的 `wecom.config.json` |
| `WECOM_HEARTBEAT_MS`                | 否             | 心跳间隔，整数且不小于 1000，默认 30000               |

```bash
cp packages/plugin-wecom/.env.example .env
# 编辑 .env，只保留占位符替换后的本机值
pnpm wecom --check
pnpm wecom
```

或复制 `packages/plugin-wecom/wecom.config.example.json` 为仓库根目录的 `wecom.config.json`。`.env` 和 `wecom.config.json` 已忽略。

`--type smart|webhook` 优先于环境变量和 JSON 的 `botType`；非空环境变量优先于 JSON。群通知的 JSON 示例见 `wecom.webhook.config.example.json`。

```bash
# 仅校验配置，不建立连接或发送通知
pnpm wecom --type webhook --check
# 按需发送一条群通知；必须已配置群 Webhook URL
pnpm wecom --type webhook --message '部署完成'
pnpm wecom --type webhook --message '**部署完成**' --format markdown
```

JSON 可选转发字段是 `forwardWebhookUrl`、`forwardWebhookAuthHeader` 和 `forwardWebhookAuthValue`。旧版 `WECOM_WEBHOOK_*` 环境变量和 `webhookUrl` / `webhookAuthHeader` / `webhookAuthValue` JSON 字段仍表示**外部转发**，保持兼容，不能代替群通知的 `WECOM_GROUP_WEBHOOK_URL`。

在包目录里也可以：

```bash
pnpm --filter @el-bot/plugin-wecom start
```

此时工作目录是 `packages/plugin-wecom`，`.env` / `wecom.config.json` 放在该目录。

订阅成功后日志显示 `WeCom smart bot long connection subscribed`。未启用转发时消息日志为 `Received`，启用转发后为 `Forwarded`；不打印 Secret、Webhook URL、鉴权值或消息正文。

库调用可通过 `new WecomBridge({ botId, secret, onInbound })` 在本地处理消息，省略所有 Webhook 字段。

## 入站消息

`onInbound` 接收 `aibot_msg_callback` 且 `msgtype` 为 `text` 的普通用户消息。启用外部转发时，也使用相同 JSON：

```json
{
  "source": "wecom",
  "text": "hello",
  "sender": { "id": "USERID", "name": "可选，官方回调默认没有" },
  "chat": { "type": "dm" },
  "msg": { "id": "MSGID" }
}
```

- `chattype: single` 写成 `chat.type: "dm"`；`group` 写成 `"group"`，并带上 `chat.id`（群聊的 `chatid`）
- 官方 `from` 只有 `userid`。仅当帧里带有 `from.name` 时才写入 `sender.name`
- 群聊文本里的 `@机器人` 前缀原样保留
- 同一 `msgid` 去重，启用转发时只 POST 一次

MVP **不转发**这些类型（日志会写 `Ignored`）：

| 企微类型                                      | 原因                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `image` / `mixed` / `file` / `video`          | 非文本                                                                               |
| `voice`                                       | 即使带有语音转写文本，本阶段也不转发                                                 |
| 带 `compat_info` 的回调                       | 智能助理或频道，不是普通用户消息                                                     |
| 空白文本、缺少 userid / msgid / chattype 的帧 | 无法组成稳定载荷                                                                     |
| `aibot_event_callback`                        | `enter_chat`、`template_card_event`、`feedback_event`、`disconnected_event` 都不转发 |

Webhook 失败时会在本地重试，仍失败则打错误日志并丢掉这条的去重记录。不会把 Webhook 响应体写进日志。

## 开发

```bash
pnpm exec vitest run packages/plugin-wecom
pnpm --filter @el-bot/plugin-wecom typecheck
pnpm --filter @el-bot/plugin-wecom build
```

测试使用本地伪 WebSocket 和本地 HTTP 服务，不会访问企业微信。

# @el-bot/wecom

企业微信智能机器人长连接桥。进程主动连接企业微信 WebSocket，把用户发来的**文本**转成稳定 JSON，再 POST 到可配置的 Webhook（例如 Grok Bot 例程「企微入站」）。

这是和 `packages/qq-sdk` 同级的传输包，不挂进 QQ 机器人插件运行时。出站回复（`aibot_respond_msg`）留到下一阶段，当前调用 `replyOnWecom()` 会直接抛错。

协议以[智能机器人长连接](https://developer.work.weixin.qq.com/document/path/101463)为准：

- 地址默认 `wss://openws.work.weixin.qq.com`（私有化部署可用 `WECOM_WS_URL` 覆盖）
- 建连后发送 `aibot_subscribe`（`bot_id` + `secret`）
- 成功后每 30 秒发送 `ping`；断线按指数退避重连
- 同一个 Bot 同时只能有一条有效长连接，新订阅会踢掉旧连接
- 长连接本身不再做消息加解密，凭证不要写进仓库

完整操作说明见[企微入站](../../docs/guide/wecom.md)。

## 配置

环境变量优先于 `wecom.config.json`。两边都只放本机，不要提交。

| 变量                        | 必填 | 说明                                                     |
| --------------------------- | ---- | -------------------------------------------------------- |
| `WECOM_BOT_ID`              | 是   | 智能机器人 BotID                                         |
| `WECOM_BOT_SECRET`          | 是   | 长连接专用 Secret，不是回调 Token / EncodingAESKey       |
| `WECOM_WEBHOOK_URL`         | 是   | Grok 例程「企微入站」的 Webhook URL                      |
| `WECOM_WEBHOOK_AUTH_HEADER` | 否   | 鉴权头名称，默认 `Authorization`                         |
| `WECOM_WEBHOOK_AUTH_VALUE`  | 是   | 鉴权头的完整取值，例如 `Bearer REPLACE_WITH_ROUTINE_KEY` |
| `WECOM_WS_URL`              | 否   | WebSocket 地址，默认公有云网关                           |
| `WECOM_CONFIG`              | 否   | JSON 配置文件路径，默认当前目录的 `wecom.config.json`    |
| `WECOM_HEARTBEAT_MS`        | 否   | 心跳间隔，整数且不小于 1000，默认 30000                  |

```bash
cp packages/wecom/.env.example .env
# 编辑 .env，只保留占位符替换后的本机值
pnpm wecom
```

或复制 `packages/wecom/wecom.config.example.json` 为仓库根目录的 `wecom.config.json`。`.env` 和 `wecom.config.json` 已忽略。

在包目录里也可以：

```bash
pnpm --filter @el-bot/wecom start
```

此时工作目录是 `packages/wecom`，`.env` / `wecom.config.json` 放在该目录。

订阅成功后日志类似：`WeCom long connection subscribed for bot <BotID>`。日志不打印 Secret，也不打印消息正文。

## 转发的 JSON

只转发 `aibot_msg_callback` 且 `msgtype` 为 `text` 的普通用户消息。

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
- 同一 `msgid` 只 POST 一次

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
pnpm exec vitest run packages/wecom
pnpm --filter @el-bot/wecom typecheck
pnpm --filter @el-bot/wecom build
```

测试使用本地伪 WebSocket 和本地 HTTP 服务，不会访问企业微信。

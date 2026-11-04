# 企微机器人

`packages/plugin-wecom`（`@el-bot/plugin-wecom`）将企微客户端、配置、消息适配、插件入口和 CLI 放在同一个包内，提供两种企微机器人类型。

| 选择值 | 机器人类型 | 必填配置 | 当前实现 |
| --- | --- | --- | --- |
| `smart`（默认） | 智能机器人，长连接 | BotID + Secret | 接收文本、回复和主动发送；可选转发到外部服务 |
| `webhook` | 群 Webhook 机器人 | 群 Webhook URL | 向绑定群发送文本或 Markdown 通知 |

通过 `WECOM_BOT_TYPE`、JSON 的 `botType` 或 `--type` 选择，命令行优先。智能机器人不需要 Webhook URL：BotID + Secret 用于本机主动建立长连接；Grok Webhook 只是可选的外部处理目标。群 Webhook 机器人只能发送通知，不能接收入站消息。

智能机器人内部使用官方 SDK。独立 CLI 默认只记录**入站文本**；作为 el-bot 插件运行时，可通过命令或 `onSession` 回复，也可调用 `bot.send()` 主动发送。完整接入示例见[平台插件](/development/platform-plugins)。

官方协议：[智能机器人长连接](https://developer.work.weixin.qq.com/document/path/101463)。

需要自动问答时，使用 [Grok Bot 自动问答](/guide/grok)，通过官方 Webhook 触发、鉴权结果回调及企微 SDK 回复组成完整链路。

## 这条链路在做什么

```text
企业微信用户
  -> 智能机器人长连接 wss://openws.work.weixin.qq.com
  -> 本机 el-bot WeCom 桥
  -> 本地 onInbound 处理；如配置了转发，再 POST 到外部 Webhook
```

本机主动连出，不需要公网 IP、回调 URL、Token 或 EncodingAESKey。机器需要能访问 `openws.work.weixin.qq.com`。同一个 BotID 同时只能保持一条长连接，重复启动会把旧连接踢下线。

## 1. 创建企业微信智能机器人

1. 用管理员账号登录 [企业微信管理后台](https://work.weixin.qq.com/)。
2. 打开「智能机器人」配置页（入口名称随后台版本可能在应用管理或协作相关菜单里；官方说明是进入该机器人的配置页面）。
3. 创建机器人，开启「API 模式」，接入方式选择 **长连接**。不要选择「设置接收消息 URL」。
4. 复制 **BotID** 和长连接专用 **Secret**。这个 Secret 与回调模式的 Token、EncodingAESKey 不是同一组凭证。
5. 保存。Secret 只留在本机。

## 2. 可选：转发到 Grok Bot

只连接企微或使用本地消息处理时，跳过此节。

1. 打开 Grok Bot 里名为「企微入站」的例程。
2. 从例程面板复制 Webhook URL。
3. 复制面板给出的鉴权头。常见写法是头名称 `Authorization`，值是 `Bearer <面板上的 key>`。
4. 把 URL 填进 `WECOM_FORWARD_WEBHOOK_URL`，头名称填进 `WECOM_FORWARD_WEBHOOK_AUTH_HEADER`，**完整头值**填进 `WECOM_FORWARD_WEBHOOK_AUTH_VALUE`（需要 `Bearer ` 前缀时，连同前缀一起粘贴）。URL 和鉴权值同时配置后才可启用转发。

不要把 URL 或 key 发到聊天、提交到 Git，或写进文档示例。

## 3. 填写本机配置

在仓库根目录：

```bash
cp packages/plugin-wecom/.env.example .env
```

编辑 `.env`，只替换占位符：

```dotenv
WECOM_BOT_TYPE=smart
WECOM_BOT_ID=your-bot-id
WECOM_BOT_SECRET=your-bot-secret
```

以上三项就足够连接企微。可选转发配置单独填写：

```dotenv
WECOM_FORWARD_WEBHOOK_URL=https://example.invalid/grok/routines/wecom-inbound
WECOM_FORWARD_WEBHOOK_AUTH_HEADER=Authorization
WECOM_FORWARD_WEBHOOK_AUTH_VALUE=Bearer REPLACE_WITH_ROUTINE_KEY
```

也可以把 `packages/plugin-wecom/wecom.config.example.json` 复制为仓库根目录的 `wecom.config.json`，填写 `botType`、`botId` 和 `secret`；可选转发字段是 `forwardWebhookUrl`、`forwardWebhookAuthHeader` 和 `forwardWebhookAuthValue`。同时存在时，非空环境变量覆盖文件。旧版 `WECOM_WEBHOOK_*` 和 JSON 的 `webhookUrl` / `webhookAuthHeader` / `webhookAuthValue` 继续表示外部转发，保持兼容。

`.env` 和 `wecom.config.json` 已被 Git 忽略。示例文件里的 `your-bot-id`、`your-bot-secret`、`REPLACE_WITH_ROUTINE_KEY` 不能当成真实凭证。

可选：

- `WECOM_WS_URL`：私有化部署的 WebSocket 地址。公有云保持默认 `wss://openws.work.weixin.qq.com`。
- `WECOM_HEARTBEAT_MS`：心跳间隔，默认 30000，最小 1000。

## 4. 本地运行

需要 Node.js 22.18 或更新版本，并先在仓库根目录安装依赖。

```bash
pnpm install
pnpm wecom --check
pnpm wecom
```

也可以：

```bash
pnpm --filter @el-bot/plugin-wecom start
```

过滤脚本的工作目录是 `packages/plugin-wecom`，配置文件要放在那个目录，或通过 `WECOM_CONFIG` 指向绝对路径。

连上后终端出现：

```text
WeCom smart bot long connection subscribed
Receiving inbound text locally
```

`--check` 只校验本地配置，不连接企微或发送消息。启用转发时第二行是 `External webhook forwarding enabled`。消息日志只打印消息 ID 和会话类型，不打印 Secret、Webhook URL、鉴权头和消息正文。

进程要保持运行。终端关闭、休眠或断网后机器人会离线，重新执行 `pnpm wecom` 即可。

## 5. 怎样算通了

1. 终端已经打印 `subscribed`。
2. 在企业微信里给这个机器人发一条单聊文本，例如 `你好`。
3. 未启用转发时，终端打印 `Received <msgid> (dm)`。库调用的 `onInbound` 可以直接处理消息。
4. 如已启用转发，终端打印 `Forwarded <msgid> (dm)`，Grok Bot 例程「企微入站」收到一条 JSON：

```json
{
  "source": "wecom",
  "text": "你好",
  "sender": { "id": "发送者 userid" },
  "chat": { "type": "dm" },
  "msg": { "id": "企微 msgid" }
}
```

群聊里需要 **@ 机器人** 才会推送。群消息的 `chat.type` 是 `group`，并带有 `chat.id`。`text` 保留企业微信原文，通常以 `@机器人` 开头。

官方回调的 `from` 只有 `userid`（创建者不是超级管理员时还可能是加密 userid）。`sender.name` 仅在帧里真的带了 `from.name` 时才会出现，公有云示例里一般没有这个字段。

不要假定 `wecom-cli identity whoami` 返回的授权人标识与长连接回调的 `from.userid` 相同。回复应使用当前消息绑定的 `reply()`，保留原始请求上下文；主动发送的目标应来自同一长连接接口返回且经授权确认的 userid / chatid，不能直接套用 CLI 的内部标识。

再发一张图片：终端应出现 `Ignored WeCom image (unsupported-type)`，例程不应收到这张图片。

连接认证成功和消息发送成功是两步。插件发送和回复会等待 SDK 的服务器回执；被拒绝时抛出 `WecomApiError`，其 `code` 保留数字错误码，不记录原始响应体。例如 `846607` 表示服务端拒绝发送并报告消息频率限制，应停止重复发送，待限制解除后再验证。只有收到成功回执才能判定发送成功。

## 群 Webhook 机器人

在企微目标群里添加群机器人，复制该机器人的 Webhook URL。这个地址包含 key，不要提交或发到聊天中。

```dotenv
WECOM_BOT_TYPE=webhook
WECOM_GROUP_WEBHOOK_URL=https://example.invalid/wecom/send?key=REPLACE_WITH_GROUP_KEY
```

也可以复制 `packages/plugin-wecom/wecom.webhook.config.example.json` 为本机 `wecom.config.json`。此类型只读取群 Webhook 配置，不需要 BotID、Secret 或外部转发鉴权值。

```bash
pnpm wecom --check
pnpm wecom --message '部署完成'
pnpm wecom --message '**部署完成**' --format markdown
```

如果本机同时保留两类凭据，可用 `pnpm wecom --type webhook --message '部署完成'` 临时选择群机器人。群通知 URL 使用独立的 `WECOM_GROUP_WEBHOOK_URL`，避免误把 Grok 转发地址当作群通知目标。未指定 `--message` 时不会发送通知；群机器人不建立长连接，也不接收消息。

## 本阶段忽略的入站消息

| 类型 | 处理 |
| --- | --- |
| 文本 `text` | 转发 |
| 图片 `image`、图文混排 `mixed`、文件 `file`、视频 `video` | 忽略 |
| 语音 `voice` | 忽略，包括其中的转写文本 |
| 带 `compat_info` 的回调（智能助理、频道） | 忽略 |
| 空白文本，或缺少 userid / msgid / chattype 的帧 | 忽略 |
| 事件：进入会话、模板卡片点击、用户反馈、连接被新订阅踢掉 | 忽略，不 POST |

引用消息只转发当前可见的 `text.content`，不附带被引用的内容。同一 `msgid` 只 POST 一次。Webhook 返回非 2xx 时会在本地重试几次，仍失败则只记状态码，不把响应体打出来。

## 测试

不访问企业微信，也不需要真实 Bot 凭证：

```bash
pnpm exec vitest run packages/plugin-wecom
pnpm --filter @el-bot/plugin-wecom typecheck
```

测试会断言 Webhook 的 HTTP 方法、URL、鉴权头和 JSON 正文。

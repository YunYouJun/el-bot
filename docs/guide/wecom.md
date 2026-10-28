# 企微入站

把企业微信智能机器人的长连接消息，转发到 Grok Bot 例程「企微入站」。桥接实现在 `packages/wecom`（`@el-bot/wecom`），和 `qq-sdk` 一样是独立传输包，不经过 QQ / NapCat，也不启动飞书。

当前只做**入站文本**。机器人不会在企业微信里回复；出站 `aibot_respond_msg` 是下一阶段。

官方协议：[智能机器人长连接](https://developer.work.weixin.qq.com/document/path/101463)。

## 这条链路在做什么

```text
企业微信用户
  -> 智能机器人长连接 wss://openws.work.weixin.qq.com
  -> 本机 el-bot WeCom 桥
  -> POST 到 Grok Bot 例程「企微入站」的 Webhook
```

本机主动连出，不需要公网 IP、回调 URL、Token 或 EncodingAESKey。机器需要能访问 `openws.work.weixin.qq.com`。同一个 BotID 同时只能保持一条长连接，重复启动会把旧连接踢下线。

## 1. 创建企业微信智能机器人

1. 用管理员账号登录 [企业微信管理后台](https://work.weixin.qq.com/)。
2. 打开「智能机器人」配置页（入口名称随后台版本可能在应用管理或协作相关菜单里；官方说明是进入该机器人的配置页面）。
3. 创建机器人，开启「API 模式」，接入方式选择 **长连接**。不要选择「设置接收消息 URL」。
4. 复制 **BotID** 和长连接专用 **Secret**。这个 Secret 与回调模式的 Token、EncodingAESKey 不是同一组凭证。
5. 保存。Secret 只留在本机。

## 2. 从 Grok Bot 复制 Webhook

1. 打开 Grok Bot 里名为「企微入站」的例程。
2. 从例程面板复制 Webhook URL。
3. 复制面板给出的鉴权头。常见写法是头名称 `Authorization`，值是 `Bearer <面板上的 key>`。
4. 面板如果使用别的头名称，把名称填进 `WECOM_WEBHOOK_AUTH_HEADER`，把**完整头值**填进 `WECOM_WEBHOOK_AUTH_VALUE`（需要 `Bearer ` 前缀时，连同前缀一起粘贴）。

不要把 URL 或 key 发到聊天、提交到 Git，或写进文档示例。

## 3. 填写本机配置

在仓库根目录：

```bash
cp packages/wecom/.env.example .env
```

编辑 `.env`，只替换占位符：

```dotenv
WECOM_BOT_ID=your-bot-id
WECOM_BOT_SECRET=your-bot-secret
WECOM_WEBHOOK_URL=https://example.invalid/grok/routines/wecom-inbound
WECOM_WEBHOOK_AUTH_HEADER=Authorization
WECOM_WEBHOOK_AUTH_VALUE=Bearer REPLACE_WITH_ROUTINE_KEY
```

也可以不写 `.env`，把 `packages/wecom/wecom.config.example.json` 复制为仓库根目录的 `wecom.config.json`，字段是 `botId`、`secret`、`webhookUrl`、`webhookAuthHeader`、`webhookAuthValue`。同时存在时，非空环境变量覆盖文件。

`.env` 和 `wecom.config.json` 已被 Git 忽略。示例文件里的 `your-bot-id`、`your-bot-secret`、`REPLACE_WITH_ROUTINE_KEY` 不能当成真实凭证。

可选：

- `WECOM_WS_URL`：私有化部署的 WebSocket 地址。公有云保持默认 `wss://openws.work.weixin.qq.com`。
- `WECOM_HEARTBEAT_MS`：心跳间隔，默认 30000，最小 1000。

## 4. 本地运行

需要 Node.js 22.18 或更新版本，并先在仓库根目录安装依赖。

```bash
pnpm install
pnpm wecom
```

也可以：

```bash
pnpm --filter @el-bot/wecom start
```

过滤脚本的工作目录是 `packages/wecom`，配置文件要放在那个目录，或通过 `WECOM_CONFIG` 指向绝对路径。

连上后终端出现：

```text
WeCom long connection subscribed for bot <你的 BotID>
Forwarding inbound text to <Webhook 的 origin 和路径>
```

日志只打印 BotID、消息 ID 和会话类型，不打印 Secret、鉴权头和消息正文。Webhook 地址里的 query 也不会打印。

进程要保持运行。终端关闭、休眠或断网后机器人会离线，重新执行 `pnpm wecom` 即可。

## 5. 怎样算通了

1. 终端已经打印 `subscribed`。
2. 在企业微信里给这个机器人发一条单聊文本，例如 `你好`。
3. 终端打印 `Forwarded <msgid> (dm)`。
4. Grok Bot 例程「企微入站」收到一条 JSON：

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

再发一张图片：终端应出现 `Ignored WeCom image (unsupported-type)`，例程不应收到这张图片。

## 本阶段忽略的消息

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
pnpm exec vitest run packages/wecom
pnpm --filter @el-bot/wecom typecheck
```

测试会断言 Webhook 的 HTTP 方法、URL、鉴权头和 JSON 正文。

# @el-bot/plugin-qq

el-bot 的 QQ 平台插件，包含 NapCat 和官方 QQ 两种适配方式，官方接入支持私聊和群聊。连接管理、原生消息转换和 QQ 回复放在本包；底层官方 API 继续复用已有 `qq-sdk`，不再另建一套 SDK。

```ts
import { qqPlugin } from '@el-bot/plugin-qq'
import { Bot } from 'el-bot'

const bot = new Bot({
  legacyQQ: false,
  bot: {
    autoloadPlugins: false,
    plugins: [
      qqPlugin({
        type: 'napcat',
        connection: { protocol: 'ws', host: '127.0.0.1', port: 3001, accessToken: '' },
      }),
      { setup(ctx) { ctx.command('ping').action(() => 'pong') } },
    ],
  },
})
await bot.start()
```

## 官方 QQ 私聊与群聊

使用 `qqPlugin({ type: 'official', appId, secret })`，凭据从本机环境变量或忽略的配置读取。适配器同时接收 C2C 文本、`GROUP_AT_MESSAGE_CREATE`（群 @ 消息）和 `GROUP_MESSAGE_CREATE`（全量群消息），通过 `onSession` 交给业务插件。

```ts
import { qqPlugin } from '@el-bot/plugin-qq'
import { Bot } from 'el-bot'
import 'dotenv/config'

const appId = process.env.QQ_BOT_APP_ID
const secret = process.env.QQ_BOT_SECRET
if (!appId || !secret)
  throw new Error('QQ_BOT_APP_ID and QQ_BOT_SECRET are required')

const bot = new Bot({
  legacyQQ: false,
  bot: {
    name: '小云',
    autoloadPlugins: false,
    plugins: [
      qqPlugin({ type: 'official', appId, secret }),
      {
        setup(ctx) {
          ctx.command('ping').action(() => 'pong')
          ctx.hooks.hook('onSession', (session) => {
            if (session.platform !== 'qq' || session.chat.type !== 'group')
              return
            console.info(session.chat.id, session.sender.id, session.text)
          })
        },
      },
    ],
  },
})
await bot.start()
```

接收全量消息需要先在 QQ 开放平台开通对应群聊事件权限，将机器人加入目标群，并在群内的机器人设置中开启「接收所有消息」或「获取群内全部消息」（以客户端实际名称为准）。适配器已订阅 `GROUP_AND_C2C_EVENT (1 << 25)`，无需额外配置订阅位；代码无法代替群内授权。协议见[全量群消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html)和[群 @ 消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_at_message_create.html)。

群消息的 `session.chat` 为 `{ type: 'group', id: group_openid }`，发送者使用 `member_openid`，昵称存在时填入 `sender.name`；这些标识不是数字 QQ 号或群号。`session.text` 保留消息文本，纯附件消息可为空；`session.raw` 保留完整原始事件体，包括 `attachments`、`mentions`、`ark_data`、`msg_elements` 和 `message_scene`，不会把卡片或引用正文拼接成命令。

普通全量消息的 `addressed` 为 `false`，仍进入 `onSession`，不默认执行同名命令。专门的群 @ 事件标记为 `true`。全量模式中，即使正文含 @ 也不会猜测是否 @ 了当前机器人；需要执行命令时可发送 `小云 ping`，或由业务插件在 `onSession` 中根据自己的规则处理。命中命令的消息由命令消费，不再进入 `onSession`。

`session.reply(text)` 使用原群、原消息 ID 和该消息独立的递增序号进行被动回复；私聊继续回复原发送者。群被动回复受官方 5 分钟、每条消息最多 5 次的限制。适配器按群和消息 ID 在进程内去重，最多保留 10000 条记录，停止后清空；长期归档与跨重启去重由业务持久化。此接入接收新消息事件，不提供任意历史聊天记录拉取。

当前官方适配器尚未提供主动发送和群媒体上传。`apps/qq-codex` 仍只接收 C2C 私聊，群消息不会进入远程执行流程，其授权、去重和审批保持独立。

新增功能优先接入官方 QQ；已有 NapCat 应用保留兼容，待官方适配补齐主动发送和业务所需媒体功能，并迁移依赖 NapCat 原始消息的插件后，再决定移除。NapCat 项目仍在维护，最近核查版本为 [v4.18.42（2026-10-30）](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.42)。

跨平台业务使用 `onSession` 或命令上下文的 `session` / `reply()`；旧 `onNapcatMessage`、QQ 消息钩子和 `bot.reply(rawMessage, content)` 继续可用。一个 Bot 只允许一个 NapCat 适配器，以保持旧 QQ 接口的目标明确。

未配置平台插件的旧应用仍自动使用 NapCat；`legacyQQ: false` 可关闭这个兼容入口。显式配置企微或 QQ 平台插件时，不再额外创建默认 NapCat 连接。

本包目前用于工作区开发；仓库现有发布流程仍只发布 `el-bot`，其安装包内置 QQ 兼容实现，不要求从 npm 安装本插件才能使用旧配置。

详见[平台插件说明](../../docs/development/platform-plugins.md)。

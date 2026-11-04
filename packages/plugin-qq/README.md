# @el-bot/plugin-qq

el-bot 的 QQ 平台插件，包含 NapCat 和官方 QQ C2C 两种适配方式。连接管理、原生消息转换和 QQ 回复放在本包；底层官方 API 继续复用已有 `qq-sdk`，不再另建一套 SDK。

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

官方 QQ C2C 使用 `qqPlugin({ type: 'official', appId, secret })`，凭据从本机环境变量或忽略的配置读取。当前官方适配器接收 C2C 文本，并保留消息 ID 和回复序号用于被动回复；尚未实现群聊和主动发送。`apps/qq-codex` 的远程执行流程及其授权、去重、审批保持独立。

这属于本仓库的实现范围，并非 QQ 官方平台的能力限制。官方文档已提供[单聊、群聊与主动消息](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html)，群聊开启「接收所有消息」后可接收[非 @ 消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html)。实际可用能力仍取决于机器人已开通的权限、用户设置和平台配额。

新增功能优先接入官方 QQ；已有 NapCat 应用保留兼容，待官方适配补齐群聊、主动发送和业务所需媒体功能，并迁移依赖 NapCat 原始消息的插件后，再决定移除。NapCat 项目仍在维护，最近核查版本为 [v4.18.42（2026-10-30）](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.42)。

跨平台业务使用 `onSession` 或命令上下文的 `session` / `reply()`；旧 `onNapcatMessage`、QQ 消息钩子和 `bot.reply(rawMessage, content)` 继续可用。一个 Bot 只允许一个 NapCat 适配器，以保持旧 QQ 接口的目标明确。

未配置平台插件的旧应用仍自动使用 NapCat；`legacyQQ: false` 可关闭这个兼容入口。显式配置企微或 QQ 平台插件时，不再额外创建默认 NapCat 连接。

本包目前用于工作区开发；仓库现有发布流程仍只发布 `el-bot`，其安装包内置 QQ 兼容实现，不要求从 npm 安装本插件才能使用旧配置。

详见[平台插件说明](../../docs/development/platform-plugins.md)。

# 平台插件

el-bot 的平台接入按实际协议分成两个可选包，每个包内部保留客户端、配置、消息适配和插件注册，不为一层 SDK 包装再拆独立发布包。

| 包 | 职责 |
| --- | --- |
| `el-bot` | 平台注册与启停、消息分发、命令和业务插件 |
| `@el-bot/plugin-wecom` | 官方企微 SDK、智能机器人收发与回复、群 Webhook、可选外部转发、独立 CLI |
| `@el-bot/plugin-qq` | NapCat 连接与消息适配、官方 QQ 私聊与全量群消息适配、旧 QQ 接口兼容 |
| `@el-bot/plugin-grok` | Grok Bot 官方 Webhook 问答及鉴权结果回调，业务插件 |
| `qq-sdk` | 已存在的 QQ 底层 API 与回调验证工具，由 QQ 插件复用 |

这些包目前在本仓库工作区内使用。发布策略仍只发布 `el-bot`；QQ 兼容实现随主包构建和打包，不新增尚未发布的插件运行时依赖。

## 企微独立运行

下面的配置只启动企微连接，不需要 QQ 或 NapCat。加载本机环境变量后，将配置作为普通业务应用运行；不要把真实凭据写入代码。

```ts
import 'dotenv/config'
import { Bot } from 'el-bot'
import { loadWecomConfig, wecomPlugin } from '@el-bot/plugin-wecom'

const bot = new Bot({
  legacyQQ: false,
  bot: {
    autoloadPlugins: false,
    plugins: [
      wecomPlugin({ ...await loadWecomConfig(), id: 'work' }),
      {
        setup(ctx) {
          ctx.command('ping').description('检查连接').action(() => 'pong')
          ctx.hooks.hook('onSession', async (message) => {
            if (message.text === '你好')
              await message.reply('你好！')
          })
        },
      },
    ],
  },
})

await bot.start()
await bot.send('work', { id: 'authorized-recipient', type: 'dm' }, '任务已完成')
```

主动发送仍受企微平台的会话范围和权限限制，目标应来自真实授权或当前会话。SDK 负责智能机器人的连接、认证、心跳和回执；插件负责归一化、去重、外部转发及消息作用域。回复保留原始请求的身份，不依赖全局“当前消息”。

群 Webhook 配置为 `wecomPlugin({ botType: 'webhook', id: 'alerts', groupWebhookUrl })`，随后调用 `bot.send('alerts', { id: 'bound', type: 'group' }, content)`。`bound` 明确表示 URL 已绑定的群，不能用任意群标识改变收件人；群 Webhook 不接收消息。

独立连接、转发或本地校验仍可使用 `pnpm wecom` / `pnpm wecom --check`，底层客户端还可通过 `@el-bot/plugin-wecom/client` 导入。独立 CLI 默认只记录入站消息；业务回复由插件命令或 `onSession` 处理。

## QQ 插件

NapCat 使用 `qqPlugin({ type: 'napcat', connection })`，官方 QQ 使用 `qqPlugin({ type: 'official', appId, secret })`，同时支持私聊文本、群 @ 消息和全量群消息。全量模式需要机器人加入目标群、具备平台权限，并在群内开启「接收所有消息」。完整配置见仓库的 `packages/plugin-qq/README.md`。

群消息使用 `group_openid` 标识群、`member_openid` 标识发送者，通过 `onSession` 接收；附件和结构化内容保留在 `session.raw`。普通群消息不默认执行命令，专门的 @ 事件或以机器人名称开头的命令才进入命令处理。`reply()` 绑定原群和原消息，群内重复推送在进程内去重。此适配不提供历史消息拉取；`el-bot codex` 遥控仍仅接入私聊。

旧应用不必立即改配置：没有平台插件且未设置 `legacyQQ: false` 时，仍使用原来的 NapCat 配置。默认客户端改为延迟创建，企微应用不会初始化 NapCat。旧 QQ 消息钩子和回复方法保留；官方 QQ 与企微使用统一消息上下文。

## 消息与生命周期

平台接口导出于 `el-bot/adapter`，插件只依赖接口类型，不导入整个框架运行时。`MessageContext` 包含平台、适配器身份、账号、发送者、会话、文本和绑定的 `reply()`。相同用户标识在不同平台或账号下不能视为同一个身份。

`onSession` 是新增的跨平台钩子。旧 `onMessage` 仍保留 NapCat 消息类型，避免现有业务插件在未迁移时收到其他格式。命令优先消费消息；未命中命令后才进入消息钩子。

`bot.start()` 先完成插件注册，再启动适配器；`bot.stop()` 逆序关闭连接，解除监听。启动失败会回收已启动及部分启动的适配器；停止后的旧连接消息不会继续分发。主动发送必须指定适配器身份，不会隐式选择第一个平台。

## 验证

平台测试使用本地 WebSocket 或替代客户端，不连接真实机器人。重点验证企微独立启动、命令回复及主动发送、QQ 旧命令兼容、停止后消息隔离、重启无重复监听，以及发布安装包的框架与 CLI 导入。

# 插件开发

当前开发构建使用 `defineBotPlugin()` 和 `setup(bot)` 定义 NapCat 插件。用户命令通过 `bot.command()` 注册，可统一展示帮助、自动回复并消费命中的消息。

以下命令接口、hook 修正和加载容错尚未包含在 npm `1.0.0-rc.2` 中。请先使用仓库开发构建，待框架和脚手架发布后再使用对应 npm 版本。原有 Mirai 插件仍需逐个迁移，不能直接当作 NapCat 插件加载。

## 如何编写

在自定义插件目录中新建 `ping/index.ts`：

```ts
import { defineBotPlugin } from 'el-bot'

export default defineBotPlugin({
  pkg: { name: 'ping', description: '测试机器人是否在线' },
  setup(bot) {
    bot.command('ping')
      .description('测试机器人是否在线')
      .usage('ping')
      .example('ping')
      .action(() => 'pong')
  },
})
```

私聊发送 `ping`，群聊在开头 @机器人后发送 `ping`，或者发送「机器人名字 ping」。`help` / `帮助` 显示命令列表，`help ping` 显示单条帮助。

回调返回字符串或 NapCat 消息链会自动回复；需要多次回复时使用 `context.reply()` 并返回 `void`。参数、权限校验和复杂业务逻辑由插件负责。完整契约见[面向用户的指令系统](/development/user-commands)。

### 带配置的插件

导出一个接受配置并返回插件对象的工厂，配置文件中显式调用它：

```ts
import { defineBotPlugin } from 'el-bot'

interface EchoOptions { prefix?: string }

export default defineBotPlugin<EchoOptions>((options) => ({
  pkg: { name: 'echo' },
  setup(bot) {
    bot.command('echo')
      .description('回显输入的文本')
      .usage('echo <文本>')
      .example('echo 你好')
      .action(args => `${options.prefix ?? ''}${args.join(' ')}`)
  },
}))
```

`defineBotPlugin()` 保留对象与工厂各自的类型。旧版直接导出的 `(bot) => void` 初始化函数需要改为 `{ setup(bot) {} }`。

## 加载插件

### 通过配置加载

`el-bot.config.ts` 或传给 `createBot()` 的配置中设置 `bot.plugins`。数组内放插件对象；工厂需要先调用：

```ts
import { defineConfig } from 'el-bot'
import echoPlugin from './plugins/echo'

export default defineConfig({
  bot: {
    plugins: [echoPlugin({ prefix: '回声：' })],
    autoloadPlugins: false,
  },
})
```

### 自定义插件

开启目录加载，路径相对启动时的工作目录。默认值为 `autoloadPlugins: true` 和 `pluginDir: 'bot/plugins'`；TypeScript 脚手架使用 `plugins`：

```ts
import { defineConfig } from 'el-bot'

export default defineConfig({
  bot: {
    plugins: [],
    autoloadPlugins: true,
    pluginDir: 'plugins',
  },
})
```

- 可使用独立的 `.ts`、`.mts`、`.js`、`.mjs`、`.cts`、`.cjs` 文件，或包含同名扩展名 `index` 入口的目录。多个入口并存时按上述顺序选择第一个。
- TypeScript 插件需要使用支持 TypeScript 的启动方式，例如脚手架的 `tsx` 或框架 CLI。
- 文档、JSON、声明文件、隐藏项和 `node_modules` 不会作为独立插件导入。辅助代码建议放在各插件自己的子目录中。
- 元数据优先采用导出对象的 `pkg`；未提供时读取插件目录的 `package.json`，名称缺省时使用文件或目录名。
- 自动加载工厂时传入 `{}`，插件需要自行处理默认值。需要具体配置时，使用 `bot.plugins: [factory(options)]`，并关闭目录自动加载或移出该插件，避免重复注册。

配置插件按数组顺序初始化，再按名称排序初始化目录中的插件。每个 `setup()` 都会等待完成；目录不可读、导入失败、导出格式错误或初始化抛错会记录诊断并继续处理其他插件。

初始化失败不会回滚已注册的 hook、命令或插件自行打开的资源。插件应先验证配置，再注册处理器，并自行清理初始化失败时创建的资源。下一次启动会重新注册插件命令与框架 hooks。

## 消息 hooks

需要处理未命中的普通消息时，在 `setup(bot)` 中注册框架 hooks：

```ts
import { defineBotPlugin, onPrivateGroupMessage } from 'el-bot'

export default defineBotPlugin({
  pkg: { name: 'temporary-chat' },
  setup(bot) {
    onPrivateGroupMessage(async (message) => {
      await bot.reply(message, '收到一条群临时会话消息')
    })
  },
})
```

未命中用户命令的消息先触发 `onMessage`，再触发 `onNapcatMessage`，随后按类型分流：

| 消息类型 | 后续 hooks，按执行顺序 |
| --- | --- |
| 好友私聊，`sub_type: 'friend'` | `onPrivateFriendMessage` → `onPrivateMessage` |
| 群临时私聊，`sub_type: 'group'` | `onPrivateGroupMessage` → `onPrivateMessage` |
| 群消息 | `onGroupMessage` |

`onPrivateMessage` 的参数类型为两种私聊消息的联合；专属 hook 的参数类型分别对应好友私聊与群临时私聊。命令与帮助命中后，以上框架 hooks 不再执行。

框架只能管理自己的 hooks。直接使用 `bot.napcat.on('message', ...)` 的 SDK 监听器仍会收到消息，插件需要自行解除绑定；普通消息处理优先使用框架 hooks。

## 示例与迁移

- `packages/create-app/template-ts/plugins/test`：脚手架生成的 `test` 命令，回复 `Link Start!`。
- `examples/simple/bot/plugins/ping.ts`：`ping` 命令，回复 `pong`。
- `packages/el-bot/templates/plugin-example`：`login` 命令，查询机器人公开的昵称和账号。
- [内置插件](/plugins/default)：部分仍使用 Mirai API，使用前检查其运行时适配情况。

本轮回归覆盖消息分流、目录与插件失败隔离、JSON 元数据、异步初始化顺序、重载及模板命令接入；测试使用临时目录与模拟 SDK，不连接真实机器人。

2026-10-06 验证：全量 206 项测试、lint、全仓与独立包类型检查、工作区构建、文档构建通过；实际安装 tarball 后的框架/Nest 导入、插件加载、TypeScript 模板、CLI 和声明文件检查分别在 Node.js 24.18.0 与 22.18.0 下通过。

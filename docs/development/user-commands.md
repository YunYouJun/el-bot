# 面向用户的指令系统

本方案实现 [issue #12](https://github.com/YunYouJun/el-bot/issues/12) 的首期闭环：插件通过 `Bot.command()` 注册简单的聊天命令，机器人统一展示帮助，并支持异步回复和程序调用。

## 范围与设计决策

首期接入通用框架的 NapCat 私聊和群聊。QQ 官方平台、Mirai 的事件适配，以及 Codex 应用的 `/help` 目录继续使用各自的入口。现有 Commander CLI 不自动转为用户命令。

| 决策 | 首期行为 |
| --- | --- |
| 注册 | 每个命令拥有独立定义，调用 `.action()` 后进入注册表 |
| 触发 | 私聊允许直接调用；群聊需要开头 @机器人或「机器人名 命令」 |
| 语法 | 命令名为一个非空词，支持中文；其后按空白分割成 `string[]` |
| 帮助 | 内置 `帮助` 和 `help`；同一注册表生成列表与详情 |
| 回复 | 返回文本或 NapCat 消息链自动回复；返回 `void` 不自动回复 |
| 程序调用 | `executeCommand()` 返回命中状态和结果，不自动发送 QQ 消息 |
| 消息分发 | 命中命令后结束本次框架 hooks 分发；其他消息继续原有 hooks |
| 冲突 | 重复名称、内置帮助名称冲突时抛错，保留先注册的命令 |
| 权限 | 插件执行敏感操作前自行检查权限；首期不新增通用权限框架 |
| 异常 | 聊天调用记录错误并回复简短提示；程序调用将错误抛给调用者 |

命令语法不解析引号、子命令和 `--选项`。例如 `搜索 百度 云游君` 的参数为 `['百度', '云游君']`，`--list` 也是普通参数。`.usage()` 中的 `<参数>`、`[参数]` 仅用于展示，参数校验由回调完成。

## 注册与自动回复

```ts
import { defineBotPlugin } from 'el-bot'

export default defineBotPlugin({
  pkg: { name: 'echo', description: '回声示例' },
  setup(bot) {
    bot.command('回声')
      .description('返回输入的文本')
      .usage('回声 <文本>')
      .example('回声 早上好')
      .action(async (args) => {
        if (!args.length)
          return bot.getCommandHelp('回声')
        return args.join(' ')
      })
  },
})
```

保留原有 `.action((args) => ...)` 的第一参数。第二参数 `context` 包含当前 `bot`、调用来源 `source`、可选的原始 NapCat `message`，以及绑定到本次消息的 `reply()`。返回值可以是 `string`、`SendMessageSegment[]`、`void` 或其 Promise。

自动回复与 `context.reply()` 都使用原始消息作为目标，不依赖 Mirai 的全局 `curMsg`。因此并发的异步命令不会将结果回复到另一条消息。

## 聊天触发

假设 `bot.name` 配置为「小云」：

```text
# 私聊
回声 早上好
帮助
help 回声

# 群聊
小云 回声 早上好
@小云 帮助 回声
```

群聊中的「回声 早上好」不会触发命令。「小云回声」也不匹配昵称前缀；昵称与命令之间需要空白。

@触发使用 NapCat 的结构化 `at` 片段，并与消息的 `self_id` 比较。NapCat 请配置数组消息格式（`array`）；原生 `text` 段中的 CQ 字符串不会被命令层当作 @。SDK 会提前解析字符串消息格式的 CQ 文本，因此命令层无法恢复其原始来源。@其他用户、@全体成员以及非开头的 @ 不触发命令。首期解析文本及开头的机器人 @；包含图片、引用等其他消息片段时继续原有消息 hooks。机器人自己发送的消息也不作为命令执行。

已注册命令和内置帮助消费消息，即使回调返回 `void` 或执行失败，也不继续运行普通应答插件。未知命令和未满足群聊前缀的消息不回复命令错误，继续交给原有插件。

这里的消费只作用于框架的 composition hooks；直接使用 `bot.napcat.on()` 订阅 SDK 事件的插件仍会收到消息。希望参与命令消费规则的插件应使用 `onMessage()`、`onNapcatMessage()` 等框架 hooks。私聊中命令名与机器人名相同时，优先按直接命令解析，避免将 `help answer` 误执行为 `answer`。

## 统一帮助

```text
帮助指令：
  帮助 / help [命令名]：查看命令帮助
  回声：返回输入的文本
```

`帮助 回声` 展示描述、用法和全部示例；没有提供用法时默认显示命令名。`bot.getCommandHelp()` 返回列表文本，`bot.getCommandHelp('回声')` 返回详情，不调用任何命令回调。未知名称返回提示文本。

列表只包含插件显式注册且有 `.action()` 的用户命令，不读取 Commander 的管理指令，也不执行插件以收集回复。插件 `pkg.description` 不能代替具体命令的用法说明。`help` 和 `帮助` 是保留名称。

## 手动回复与程序调用

回调可以发送多条消息；手动回复后返回 `void`，避免附加自动回复。需要引用原消息时，将第二参数设为 `true`：

```ts
bot.command('进度').action(async (_, context) => {
  if (context.source !== 'message')
    return '请在聊天中调用进度命令'
  await context.reply('开始处理')
  await context.reply('处理完成', true)
})
```

不依赖真实 QQ 连接的内部调用：

```ts
const execution = await bot.executeCommand('回声 早上好')
if (execution.matched)
  console.log(execution.result) // '早上好'
```

返回值为 `{ matched: false }` 或 `{ matched: true, result }`。命中的回调返回 `void` 时，`result` 为 `undefined`，与未知命令明确区分。程序调用的 `context.source` 为 `programmatic`，不提供 `message`；调用 `context.reply()` 会拒绝，不会向 QQ 发送消息。插件应使用返回值支持这种调用，不直接访问全局消息或发送器。

聊天异常不会把错误细节发送给用户。命令异步回调和发送失败均会记录日志；如果错误提示也无法发送，分发仍正常结束。

## answer 插件接入

已加载的 `answerPlugin` 注册 `answer` 命令，展示配置项的 `help`；`帮助 answer` 展示该命令自身的用法。原有文本应答继续处理未被命令消费的消息。

同一 Bot 实例停止后重新启动时，清理上一次插件加载时注册的命令并重新运行插件 setup，保留启动前手动注册的命令。框架消息监听使用同一个回调，停止时解除订阅，避免开发模式的重启累积回复。

```ts
import { answerPlugin, defineConfig } from 'el-bot'

export default defineConfig({
  bot: {
    name: '小云',
    plugins: [answerPlugin({
      list: [{ receivedText: ['ping'], reply: 'pong', help: '发送 ping，机器人回复 pong' }],
    })],
  },
})
```

## 验收与后续扩展

离线测试覆盖独立注册、重复名称、帮助、参数解析、私聊与群聊触发、结构化 @、程序调用、异步消息链、多条手动回复、并发目标隔离、异常和原有 hooks 顺序。打包 smoke test 验证安装后的框架 API、类型声明和 answer 插件，测试不启动真实机器人连接。

### 2026-10-06 验收记录

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 28 个测试文件、195 项测试通过，包含新增的 40 项命令与生命周期测试 |
| `pnpm lint` | 全仓检查通过 |
| `pnpm typecheck` | 全仓 TypeScript 与文档类型检查通过 |
| `pnpm typecheck:packages` | 独立包与应用类型检查通过 |
| `pnpm build` | 工作区构建通过 |
| `pnpm docs:build` | 文档构建通过 |
| `pnpm test:cli` | 打包安装后的框架与 Nest 导入、用户命令、answer 插件、类型声明及 CLI 检查通过 |
| `fnm exec --using 22.18.0 -- pnpm test:cli` | Node.js 22.18.0 的相同打包安装检查通过 |

以上验证均未连接真实机器人。首期能力已完成开发构建验收，npm `1.0.0-rc.2` 尚未提供这些新增能力；安装用户需等待包含本次改动的后续版本。

后续可按实际需求扩展其他平台适配、命令别名、插件分类和分页、参数校验、权限元数据及媒体参数。首期不实现捕获任意插件回复的 `getReply()`，避免模拟聊天事件造成重复执行或外部消息副作用。

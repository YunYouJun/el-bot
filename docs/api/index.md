# 核心 API

[![api](https://github.com/YunYouJun/el-bot/workflows/api/badge.svg)](https://www.yunyoujun.cn/el-bot/)

el-bot 的 [API 文档](https://www.yunyoujun.cn/el-bot/) 已通过 [typedoc](https://typedoc.org/) 自动生成。

为了更好地帮助你了解及进行示例展示，将会对一些较为有用地 API 方法进行介绍。

## 用户命令

当前开发构建提供以下框架 API，NapCat 聊天入口和完整示例见[面向用户的指令系统](/development/user-commands)：

| API | 用途 |
| --- | --- |
| `bot.command(name)` | 创建独立命令定义，用 `.description()`、`.usage()`、`.example()` 填写帮助，`.action()` 注册回调 |
| `.action((args, context) => result)` | 参数为 `string[]`；支持同步或异步返回文本、NapCat 消息链或 `void` |
| `context.reply(content, quote?)` | 回复本次收到的消息，可手动发送多条；程序调用时拒绝 |
| `bot.executeCommand(text)` | 内部执行并返回命中状态和结果，不自动发送 QQ 消息 |
| `bot.getCommandHelp(name?)` | 获取全部命令列表或单条命令帮助，不执行回调 |

`CommandContext`、`CommandExecution`、`CommandReply`、`CommandResult` 和 `CommandAction` 可从 `el-bot` 导入，供插件声明类型。以上新增能力尚未包含在 npm `1.0.0-rc.2` 中。

## Context 上下文

机器人所有的相关内容均被绑定于 `ctx` 上，它是 `el-bot` 实例化后的自身。这也是开发机器人插件时你默认所能获得到的内容。

`mirai` 本身便是 `ctx` 中的一个属性，即实例化后的 [mirai-ts](https://github.com/YunYouJun/mirai-ts)。

因此你可以借助它来实现与 mirai-api-http 的一切交互。这也意味着除此之外的便是 `el-bot` 的扩展功能（及其存在的意义）。

```ts
import { Bot } from "el-bot";
const bot = new Bot();

function test(ctx) {
  const { mirai } = ctx;
  mirai.on("message", (msg) => {
    console.log(msg);
  });
}

bot.use(test);
```

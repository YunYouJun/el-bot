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

`CommandContext`、`CommandExecution`、`CommandReply`、`CommandResult` 和 `CommandAction` 可从 `el-bot` 导入，供插件声明类型。以上新增能力随 `1.0.0-rc.3` 发布，旧版 npm `1.0.0-rc.2` 不包含这些能力。

## NapCat 插件与消息 hooks

`defineBotPlugin({ setup(bot) {} })` 返回插件对象，`defineBotPlugin<Options>((options) => ({ setup(bot) {} }))` 返回带配置的工厂。通过 `bot.plugins` 配置对象或开启目录自动加载；失败隔离规则见[插件开发](/plugins/)。

好友私聊只进入 `onPrivateFriendMessage`，群临时私聊只进入 `onPrivateGroupMessage`，之后均进入 `onPrivateMessage`。专属 hook 参数分别为 SDK 的 `PrivateFriendMessage`、`PrivateGroupMessage`，通用私聊 hook 接受两者的联合。命中用户命令时不触发框架消息 hooks。

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

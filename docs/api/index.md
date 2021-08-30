# 核心 API

[![api](https://github.com/YunYouJun/el-bot/workflows/api/badge.svg)](https://www.yunyoujun.cn/el-bot/)

el-bot 的 [API 文档](https://www.yunyoujun.cn/el-bot/) 已通过 [typedoc](https://typedoc.org/) 自动生成。

为了更好地帮助你了解及进行示例展示，将会对一些较为有用地 API 方法进行介绍。

## Context 上下文

机器人所有的相关内容均被绑定于 `ctx` 上，它是 `el-bot` 实例化后的自身。这也是开发机器人插件时你默认所能获得到的内容。

`mirai` 本身便是 `ctx` 中的一个属性，即实例化后的 [mirai-ts](https://github.com/YunYouJun/mirai-ts)。

因此你可以借助它来实现与 mirai-api-http 的一切交互。这也意味着除此之外的便是 `el-bot` 的扩展功能（及其存在的意义）。

```js
const Bot = require("el-bot");
const bot = new Bot();

function test(ctx) {
  const { mirai } = ctx;
  mirai.on("message", (msg) => {
    console.log(msg);
  });
}

bot.use(test);
```

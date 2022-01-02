# 快捷指南

## 介绍

[![npm](https://img.shields.io/npm/v/el-bot?logo=npm)](https://www.npmjs.com/package/el-bot)&nbsp;
[![GitHub package.json dependency version (subfolder of monorepo)](https://img.shields.io/github/package-json/dependency-version/YunYouJun/el-bot/mirai-ts?filename=packages%2Fel-bot%2Fpackage.json&logo=typescript)](https://github.com/YunYouJun/mirai-ts)&nbsp;
[![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/ElpsyCN/el-bot)](https://github.com/ElpsyCN/el-bot)&nbsp;
[![QQ Group](https://img.shields.io/badge/QQ%20Group-707408530-12B7F5?logo=tencent-qq)](https://shang.qq.com/wpa/qunwpa?idkey=5b0eef3e3256ce23981f3b0aa2457175c66ca9194efd266fd0e9a7dbe43ed653)&nbsp;
[![Telegram](https://img.shields.io/badge/Telegram-elpsy__cn-blue?logo=telegram)](https://t.me/elpsy_cn)&nbsp;
[![GitHub](https://img.shields.io/github/license/YunYouJun/el-bot)](https://github.com/YunYouJun/el-bot/blob/master/LICENSE)

> 这是啥？

一个基于 [mirai-ts](https://github.com/YunYouJun/mirai-ts)，运行于 Node.js，使用 TypeScript 编写实现的优雅、可配置的 QQ 机器人框架。

~~适合于认为 JavaScript/TypeScript 是世界上最好的语言的用户~~

[一份无关紧要的开发历程](https://www.yunyoujun.cn/note/make-el-bot/)

### Feature

el-bot 展示了整个 mirai-ts 的使用流程，并内置了一些如自动应答、转发、命令行、RSS 等常用功能（默认插件），开箱即用。

你只需要一些自定义的配置，而不再需要编写繁琐的脚本内容。

但这并不是束缚，在插件系统中你仍然可以调用机器人所有的上下文，并通过编写插件的形式快速实现你想要的功能。

**el-bot 有什么好处？**

- 使用 JavaScript 这一解释型语言，所以可以较为方便地实现运行时动态加载插件。
- 使用函数式编程的思想，专注于实现常用的小功能，并很容易插入你自定义的插件。
- 优雅的控制台信息显示。
- 她还提供了一些常用的脚本，譬如启动与自动登录 mirai-console，webhook 等。

::: warning
由于种种原因，本项目将不再提供安装 [mirai](https://github.com/mamoe/mirai) 的脚本与方法，你应当具有自行安装并启动 mirai 的能力。
:::

## 开始

首先，你必须得有 [Java](https://www.java.com/zh_CN/) 与 [Node.js](https://nodejs.org/zh-cn/download/) 环境。

::: tip
你也可以直接参考或使用 [el-bot-template](https://github.com/ElpsyCN/el-bot-template)。（推荐，仅阅读 README 即可快读开始。）
即便你不用它，你也可以参考一下它的 [package.json](https://github.com/ElpsyCN/el-bot-template/blob/master/package.json) 配置启动脚本。
:::

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君" >El Psy Congroo</chat-message>
  <chat-message :id="712727945" nickname="小云" >Link Start!</chat-message>
</chat-panel>

## 安装

mirai 1.0 版本以上推荐使用官方启动器 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader) 自行启动 [mirai](https://github.com/mamoe/mirai) 与 [mirai-api-http](https://github.com/mamoe/mirai-api-http) 插件。

```bash
npm install el-bot
# yarn add el-bot
```

::: tip

因为国内速度较慢，你可以考虑切换为淘宝镜像源（但包的同步，可能有所延迟）：

```bash
npm config set registry https://registry.npm.taobao.org
```

:::

目录结构请参考 [el-bot-template](https://github.com/ElpsyCN/el-bot-template) ![GitHub package.json version](https://img.shields.io/github/package-json/v/elpsycn/el-bot-template) 或直接使用它生成你的机器人。

> 0.8.0 新增：`setting` 可以是 mirai-api-http `setting.yml` 的路径
> 如 `setting: './mcl/config/net.mamoe.mirai-api-http/setting.yml'`

```js
// index.js
const Bot = require("el-bot");

const bot = new Bot({
  qq: 114514,
  // 推荐
  setting: './mcl/config/net.mamoe.mirai-api-http/setting.yml',
  // 您也可以按照其格式，手动书写对应 JSON
  // bot: ...
});
bot.start();
```

So easy! Right?

## 配置

你可以使用 JSON 编写配置文件，也可以考虑一下简洁而强大的 [YAML](https://baike.baidu.com/item/YAML/1067697)。

> [YAML 语言教程](https://www.ruanyifeng.com/blog/2016/07/yaml.html)

`YAML` 是一种专攻配置的语言，可读性高（JSON 有时确实让人眼花缭乱不是么？）。（

> `mirai-api-http` 同样也使用该语言配置 `setting.yml`。

当然你还可以自由组合你的配置。（**编写配置时，请务必注意你的层级和缩进。**）

譬如：

```bash
.
└── el
    ├── index.js
    └── index.yml
```

```js
require("dotenv").config();
const { resolve } = require("path");
const { utils } = require("el-bot");

module.exports = {
  qq: parseInt(process.env.BOT_QQ),
  setting: {
    enableWebsocket: true
  },
  // 0.8.0 后 config 字段被重命名为 bot
  bot: {
    plugins: utils.config.parse(resolve(__dirname, "./index.yml"))
  }
};
```

阅读后续内容以使用更多的特性吧。

## 升级

```bash
npm install el-bot@latest
# yarn add el-bot@latest
```

el-bot 只是一个依赖库，意味着你可以基于此以任意的方式定制你的机器人。

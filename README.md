# el-bot

[![api](https://github.com/YunYouJun/el-bot/workflows/api/badge.svg)](https://www.yunyoujun.cn/el-bot/)
[![npm](https://img.shields.io/npm/v/el-bot?logo=npm)](https://www.npmjs.com/package/el-bot)
[![GitHub package.json dependency version (subfolder of monorepo)](https://img.shields.io/github/package-json/dependency-version/YunYouJun/el-bot/mirai-ts?filename=packages%2Fel-bot%2Fpackage.json&logo=typescript)](https://github.com/YunYouJun/mirai-ts)
[![QQ Group](https://img.shields.io/badge/QQ%20Group-707408530-12B7F5?logo=tencent-qq)](https://shang.qq.com/wpa/qunwpa?idkey=5b0eef3e3256ce23981f3b0aa2457175c66ca9194efd266fd0e9a7dbe43ed653)
[![Telegram](https://img.shields.io/badge/Telegram-elpsy__cn-blue?logo=telegram)](https://t.me/elpsy_cn)
[![GitHub](https://img.shields.io/github/license/YunYouJun/el-bot)](https://github.com/YunYouJun/el-bot/blob/master/LICENSE)
![node-current](https://img.shields.io/node/v/el-bot)

一个基于 [mirai-ts](https://github.com/YunYouJun/mirai-ts)，使用 TS/JS 编写，快速、可配置、可自定义插件的 QQ 机器人框架。

> el-bot 是一个非盈利的开源项目，仅供交流学习使用。请勿用于商业或非法用途，因使用而与腾讯公司产生的一切纠纷均与原作者无关。

- 使用文档：<https://docs.bot.elpsy.cn>
- API 文档：<https://www.yunyoujun.cn/el-bot/>

> El-Bot will be ESM only!

## 开始

mirai 1.0 版本以上推荐使用官方启动器 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader) 自行启动 [mirai](https://github.com/mamoe/mirai) 与 [mirai-api-http](https://github.com/mamoe/mirai-api-http) 插件。

（因为种种原因，本项目不接受任何关于如何使用 mirai 的问题，你应当具有自行启动 mirai 的能力，但欢迎 el-bot 项目本身的反馈。）

> 你也可以直接参考 [el-bot-template](https://github.com/ElpsyCN/el-bot-template)。

```sh
npm install el-bot
# pnpm i el-bot
```

```ts
import { Bot } = from "el-bot";

const bot = new Bot({
  qq: 114514,
  setting: {
    host: "localhost",
    port: 4859,
    authKey: "el-psy-congroo",
    enableWebsocket: true
  }
  // bot: ...
});
bot.start();
```

So easy! Right?

详细使用说明请参见 [el-bot 文档](https://docs.bot.elpsy.cn/)。

## 升级

```sh
npm install el-bot@latest
```

相关变动请参见 [Releases](https://github.com/YunYouJun/el-bot/releases)。

## 反馈

有问题和建议欢迎提 Issue，谢谢！（在此之前，请确保您已仔细阅读文档。）

## 说明

请勿将其用于商业或非法用途。

### [与 koishi 的区别](https://docs.bot.elpsy.cn/about.html#与-koishi-的区别)

## 相关项目

- [el-bot](https://github.com/YunYouJun/el-bot)：机器人主体
- [el-bot-api](https://github.com/ElpsyCN/el-bot-api): 提供一些插件的默认 API
- [el-bot-plugins](https://github.com/ElpsyCN/el-bot-plugins): el-bot 的官方插件集中地（你也可以提交 PR 或一些自己的插件链接到 README 里打广告）
- [el-bot-docs](https://github.com/ElpsyCN/el-bot-docs): el-bot 使用文档
- [el-bot-template](https://github.com/ElpsyCN/el-bot-template)：机器人模版（你可以直接使用它来生成你的机器人）
- [el-bot-web](https://github.com/ElpsyCN/el-bot-web)：机器人前端（通过网页监控与控制你的机器人）（但是还在咕咕咕）

## Thanks

感谢以下项目为 el-bot 提供的开发运行环境与带来的灵感。

- [mirai](https://github.com/mamoe/mirai)
- [mirai-console](https://github.com/mamoe/mirai-console)
- [mirai-api-http](https://github.com/mamoe/mirai-api-http)
- [mirai-ts](https://github.com/YunYouJun/mirai-ts)
- [koishi](https://github.com/koishijs/koishi)

## 开发

```sh
git clone https://github.com/YunYouJun/el-bot
cd el-bot
pnpm i
```

配置测试机器人（看情况配置吧）

```sh
cp bot/.env.example .env
```

启动 mcl，须已配置 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader)

```sh
npm run mcl
```

开发测试（运行起来吧）

```sh
npm run dev:bot
```

开发 el-bot 库

```sh
npm run dev:lib
```

### 构建

```sh
# 构建 el-bot
npm run build
```

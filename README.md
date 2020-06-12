# el-bot-js

[![docs](https://github.com/ElpsyCN/el-bot-docs/workflows/docs/badge.svg)](https://docs.bot.elpsy.cn/js/)
![GitHub package.json version](https://img.shields.io/github/package-json/v/ElpsyCN/el-bot-js)
[![QQ Group](https://img.shields.io/badge/qq%20group-707408530-12B7F5)](https://shang.qq.com/wpa/qunwpa?idkey=5b0eef3e3256ce23981f3b0aa2457175c66ca9194efd266fd0e9a7dbe43ed653)
[![GitHub](https://img.shields.io/github/license/ElpsyCN/el-bot-js)](https://github.com/ElpsyCN/el-bot-js/blob/master/LICENSE)

el-bot 的 js（~~女子小学生~~） 版本。开发中...

一个基于 mirai 实现的配置型 QQ 机器人。

文档：[el-bot-js | el bot docs](https://docs.bot.elpsy.cn/js/)

## 快速开始

### 配置

复制 `.env.example` 文件为 `.env`。

填写你的 QQ 和密码。（脚本将会自动读取，并在启动控制台后登录）

> 当然，你手动登录也可以

```bash
BOT_QQ=123456
BOT_PASSWORD=******
```

复制 `plugins/MiraiAPIHTTP/setting.example.yml` 文件为 `plugins/MiraiAPIHTTP/setting.yml`。

自定义你的 `authKey`，这很重要，否则你的机器人将很可能被 [NTR](https://zh.moegirl.org/zh-hans/NTR)。

```yaml
authKey: el-bot-js
```

### 运行

```sh
# 安装依赖
yarn
# npm install

# 安装 mirai 依赖
yarn install:mirai
# npm run install:mirai

# 启动 mirai 控制台
yarn start:console
# npm run start:console

# 启动 el-bot-js
yarn start
# npm run start
```

此时，你的 QQ 机器人就已经成功运行起来了。并将附带一些默认的功能。

然后？然后参照 [文档](https://docs.bot.elpsy.cn/js/) 编写你的自定义配置文件 `config/custom/index.yml` 即可。

### 开发

```sh
# 开发模式 el-bot-js
yarn dev
# npm run dev
```

## Thanks

- [mirai](https://github.com/mamoe/mirai)
- [mirai-console](https://github.com/mamoe/mirai-console)
- [mirai-console-wrapper](https://github.com/mamoe/mirai-console-wrapper)
- [mirai-api-http](https://github.com/mamoe/mirai-api-http)
- [node-mirai](https://github.com/RedBeanN/node-mirai)

# TypeScript 机器人模板

在 `el.config.ts` 配置 NapCat 地址、访问令牌和主人账号。
`plugins/test` 使用 `defineBotPlugin()` 和 `bot.command()` 注册 `test` 命令；
自定义插件放在 `plugins`，通过 `bot.autoloadPlugins: true` 自动加载。

模板中的用户命令需要当前仓库开发构建，尚未包含在 npm `el-bot@1.0.0-rc.2` 中。
开发验证时请安装仓库构建的 el-bot tarball；待框架和脚手架发布后再使用对应 npm 版本。

```bash
pnpm install
pnpm typecheck
pnpm dev
```

模板通过 tsx 直接运行 TypeScript，`pnpm start` 用于普通启动。
私聊发送 `test` 会收到 `Link Start!`；群聊先 @机器人再发送 `test`，
或者使用「机器人名字 test」。`help` / `帮助` 查看列表，`help test` 查看命令说明。
插件格式、加载容错和消息 hooks 见[插件开发](https://docs.bot.elpsy.cn/plugins/)。
QQ 官方机器人遥控 Codex 请使用 el-bot 工作区的 `pnpm qq:codex`，
参见 [接入文档](https://docs.bot.elpsy.cn/development/codex-remote)。

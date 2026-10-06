# NapCat 命令示例

在 `el-bot.config.ts` 配置自己的 NapCat WebSocket 地址和令牌，使用 Node.js 22.18 或更高版本。
在仓库根目录执行 `pnpm install`、`pnpm build`，然后执行 `pnpm example:simple` 启动。
启动需要已配置且正在运行的 NapCat；构建和测试不需要连接机器人。

`bot/plugins/ping.ts` 使用 `defineBotPlugin()` 和 `bot.command()` 注册命令。
私聊发送 `ping` 收到 `pong`；群聊先 @机器人再发送 `ping`，或使用「机器人名字 ping」。
`help` / `帮助` 查看列表，`help ping` 查看单条说明。命中命令后不再执行普通消息 hooks。

这是工作区开发示例，用户命令尚未包含在 npm `el-bot@1.0.0-rc.2` 中。
完整接口与加载规则见[插件开发](https://docs.bot.elpsy.cn/plugins/)。

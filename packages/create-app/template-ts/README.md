# TypeScript 机器人模板

在 `el.config.ts` 配置 NapCat 地址、访问令牌和主人账号。
`plugins/test` 演示如何订阅 NapCat 消息；自定义插件放在 `plugins`。

```bash
pnpm install
pnpm typecheck
pnpm dev
```

模板通过 tsx 直接运行 TypeScript，`pnpm start` 用于普通启动。
QQ 官方机器人遥控 Codex 请使用 el-bot 工作区的 `pnpm qq:codex`，
参见 [接入文档](https://docs.bot.elpsy.cn/development/codex-remote)。

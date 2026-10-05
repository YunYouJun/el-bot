# el-bot

[![docs](https://github.com/ElpsyCN/el-bot-docs/workflows/docs/badge.svg)](https://docs.bot.elpsy.cn/)
[![api](https://github.com/YunYouJun/el-bot/workflows/api/badge.svg)](https://www.yunyoujun.cn/el-bot/)
[![npm](https://img.shields.io/npm/v/el-bot?logo=npm)](https://www.npmjs.com/package/el-bot)
[![GitHub package.json dependency version (subfolder of monorepo)](https://img.shields.io/github/package-json/dependency-version/YunYouJun/el-bot/mirai-ts?filename=packages%2Fel-bot%2Fpackage.json&logo=typescript)](https://github.com/YunYouJun/mirai-ts)
![node-current](https://img.shields.io/node/v/el-bot)

More info see [README.md](https://github.com/YunYouJun/el-bot#readme).

## QQ 遥控 Codex

Node.js 22.18+、已登录的 Codex CLI 和 QQ 官方机器人 AppID / AppSecret 准备好后：

```bash
el-bot codex init --project /absolute/path/to/project --name project
el-bot codex check --all
el-bot codex start
```

首次启动后，将终端显示的 `/pair ...` 绑定码私聊发送给自己的 QQ 机器人。
在 QQ 后台启用 WebSocket 并配置出口 IP 白名单。配置、凭据和状态默认保存在 `~/.el-bot`，不会覆盖已有绑定。

使用 `el-bot codex --help` 查看命令，`el-bot --version` 查看版本。
`el` 别名与原有 `el-bot dev [root]` 机器人入口保留。
完整文档：[QQ 遥控 Codex](https://docs.bot.elpsy.cn/development/codex-remote)。

Codex 子命令从 `1.0.0-beta.17` 起提供：`pnpm add -g el-bot@next`。新实例可使用 `el-bot codex --profile personal init --project /absolute/path/to/project`；独立 Codex 目录须先登录，见[实例隔离与恢复](https://docs.bot.elpsy.cn/codex/instances)。

### 使用 AI 接入

把 [AI 接入提示词](https://github.com/YunYouJun/el-bot/blob/dev/docs/codex/ai-setup.md)和项目路径交给本机助手。
助手使用 `el-bot codex init --no-prompt` 创建配置，通过 `check` / `check --all` 检查登录与 QQ API；
你在本机填写 AppSecret，并在 QQ 私聊完成绑定。不要把密钥或完整状态发给 AI。
文档站部署后提供 [llms.txt](https://docs.bot.elpsy.cn/llms.txt) 与 [完整 Markdown](https://docs.bot.elpsy.cn/llms-full.txt)。

## Napcat

> [NapCatQQ](https://napneko.github.io/zh-CN/)

```bash
# https://napneko.github.io/zh-CN/guide/getting-started
curl -o napcat.sh https://nclatest.znin.net/NapNeko/NapCat-Installer/main/script/install.sh && sudo bash napcat.sh
```

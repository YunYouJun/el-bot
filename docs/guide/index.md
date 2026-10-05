# 快捷指南

el-bot 提供 QQ 机器人框架和统一 CLI。先根据用途选择入口：

| 需求 | 接入方式 |
| --- | --- |
| 用 QQ 遥控本机 Codex | [完整安装与接入](/development/codex-remote)，使用 QQ 官方机器人 |
| 让本机 AI 助手帮忙配置 | [AI 快速接入](/codex/ai-setup)，复制提示词后提供项目路径 |
| 编写 QQ 机器人、加载自定义插件 | 以下框架指南，默认使用 NapCat |

## QQ 遥控 Codex

安装包含新版 CLI 的 `el-bot` 后运行：

```bash
el-bot codex init --project /absolute/path/to/my-project --name my-project
el-bot codex check --all
el-bot codex start
```

需要 Node.js 22.18+、已登录的 Codex CLI，以及 QQ 官方机器人的 AppID / AppSecret。
无需安装 Java、Mirai 或 NapCat。首次启动后，在 QQ 私聊发送终端显示的绑定码。

::: info 发布状态
使用 `pnpm add -g el-bot@next` 安装，或固定 `el-bot@1.0.0-rc.1`，见[安装文档](/development/codex-remote#安装-cli)。新实例使用 `--profile`，见[实例隔离与恢复](/codex/instances)。
预发布版发布后安装 `el-bot@next`，正式版安装 `el-bot@latest`。
:::

## 机器人框架

框架默认使用 [NapCatQQ](https://napneko.github.io/) 连接 QQ。先配置并启动 NapCat 的正向 WebSocket 服务，
再在自己的 ESM 项目中安装框架：

```bash
pnpm add el-bot
```

在项目目录创建 `el-bot.config.ts`，连接信息与 NapCat 的设置一致：

```ts
import { defineConfig } from 'el-bot'

export default defineConfig({
  napcat: {
    protocol: 'ws',
    host: '127.0.0.1',
    port: 3001,
    accessToken: '', // 在本机配置，与 NapCat 一致
  },
  bot: {
    master: [], // 填写自己的 QQ 账号
    plugins: [],
    pluginDir: 'plugins',
  },
})
```

从配置所在目录启动：

```bash
pnpm exec el-bot dev .
```

也可以在 TypeScript 入口中调用框架：

```ts
import { createBot } from 'el-bot'

const bot = await createBot()
await bot.start()
```

该 API 从当前目录读取 `el-bot.config.ts`，在支持 TypeScript 的运行器中使用。
插件接入见[扩展功能](/guide/extend)。当前部分插件仍依赖 Mirai，应核对各插件的适配要求；
旧版 Mirai 配置不能直接当作 NapCat 配置使用，迁移范围见[工作区文档](/development/monorepo#依赖与兼容性)。

## 升级与迁移

升级前保留自己的配置、插件与状态。框架更新使用 `pnpm update el-bot`；Codex CLI 更新后先运行
`el-bot codex --help` 与 `el-bot codex paths`，确认命令和文件路径，再做连接检查。
此前独立 QQ Codex 包由统一 CLI 替代，沿用原有配置及 `--state` 路径即可保留绑定和会话。

[CLI 命令](/guide/cli) · [版本发布](https://github.com/YunYouJun/el-bot/releases) · [参与开发](/development/monorepo)

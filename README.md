# el-bot

[![api](https://github.com/YunYouJun/el-bot/workflows/api/badge.svg)](https://www.yunyoujun.cn/el-bot/)
[![npm](https://img.shields.io/npm/v/el-bot?logo=npm)](https://www.npmjs.com/package/el-bot)
[![GitHub package.json dependency version (subfolder of monorepo)](https://img.shields.io/github/package-json/dependency-version/YunYouJun/el-bot/mirai-ts?filename=packages%2Fel-bot%2Fpackage.json&logo=typescript)](https://github.com/YunYouJun/mirai-ts)
[![QQ Group](https://img.shields.io/badge/QQ%20Group-707408530-12B7F5?logo=tencent-qq)](https://shang.qq.com/wpa/qunwpa?idkey=5b0eef3e3256ce23981f3b0aa2457175c66ca9194efd266fd0e9a7dbe43ed653)
[![Telegram](https://img.shields.io/badge/Telegram-elpsy__cn-blue?logo=telegram)](https://t.me/elpsy_cn)
[![GitHub](https://img.shields.io/github/license/YunYouJun/el-bot)](https://github.com/YunYouJun/el-bot/blob/master/LICENSE)
![node-current](https://img.shields.io/node/v/el-bot)

一个基于 Node.js、使用 TypeScript 编写的可配置 QQ 机器人框架，采用 pnpm monorepo 管理。

> el-bot 是一个非盈利的开源项目，仅供交流学习使用。请勿用于商业或非法用途。
> 本项目为个人学习项目，与腾讯公司并无关联。

- 使用文档：<https://docs.bot.elpsy.cn>
- API 文档：<https://www.yunyoujun.cn/el-bot/>

## QQ 遥控 Codex

通过 `el-bot codex` 子命令遥控本机 Codex，随 `el-bot` 包提供，支持 QQ 官方私聊绑定、项目/会话切换、任务停止、审批和结果查询。

源码中可以直接运行：

```bash
pnpm install
pnpm build
pnpm cli codex init --project /absolute/path/to/project
pnpm cli codex check --all
pnpm cli codex start
```

`init` 交互填写 AppID / AppSecret，默认配置位于 `~/.el-bot`，密钥隐藏输入且不会写入仓库。
可通过 `pnpm --filter el-bot pack --pack-destination ./dist` 生成独立安装包；
安装后直接使用 `el-bot codex init`、`el-bot codex check`、`el-bot codex start`，无需克隆仓库。
当前改动不代表新包已发布到 npm。

完整安装、迁移和命令说明见 [QQ 遥控 Codex](docs/development/codex-remote.md)。

在 QQ 中的使用示例：

```text
/project my-project
检查 README 的安装步骤，修正文档里的过期命令
/status
/result
继续补充 Windows 用户的安装说明
```

每个项目保留独立会话，需要升级权限时使用 `/approval` 查看请求，再逐次 `/approve` 或 `/reject`。
查看[功能展示](docs/codex/index.md)了解任务、审批和续聊流程。

### 让 AI 帮你接入

复制 [AI 快速接入提示词](docs/codex/ai-setup.md#复制给你的-ai-助手)，提供自己的项目路径，
让本机 Codex、Claude Code 等助手检查环境、执行 `init --no-prompt` 和连接检查。
AppSecret 在本机填写，QQ 登录与绑定由本人完成。使用 `el-bot@next`，或固定 `el-bot@1.0.0-beta.17`；先检查 `el-bot codex --help`。
新实例可用 `--profile personal` 隔离配置、凭据、状态和 Codex 目录，见[实例隔离与恢复](https://docs.bot.elpsy.cn/codex/instances)。无需 YunLeFun 账户。

文档构建自动生成 `llms.txt`、`llms-full.txt` 和原始 Markdown，方便 AI 读取同版本接入说明。

## ⚠️ BREAKING CHANGES (REFACTORING)

**正在重构开发中，因此它的很多代码可能已经失效，并将被移除。**

- QQ
  - 迁移 [mirai](https://github.com/mamoe/mirai) 至 [NapCatQQ](https://github.com/NapNeko/NapCatQQ)
  - 迁移 [mirai-ts](https://github.com/YunYouJun/mirai-ts) 至 [node-napcat-ts](https://github.com/huankong-team/node-napcat-ts)
- 使用 Node.js 与 TypeScript，pnpm 统一管理工作区和依赖目录。
- 工程约定参考 [starter-monorepo](https://github.com/YunYouJun/starter-monorepo)：共享依赖 catalog、tsdown、Vitest 和 ESLint。
- QQ 官方机器人遥控 Codex 随统一 CLI 提供；私有 `apps/qq-codex` 模块不单独发布，使用步骤与社区参考见[接入文档](./docs/development/codex-remote.md)。

## 开始

参考以下文档，启动 QQ 协议端。

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ)

### 环境与安装

仓库开发使用 Node.js 24（见 `.node-version`）和 pnpm 11.24.0（见 `packageManager`）。

```sh
pnpm add el-bot
```

### 初始化文件

> 你也可以直接参考 [el-bot-template](https://github.com/ElpsyCN/el-bot-template)。

```ts
import { createBot } from 'el-bot'

// Load el-bot.config.ts from the current directory.
const bot = await createBot()
await bot.start()
```

So easy! Right?

详细使用说明请参见 [el-bot 文档](https://docs.bot.elpsy.cn/)。

### 编写插件

- [node-napcat-ts](https://github.com/huankong-team/node-napcat-ts)

### 启动

```bash
pnpm exec el-bot
```

### 升级

```sh
pnpm add el-bot@latest
```

相关变动请参见 [Releases](https://github.com/YunYouJun/el-bot/releases)。

## 反馈

有问题和建议欢迎提 Issue，谢谢！（在此之前，请确保您已仔细阅读文档。）

## 说明

### [与 koishi 的区别](https://docs.bot.elpsy.cn/about.html#与-koishi-的区别)

## 相关项目

- [el-bot](https://github.com/YunYouJun/el-bot)：机器人主体
- [el-bot-api](https://github.com/ElpsyCN/el-bot-api): 提供一些插件的默认 API
- [el-bot-plugins](https://github.com/ElpsyCN/el-bot-plugins): el-bot 的官方插件集中地（你也可以提交 PR 或一些自己的插件链接到 README 里打广告）
- [el-bot-docs](https://github.com/ElpsyCN/el-bot-docs): el-bot 使用文档
- [el-bot-template](https://github.com/ElpsyCN/el-bot-template)：机器人模版（你可以直接使用它来生成你的机器人）
- [el-bot-web](https://github.com/ElpsyCN/el-bot-web)：机器人前端（通过网页监控与控制你的机器人）（但是还在咕咕咕）

## Thanks

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ)
- [node-napcat-ts](https://github.com/huankong-team/node-napcat-ts)
- [go-cqhttp](https://github.com/Mrs4s/go-cqhttp)
- [mirai](https://github.com/mamoe/mirai)
- [mirai-console](https://github.com/mamoe/mirai-console)
- [mirai-api-http](https://github.com/mamoe/mirai-api-http)
- [mirai-ts](https://github.com/YunYouJun/mirai-ts)
- [koishi](https://github.com/koishijs/koishi)

## 参与开发

```sh
git clone https://github.com/YunYouJun/el-bot
cd el-bot
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck:packages
```

- `pnpm dev`：启动需要本地机器人配置的 demo。
- `pnpm dev:lib`：监听 QQ SDK 与脚手架构建。
- `pnpm typecheck`：完整检查，包括仍在迁移的旧插件和示例，保持完整覆盖。
- `pnpm docs:dev` / `pnpm docs:build`：开发 / 构建文档站。

目录职责、新增包和迁移范围见 [Monorepo 开发](./docs/development/monorepo.md)。

## CHANGELOG

See [CHANGELOG.md](./CHANGELOG.md).

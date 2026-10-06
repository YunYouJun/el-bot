# @el-bot/create-app

创建 el-bot 项目的交互式脚手架，要求 Node.js 22.18 或更高版本。

```sh
pnpm dlx @el-bot/create-app
```

TypeScript 模板随 npm 包发布，JavaScript 选项会克隆
[el-bot-template](https://github.com/elpsycn/el-bot-template)。
仓库中的 TypeScript 模板使用 NapCat、`defineBotPlugin()` 和 `bot.command()`，
演示自动加载插件、命令帮助与回复。该命令能力尚未包含在 npm `el-bot@1.0.0-rc.2` 中，
开发验证需安装当前仓库构建的框架 tarball；框架和脚手架发布后可使用对应 npm 版本。
JavaScript 远程模板仍需结合当前框架进行迁移。

仓库开发：`pnpm --filter @el-bot/create-app build`，产物为 `dist/index.mjs`。

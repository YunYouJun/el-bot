# @el-bot/create-app

创建 el-bot 项目的交互式脚手架，要求 Node.js 22.18 或更高版本。

```sh
pnpm dlx @el-bot/create-app
```

TypeScript 模板随 npm 包发布，JavaScript 选项会克隆
[el-bot-template](https://github.com/elpsycn/el-bot-template)。
模板仍使用历史机器人 API，需要结合当前框架的运行时迁移调整。

仓库开发：`pnpm --filter @el-bot/create-app build`，产物为 `dist/index.mjs`。

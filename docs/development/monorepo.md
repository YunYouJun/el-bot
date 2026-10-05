# Monorepo 开发

工程约定参考 [starter-monorepo](https://github.com/YunYouJun/starter-monorepo)。
使用 `.node-version` 指定的 Node.js 24 和 `packageManager` 固定的 pnpm 11.24.0。

## 目录与职责

| 目录 | 用途 |
| --- | --- |
| `apps/qq-codex` | 私有 QQ 遥控实现模块，向统一 CLI 注册 `codex` 子命令 |
| `packages/el-bot` | 机器人框架、Nest 适配器与统一 CLI，发布编译后的 ESM 和类型声明；旧启动器保留 TypeScript |
| `packages/qq-sdk` | QQ 官方 API 和 webhook 验证，tsdown 构建 ESM 与类型声明 |
| `packages/codex` | app-server / proxy、版本 schema 和 Desktop MCP 客户端 |
| `packages/create-app` | 项目脚手架，tsdown 构建 Node CLI，随包携带模板 |
| `packages/cli` | 旧版独立 CLI 草稿，尚未配置构建 |
| `plugins/*` | 已有插件，保留各自的旧构建流程 |
| `examples/*`、`demo` | 现有运行示例，需要自行配置机器人 |
| `docs` | VitePress 文档站 |
| `playground` | 预留的本地实验工作区 |

`apps/*` 和 `playground` 已注册工作区。
`packages/@el-bot/plugin-niubi` 是同名旧副本，不注册到工作区。

## 开发命令

```bash
pnpm install
pnpm build                 # packages/* 与 apps/* 中声明了 build 的包
pnpm dev:lib               # QQ SDK 与脚手架构建监听
pnpm test                  # 一次性执行测试，适用于 CI
pnpm test:cli              # 打包后在独立目录安装并验证 CLI
pnpm cli codex --help      # 统一 CLI 的源码入口
pnpm test:watch            # 测试监听
pnpm lint
pnpm typecheck             # 全仓检查，包括旧插件与示例
pnpm typecheck:packages    # 已声明独立类型检查的包
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

`pnpm dev` 保留为 demo 开发入口；`pnpm dev:simple` 启动简单示例。
运行机器人需要配置 QQ/NapCat 连接，这些命令不属于无凭证工程验证。
CI 使用 `pnpm install --frozen-lockfile`，禁止在 CI 隐式改写锁文件。

## 新增包

1. 在 `packages/<name>` 创建 `package.json`、`src/index.ts`、`tsconfig.json` 和 `tsdown.config.ts`。
2. 继承根 `tsconfig.base.json`，为库生成类型声明，确保 `exports` 指向真实产物。
3. 外部依赖版本集中写入 `pnpm-workspace.yaml`，包内用 `catalog:`；内部包用 `workspace:*`。
4. 声明 `build`、`dev`、`typecheck`，需要发布时用 `prepack` 构建；新增测试放入包的 `test/` 或 `src/`。
5. 验证构建、类型检查、测试和发布包内容后再发布。

## 依赖与兼容性

依赖版本集中在 catalog。Node.js 使用 24，TypeScript 保留 5.9，匹配 sagiri 和类型文档工具支持范围。此次检查中 TypeScript 最新版为 7，但 sagiri 仍要求 `^5.0.0`，TypeDoc 尚不支持 7；不强行跨主版本升级。
Chalk 升级为 6；`@types/node` 使用与 Node 24 对应的最新版本；c12 保留稳定版 3，避免将 RC 作为稳定更新引入。
`el-bot` 是 `el-bot` / `el` 可执行命令的唯一发布者，`apps/qq-codex` 保持私有。
CLI 将内部 Codex 客户端与 QQ 官方协议实现打包，第三方运行时依赖独立声明。
框架使用的工作区 `qq-sdk` 同样构建进发布包，由包内 `#qq-sdk` 映射引用，安装时不依赖 registry 中的同名版本。
`pnpm test:cli` 检查真实 tarball 安装、命令入口、非交互初始化、参数校验与凭据脱敏，CI 覆盖三个操作系统。
传入 `pnpm test:cli dist/el-bot-<版本>.tgz` 可验证已有安装包；发布工作流会测试并上传同一个文件。

库与插件统一使用 tsdown；旧 CLI 下载改用原生 fetch，移除 download 和闲置的 npm-run-all 依赖树。

文档已迁移到 VitePress 官方主题，使用本地搜索、当前导航配置和独立的 Vue 类型检查。
首页与 `/codex/` 展示 QQ 任务、审批和会话续聊；`/codex/ai-setup` 提供可复制的 AI 接入提示词。
`scripts/build-ai-docs.mjs` 在文档开发/构建前从当前 Markdown 生成 `llms.txt`、`llms-full.txt` 和 `/ai/` 下的原始 Markdown。
生成文件不提交 Git，由 VitePress 复制到站点产物；无需手工维护第二份指南。更新源文档后，重启开发服务器以刷新这些静态文件。
VitePress 固定为 `2.0.0-alpha.20`，与当前 Vite 8 配套；这是上游预览版，后续升级需重新验证文档构建。
2026-10-05 核对 npm dist-tags 与 [VitePress 官方文档](https://vitepress.dev/guide/getting-started)：`next` 和官网均为 `2.0.0-alpha.20`，`latest` 稳定标签为 `1.6.4`。本仓库保留与最新版官网一致的预览版，并验证自定义组件、Vue 类型检查和站点构建。
选择这一版本也避免继续引用被 pnpm 信任策略拒绝的旧 Vite 5 依赖。没有关闭依赖信任检查。

全仓类型检查覆盖旧插件和示例。旧 Mirai 插件通过显式 `mirai: { qq, setting }` 配置连接，
未配置时给出明确错误；NapCat 是框架默认适配器。此次未将所有 Mirai 插件改写为 NapCat 插件。
QQ 遥控应用使用独立的官方协议实现，不加载这些旧插件。

旧模块仍依赖提升的依赖，因此暂时保留 `shamefullyHoist`。新包需完整声明自己的直接依赖。

## npm OIDC 发布

统一 CLI 随 `el-bot` 发布，私有 `apps/qq-codex` 不单独发布。
`.github/workflows/release.yml` 使用 GitHub 托管的 Ubuntu runner，发布步骤通过 npm Trusted Publishing 获取临时凭据，不读取 `NPM_TOKEN`。
只有 `publish` job 拥有 `id-token: write`；构建与测试先完成，发布 job 下载通过验证的 `.tgz`，使用 npm 11.16.0 发布并附带 provenance。
先用 pnpm 打包，将 `catalog:` / `workspace:` 转为可安装的版本；不要在源码目录直接执行 `npm publish`。

### 一次性配置 Trusted Publisher

在 [el-bot 的 npm 设置页](https://www.npmjs.com/package/el-bot/access) 添加 GitHub Actions Trusted Publisher：

| 字段 | 值 |
| --- | --- |
| Organization or user | `YunYouJun` |
| Repository | `el-bot` |
| Workflow filename | `release.yml`，不要填写目录 |
| Environment | 留空，当前 job 未设置 environment |
| Allowed actions | 允许 `npm publish`，不能只允许 staged publishing |

也可以使用 npm CLI 11.15+，登录后先查看已有配置，避免重复创建：

```bash
npm login --registry=https://registry.npmjs.org
npm trust list el-bot
# 仅在没有匹配配置时添加；按 npm 提示完成账户 2FA
npm trust github el-bot --repo YunYouJun/el-bot --file release.yml --allow-publish
```

配置以 npm 账户权限为准；GitHub 已登录不能代替 npm 登录。
确认一次真实 OIDC 发布成功后，再处理不再使用的旧发布令牌。
当前工作流不依赖令牌，但不会替你删除其他项目可能仍在使用的凭据。

2026-10-05 已在 npm 页面确认保存 `YunYouJun/el-bot` → `release.yml` 的 Trusted Publisher，允许 `npm publish`，Environment 留空。
授权配置已完成。标签触发后的实际结果以 [Release 工作流](https://github.com/YunYouJun/el-bot/actions/workflows/release.yml) 和 npm 对应版本的来源证明为准。

### 每次发布

1. 提交并推送本次代码，确保默认分支 `dev` 的 CI 通过，且工作区干净。
2. 运行 `pnpm release`，在交互中选择尚未发布的版本；该命令只更新 `packages/el-bot/package.json`，生成 Conventional Commit、`v<版本>` 标签并推送。
3. 标签触发工作流：校验标签与包版本一致、确认 npm 不存在该版本，然后执行 lint、构建、类型检查、测试、文档构建和安装包测试。
4. prerelease 版本（例如 `1.0.0-rc.1`）发布到 `next`，正式版本发布到 `latest`；npm 发布成功后生成 GitHub Release。

本次版本为 `1.0.0-rc.1`，对应标签 `v1.0.0-rc.1` 和 npm `next`。已存在的 npm 版本不能覆盖，后续发布须选择新版本。
若其他包后续需要独立发布，应分别配置 Trusted Publisher 和版本流程；当前工作流只发布 `el-bot`。

本地可检查安装包，但不能证明 GitHub OIDC 已获 npm 授权：

```bash
pnpm --filter el-bot pack --pack-destination ./dist
pnpm test:cli dist/el-bot-<版本>.tgz
npm publish ./dist/el-bot-<版本>.tgz --dry-run --access public --tag next --ignore-scripts
```

只有真实 GitHub Actions 发布成功，并能在 registry 查询新版本，才算发布链路验证完成。
参考：[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)、[npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/)。

### 旧依赖的已知限制

库与 Nest 入口编译为 ESM，并在真实安装后的消费者项目中执行导入和严格 TypeScript 检查。
`mirai-ts@2.4.8` 的导出路径与 tarball 不一致，NapCat 的 ESM 产物缺少 JSON import attribute，构建时将这两项运行代码打包以兼容普通 Node.js。
发布包同时携带公开声明所需的 `@types/ws`、`@types/node-schedule`，并按上游 Axios 定义补充 `resty-client@0.0.5` 漏发的两个类型；不关闭消费者类型检查。

本次升级固定了旧依赖链中可兼容升级的 `form-data`、`qs` 和 `js-yaml` 修复版。工作区的旧 `plugins/feeder` 仍使用停止维护的 `rss-feed-emitter` / `request`，存在 `request`、`tough-cookie`、`uuid` 上游告警；该插件不包含在本次 `el-bot` 发布包中。
旧框架的文件匹配依赖 `fast-glob` / `micromatch`，其 `braces` 依赖仍有[深层模式导致栈耗尽的告警](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，截至本次发布没有上游修复版。勿将不可信输入直接用作文件匹配模式。Codex 遥控入口不使用该匹配链路；本次发布并不声明整个旧框架已清除全部审计告警。

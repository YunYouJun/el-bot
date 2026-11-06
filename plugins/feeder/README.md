# feeder

在工作区根目录运行 `pnpm install` 安装依赖。插件使用 `rss-feed-emitter` 4 的原生 ESM 与 Node.js `fetch`，不再依赖已停止维护的 `request`。运行环境沿用工作区要求（Node.js 22.18+，或受支持的 24／26 系列）。

工作区通过 `patches/rss-feed-emitter@4.0.0.patch` 修复上游首次加载标记未复位的问题，避免 `skipFirstLoad` 同时屏蔽后续更新，并保留首次请求失败后的重试语义；升级该库时应重新验证并尝试移除此补丁。

订阅仍保留跳过首次加载、按订阅事件分发、去重和移除订阅的行为。回归测试通过本地 HTTP RSS 源验证，不建立 QQ 或数据库连接：

```sh
pnpm exec vitest run plugins/feeder/src/emitter.test.ts
```

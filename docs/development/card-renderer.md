# Markdown 图片渲染模块

图片卡片使用 **markdown-it + Shiki + 本地 HTML/CSS + Playwright**。解析与语法高亮复用社区库，卡片模板由项目维护，字体测量、换行和表格布局交给 Chromium。

先体验 [站点卡片示例](/codex/card-renderer)：结果、代码、表格、命令帮助各有浅色和深色版本，支持查看和复制源码。示例在文档构建时由同一个渲染模块生成，不另写一套展示样式。

## 为什么使用这个组合

[markdown-it](https://github.com/markdown-it/markdown-it) 负责 Markdown 解析，[Shiki](https://shiki.style/) 负责代码着色，[Playwright](https://playwright.dev/docs/screenshots) 截取卡片元素为 PNG。项目只维护显示内容、HTML 模板和 CSS，避免自行估算文字宽度或模拟浏览器布局。

[mdimg](https://github.com/LolipopJ/mdimg) 和 [node-html-to-image](https://github.com/frinyvonnick/node-html-to-image) 也能完成浏览器截图。本项目直接使用 Playwright，以便控制上下文隔离、外部请求、浏览器复用及图片限制，无需增加一层转图封装。

图片模式需要安装匹配版本的 Chromium；运行时使用本机字体，也可嵌入指定的本地字体文件。不需要本地 HTTP 服务，不在回复过程中自动下载浏览器。

## 云乐坊设计统一

图片卡片与桌面客户端共用 [YunLeFun/design](https://github.com/YunLeFun/design) 的 `@yunlefun/ui` 设计基础。`styles.ts` 读取已安装包的 `@yunlefun/ui/css`，将主题变量内联进 HTML；不复制颜色数值，不从 CDN 加载样式或字体。应用包与公开 CLI 包均声明这项运行时依赖，版本在 workspace catalog 中维护。

- 使用 `.ylf-theme-light` / `.ylf-theme-dark` 切换晴空、夜空主题；正文、内容表面、凹槽和边框引用 `--ylf-c-*`。
- 标题、正文和代码分别使用 `--ylf-font-heading`、`--ylf-font-body`、`--ylf-font-mono`。自定义 `fontFamily` 或 `fontFiles` 同时覆盖正文与标题，代码保持等宽。
- 静态 HTML 适配 `YlfCard` 的 `accent / blue` 表面：20px 圆角、1px 中性边框、3px 晴空蓝顶边和表面阴影，关闭悬停效果。外观规则对照已发布的 `YlfCard.vue`；图片模板仍负责内容布局，不在截图中运行 Vue。
- 字号按共享角色成比例适配聊天图片：标题用 `xl`、正文用 `base`、辅助信息用 `sm`、页脚用 `xs`。720px 截图放大 1.5 倍，小屏预览放大 1.25 倍，保持相同的层级比例；间距和阅读宽度引用共享 token。
- 成功、提醒、错误分别使用共享语义色，仅在任务标题旁显示小标记；状态含义同时由标题文字表达。内容小节使用晴空蓝，正文保持中性色。
- 站点的类型和主题选择复用 `YlfSegmentedControl`，复制按钮复用 `YlfButton`。这些 Vue 控件只进入文档站，机器人截图仍由无脚本 HTML 渲染。

基础样式升级时重新生成示例，检查两种主题、长中文、代码、表格和手机视口；代码的语法颜色仍由 Shiki 主题负责。

## 安装与验证

已安装 el-bot CLI：

```bash
el-bot codex browser-install
el-bot codex render --card result --theme dark --text-file ./result.md --output ./result.png
```

从源码运行：

```bash
pnpm install
pnpm cli codex browser-install
pnpm cli codex render --card result --theme dark --text-file ./result.md --output ./result.png
```

`browser-install` 使用当前 el-bot 依赖的 Playwright 安装器，不需要猜测匹配的浏览器版本。Linux 缺少系统依赖时可加 `--with-deps`，此选项可能需要管理员权限。浏览器二进制保存在 Playwright 缓存中；未安装或无法启动时，渲染会给出安装提示。官方说明见 [浏览器与系统依赖](https://playwright.dev/docs/browsers)。

图片展示、字体配置和消息回退见 [QQ 遥控：图片卡片与本地预览](/development/codex-remote#图片卡片与本地预览)。

## 模块职责

模块位于 `apps/qq-codex/src/card-renderer/`，不依赖 QQ SDK、机器人配置或任务状态。

| 文件 | 职责 |
| --- | --- |
| `index.ts`、`types.ts` | 显示内容、主题 / 字体选项及 HTML / PNG 接口 |
| `html.ts`、`styles.ts` | 固定卡片模板、内联云乐坊设计变量和共用 CSS |
| `markdown.ts` | Markdown 转为受控 HTML；链接、图片保持为文字 |
| `highlight.ts` | 使用随程序打包的语法和主题，为代码着色 |
| `browser.ts` | 浏览器复用、隔离上下文、本地字体、尺寸检查和 PNG 截图 |
| `examples.ts` | 站点示例数据；由 `scripts/build-card-examples.ts` 生成静态 HTML |

QQ 应用的 `image.ts` 检查 `ReplyCard`，将 `visual` 显示内容交给模块。业务分页、上传、临时托管和发送回退仍分别由 `cards.ts`、`image-upload.ts`、`image-store.ts`、`reply.ts` 负责。模块不写文件、不上传、不修改输入。

当前保持为应用内模块，依赖声明在应用包中；公开 CLI 包另外声明 Playwright 运行时依赖，构建时不将浏览器驱动打入单文件。出现第二个应用消费者时，可迁移到 `packages/*`。

## 调用接口

在 `apps/qq-codex/src/` 内调用：

```ts
import type { ImageCard } from './card-renderer'
import { writeFile } from 'node:fs/promises'
import { closeCardRenderer, renderCardHtml, renderCardImage } from './card-renderer'

const content: ImageCard = {
  title: '任务已完成',
  tone: 'success',
  details: {
    fields: [{ label: '项目', value: 'el-bot' }],
    body: '**完成**\n\n```ts\nconst answer = 42\n```',
    bodyFormat: 'markdown',
    footnote: '/help 帮助',
  },
}

// 同一文档也可以用于本地预览或站点示例。
const html = renderCardHtml(content, { theme: 'dark' })
await writeFile('/tmp/card.html', html)

try {
  const image = await renderCardImage(content, { theme: 'dark' })
  await writeFile('/tmp/card.png', image.png)
}
finally {
  await closeCardRenderer()
}
```

`renderCardHtml` 同步返回完整 HTML 文档；`renderCardImage` 异步返回 `{ png: Buffer, width, height }`。连续渲染复用一个浏览器，以有上限的串行队列处理请求，每次建立独立上下文并在截图后关闭。浏览器空闲 30 秒后释放；一次性 CLI 和机器人关闭时调用 `closeCardRenderer`，等待队列结束并关闭浏览器。

`theme` 选择浅色或深色，`fontFamily` 指定本机字体族。`fontFiles` 最多接受八个本地 TTF、OTF、WOFF、WOFF2 文件，每个不超过 32 MiB；文件嵌为字体数据后等待加载完成再截图。

## 内容与运行限制

- 显式设置 `bodyFormat: 'markdown'` 才解析正文，否则按原文绘制。支持加粗、斜体、删除线、行内代码、代码块、标题、列表、引用、分隔线和表格。
- 代码围栏语言标记决定高亮语法，例如 `ts`、`js`、`tsx`、`jsx`、`json`、`jsonc`、`bash`、`python`、`yaml`、`html`、`css`、`vue`、`sql`、`go`、`rust`、`java`、`csharp`、`cpp`，并支持常用别名。未知或未标记语言、高亮失败时保留等宽原文。
- 模型输出的 HTML 转义显示；Markdown 链接绘制为下划线文字，图片仅显示说明。固定文档使用 CSP，截图上下文禁用页面脚本、服务工作线程及网络请求，不读取正文中的本地路径或外部资源。
- PNG 宽 720 像素、最高 4000 像素、最大 2 MiB；显示内容总长度最多 12000 个 JavaScript 字符串单元。浏览器启动、文档加载及截图有超时限制，最多排队八张卡片。
- 模块只渲染传入的一页，不负责拆分长文，也不重建跨页 Markdown 围栏。QQ 应用保留既有分页、文字与原生 Markdown 回退；渲染或上传失败由发送层处理。
- 站点示例在浏览器中直接显示 HTML；小屏通过 CSS 调整字号与间距，截图始终使用 720 像素视口。字体随主机变化，站点预览不保证与另一台主机的 PNG 逐像素一致。

修改后运行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm --filter el-bot build`、`pnpm docs:build`。渲染验证不连接真实机器人，也不运行模型任务。

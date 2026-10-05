# QQ 遥控 Codex

此目录是私有工作区实现模块，命令注册到 `el-bot codex`，随 `el-bot` 包构建和发布。

通过 QQ 官方机器人私聊，遥控自己电脑上的 Codex。支持本人绑定、项目白名单、会话续聊、逐次审批、停止任务和结果查询。
默认发送帮助、项目选择、任务状态 / 结果 Markdown 卡片与操作按钮，支持翻页、点选项目、刷新、停止和单次审批。QQ 明确拒绝富文本格式时自动回退，配置 `messageFormat: "text"` 可固定使用纯文本。

## 快速开始

需要 Node.js 22.18+（推荐 Node.js 24）、已登录的 Codex CLI，以及 QQ 官方机器人 AppID / AppSecret。
安装 `el-bot` 的新构建后运行：

```bash
pnpm add -g el-bot@next
el-bot codex init --project /absolute/path/to/project --name project
el-bot codex check --all
el-bot codex start
```

`init` 使用隐藏输入读取 AppSecret，默认配置与状态存放在 `~/.el-bot`，不会覆盖已有文件。
在 QQ 平台启用 WebSocket 并配置出口 IP 白名单；启动后把终端的 `/pair ...` 绑定码私聊发给机器人。

- `init --no-prompt`：适用于脚本；读取环境变量或创建空白凭据模板。
- `check`：只检查本机 Codex；`check --qq` 检查 QQ；`check --all` 检查两者，不发送消息或启动任务。
- `paths`：查看实际使用的配置、凭据和状态路径。
- `--profile personal`：隔离配置、凭据、状态与 Codex 目录；独立目录须先登录，见[实例文档](../../docs/codex/instances.md)。
- `recover --project 名称`：停止服务后备份状态，重置对应项目续聊索引，保留主人和历史，不重放任务。
- `--config`、`--credentials`、`--state`：为所有命令指定文件路径。
- `el-bot codex --help`、`el-bot --version`：命令帮助和版本。

凭据支持 `QQ_BOT_APP_ID` 与 `QQ_BOT_SECRET` 环境变量；原 `QQ_BOT_APP_SECRET` 仍兼容。
在 QQ 中发送 `/help` 或 `/menu` 查看分组帮助和快捷按钮；`/?` 或单独发送「帮助」「菜单」也可打开。
`/help 2` 查看项目与会话，`/help 3` 查看审批与回答；`/projects [页码]` 点选项目。
任务卡片上可随时打开「帮助菜单」；「输入任务」仅填写草稿，「新建会话」先确认，历史结果保留。
帮助卡片提供「文档站点」「使用帮助」跳转按钮，正文另含 AI 接入指南；无按钮权限时保留文字网址。
Codex 帮助、AI 接入、实例恢复与 Desktop 管理文档提供完整配置步骤；五类帮助可直接在 QQ 查看。图片模式每页最多四条命令，命令、参数、说明分开排版；`/help 1 2` 查看第一类的第二页。
仍可手动发送 `/project 名称`、`/status`、`/stop` 或直接发送任务。
不要把凭据文件或状态放在公开仓库中。服务需持续运行，不会自动设置开机启动。

完整文档：[QQ 遥控 Codex](https://docs.bot.elpsy.cn/development/codex-remote)。

版本 API 目录、共享 app-server 与桌面 MCP 管理见 [Codex Desktop 接入](../../docs/codex/desktop.md)。
`el-bot codex api --experimental` 只生成本机协议；`desktop-init` 配置真实宿主管道与专用聊天，`desktop-check` 只读验证目录与项目列表。
管理写操作在 QQ 中先 `/inspect ID` 查看全部页，再 `/confirm ID`，不会自动重放。

图片卡片支持浅色 / 深色 PNG 和原生操作按钮。运行 `el-bot codex render --card result --theme dark --output ./result.png` 本地预览；帮助预览可用 `--card help --page 1 --part 2` 指定分类与页码。
配置 `messageFormat: "image"` 后默认将本地 PNG 直接上传到 QQ，以富媒体图片和紧随其后的操作卡片展示，不需要自建公网图片入口；`image.theme` 可设为 `dark`。每张通常占用两次被动回复，预算不足时使用 Markdown；审批详情始终保留可复制的 Markdown。可选的公网托管模式与限制见[图片卡片](../../docs/development/codex-remote.md#图片卡片与本地预览)。
`/thread use ID` 绑定当前项目已有会话，`/thread fork` 复制历史；`/review` 审查代码，`/steer` 补充当前任务要求，沿用单任务与逐次审批机制。

AI 助手接入见[可复制提示词](../../docs/codex/ai-setup.md)，功能展示见[示例对话](../../docs/codex/index.md)。
非交互配置使用 `el-bot codex init --project ... --no-prompt`；先检查 CLI 是否支持子命令，
由用户在本机填写密钥、登录平台并完成私聊绑定。此版本为 `1.0.0-beta.17`，也支持以下源码打包方式。

## 从源码打包

```bash
pnpm install
pnpm build
pnpm test:cli
pnpm --filter el-bot pack --pack-destination ./dist
pnpm add -g ./dist/el-bot-1.0.0-beta.17.tgz
```

Codex 命令打包进 `el-bot` 的 Node.js 入口；私有应用模块不单独发布，不包含个人凭据或状态，无需分别安装工作区 SDK。
源码环境继续支持 `pnpm qq:codex` 和旧的 `--check` / `--check-qq` 参数。

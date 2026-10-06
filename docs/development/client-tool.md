# 本机机器人客户端

el-bot 使用一个 Tauri 2 + Vue 3 应用，同时提供完整控制台窗口和系统菜单栏／托盘入口。macOS 菜单栏使用系统原生菜单，通过同一个应用启动、停止和重启机器人，也可以打开日志、连接设置。每个操作系统和 CPU 架构提供对应的安装包，无需额外安装菜单栏工具。

## 日常使用

在「连接设置」中填写 Node、el-bot CLI、机器人配置、凭据和状态文件的完整路径。设置保存在 `~/.el-bot/client.json`，只有路径，不保存凭据值。每次操作都会重新读取设置。

- 点击「启动机器人」后，后台进程独立运行。关窗后客户端驻留菜单栏／托盘；macOS 关窗后隐藏 Dock 图标，再次打开窗口时恢复。
- 从菜单栏／托盘或应用图标打开控制台，重复打开只唤起已有客户端实例。「退出客户端（机器人继续运行）」退出界面，后台机器人仍然运行。
- 菜单栏／托盘的启停入口复用窗口中的操作逻辑；有任务时打开确认界面，不会默认中断。
- 空闲时「停止」正常关闭连接、保存状态、释放锁；重复停止返回已停止。
- 有任务或管理操作时，普通停止被拒绝。界面允许明确选择「中断并停止／重启」，也可以继续运行，等待完成后再操作。已经产生的工作区修改不会撤销。
- 重启先等待旧实例清理完成并释放状态锁，再启动新实例。任务不会自动重放。
- 状态区分别显示 QQ 连接、Codex 可用性与任务状态。HTTP 回调只显示「回调已监听」，不宣称公网 QQ 回调已验证。
- 日志展示状态文件旁 `.log` 的最近约 32 KB；前台启动的日志仍在原终端。启动失败时在日志中查看原因。

首次绑定仍沿用 `/pair`，未绑定实例的配对码写入本机私有日志。客户端不修改主人绑定、项目白名单、持久去重、单任务准入或审批规则。

## 图片展示与本机程序

在「连接设置 → QQ 回复展示」选择 **展示图片卡片**、**Markdown 卡片（不展示图片）** 或 **纯文本（不展示图片）**。图片卡片支持浅色／深色主题。保存只修改当前机器人配置的 `messageFormat` 和 `image.theme`，保留其他配置、凭据与会话；正在运行时提示等待任务完成后重启，不自动中断。

「机器人」页面和菜单栏／托盘提供 **打开 Codex**、**打开 QQ**，在客户端所在电脑启动或唤起已安装应用。macOS 默认按应用标识 `com.openai.codex` / `com.tencent.qq` 查找安装位置，不依赖应用文件名；也可在连接设置填写完整 `.app` 路径覆盖。Windows 填写完整 `.exe` 路径，Linux 填写完整可执行文件路径。留空时 Windows／Linux 会提示先配置路径。新路径保存在 `~/.el-bot/client.json`，旧版路径配置仍可读取。

这是本机按钮，QQ 卡片和聊天命令不会启动任意程序，也不接受 shell 命令、网址或运行参数。打开应用不等于完成 Codex 登录、QQ 登录或机器人连接。当前本机启动验证为 macOS；其他桌面平台仍需对应实机验收。

以上客户端设置与 `preferences` 命令要求 `el-bot@1.0.0-rc.3` 或更高版本。需要使用对应版本的 CLI，旧版 CLI 会提示不支持该命令。

## CLI 控制

```sh
el-bot codex start --background --json
el-bot codex status --json
el-bot codex stop --json
el-bot codex stop --interrupt --json
el-bot codex restart --json
el-bot codex logs --json
el-bot codex preferences --json
el-bot codex preferences --message-format image --image-theme dark --json
el-bot codex preferences --message-format markdown --json
```

这些命令支持现有 `--profile`、`--config`、`--credentials`、`--state` 参数。客户端首版使用显式文件路径；使用 profile 的实例，配置中的 `codexHome` 需与已有实例身份一致。前台 `el-bot codex start` 行为保留。结构化命令返回 `{ "ok": true, "result": ... }` 或 `{ "ok": false, "error": ... }`，失败退出码为 1。

后台启动使用当前 CLI 的 Node 和入口文件，凭据值不会放入进程参数。Node 需要满足仓库支持版本，另外需要已安装并登录的 Codex CLI。

## 安全停止与旧实例

主进程持有原状态锁，发布私有控制信息和随机令牌；客户端必须匹配状态锁、控制通道与启动实例才能发送请求。macOS/Linux 使用当前用户私有目录中的 Unix socket；Windows 使用命名管道和随机令牌。控制状态不包含凭据、主人 ID、提示词或任务输出。

关闭处理在启动早期注册，重复请求等待同一个清理结果。关闭开始后不再接收新任务；初始化逐步检查退出状态。即使部分清理步骤失败，其余连接关闭和锁释放仍会执行，调用方收到失败结果。

旧版本没有控制通道时显示「暂不可管理」。请在原终端按 Ctrl+C 正常退出一次，再用新版客户端启动。客户端不会通过 PID 猜测身份、强杀机器人主进程或自动删除残留锁。异常残留锁需要人工核验旧进程已经不存在后处理。

清理超时会报告错误，不能当成「已停止」；重新查询状态和日志确认。由服务自身启动的 Codex 子进程仍沿用既有退出超时策略。

## 构建和分发

品牌图标按 [YunLeFun/icons 规范](https://github.com/YunLeFun/icons/blob/main/docs/guide/contributing.md)分为透明主体 `el-bot-mark` 和满幅无圆角的 `el-bot-app-icon`。`assets/brand/el-bot-mark.svg` 是唯一手工维护的图形源；界面、文档、PNG、ICO、ICNS 和 macOS 菜单栏模板从同一主体生成。平台圆角只在 macOS ICNS 导出阶段应用一次，菜单栏使用单色模板适配明暗外观。

修改图形后执行 `pnpm icons:generate`，用 `pnpm icons:check` 验证所有派生资产与源一致。客户端开发和安装包构建会自动生成图标。变体元数据与上游来源记录在 `assets/brand/metadata.json`；两个变体已登记到 [YunLeFun/icons 源码集合](https://github.com/YunLeFun/icons)，由图标集的 `pnpm icons:collect` 同步，npm 消费需等待后续版本发布。Iconify 名称为 `ylf:el-bot-mark` / `ylf:el-bot-app-icon`，UnoCSS 类名为 `i-ylf-el-bot-mark` / `i-ylf-el-bot-app-icon`。品牌 SVG 与派生图形采用 `assets/brand/LICENSE` 中的 MIT 许可。

```sh
pnpm install
pnpm build
pnpm client:dev        # 开发统一客户端，含菜单栏／托盘
pnpm menubar:dev       # 与 client:dev 相同
pnpm clients:build     # 当前平台的一种安装包
```

构建产物复制到 `dist/clients/`：macOS 为 DMG（另保留同一应用的 `.app` 目录便于本机调试），Windows 为 NSIS `.exe`，Linux 为 AppImage。不同平台需在对应构建环境中生成；当前已在 Apple Silicon macOS 验证。客户端 macOS 版要求 macOS 13+，构建需要 Rust 与对应平台工具链。

首版客户端连接本机安装的 Node、Codex 与 el-bot CLI，**没有内置这些运行时**。统一安装包解决菜单栏和控制台的重复安装；新机器仍需准备机器人运行环境。需要独立安装 CLI 时，执行 `pnpm -C packages/el-bot pack --pack-destination ../../dist`，再把 `el-bot-*.tgz` 安装到独立目录，例如 `~/.el-bot/client-runtime`，在设置中选择该目录的 `node_modules/el-bot/dist/cli.mjs`。不要将配置、凭据或状态文件放入应用安装包。

### CI 打包与发布

`.github/workflows/desktop.yml` 是可复用的原生打包流程，普通 CI 与标签发布均调用它，也可从 Actions 手动触发。流程使用冻结的 pnpm/Cargo 锁文件，验证图标、前端构建和 Rust 测试，再生成安装包。

| 构建环境 | 架构 | 安装包 |
| --- | --- | --- |
| macOS 15 | arm64 | DMG |
| macOS 15 Intel | x64 | DMG |
| Windows Server 2022 | x64 | NSIS `.exe` |
| Ubuntu 22.04 | x64 / arm64 | AppImage、Debian `.deb` |

安装包名称包含客户端版本、平台与架构，每个平台生成 `SHA256SUMS-<平台架构>.txt`。CI 将它们保留为 7 天的 workflow artifacts；`v*` 标签发布先等待原生打包和 npm 安装兼容性验证通过，再通过 OIDC 发布 npm，并将同一批客户端安装包附到 GitHub Release。客户端版本为 `0.1.0`，独立于 el-bot npm 版本；发布内容会注明两者的运行环境要求。

macOS 预览包使用 ad-hoc 签名，没有开发者证书签名和 Apple 公证；Windows 预览包尚未配置发布者证书。正式分发需补齐对应证书与公证，Release 会明确说明当前签名状态。本机 `pnpm clients:build` 仍只生成本机安装包。

配置依据：[Tauri 官方 GitHub Actions 指南](https://v2.tauri.app/distribute/pipelines/github/)。

## 云乐坊设计体系

客户端使用 [YunLeFun/design](https://github.com/YunLeFun/design) 的 `@yunlefun/ui@0.0.6` 共享 token，以及已发布的 `@yunlefun/vue@0.4.2` 按钮、卡片、选择器和对话框。颜色、字体、间距、圆角与表面来自 `--ylf-*`；窗口跟随系统浅色／深色主题，菜单栏／托盘继续使用平台原生菜单。

机器人扩展的权威源码位于 design 仓库：`YlfAgentStatus` 展示连接状态，`YlfAgentCard` 组织概览，`YlfAgentTask` 展示任务标识与状态。它们只负责界面，启停、审批、主人绑定与任务准入由 el-bot 保持原有控制。

新组件尚未发布，先通过 `ylf-agent` Registry 同步源码到 `apps/el-bot-client/src/components/ui/`。副本与类型文件逐字节对应共享源码，保留 MIT 许可和来源哈希。更新时在 design 运行 `pnpm registry:build`，再在 el-bot 运行：

```sh
node scripts/sync-design-agent.mjs /path/to/design
node scripts/sync-design-agent.mjs /path/to/design --check
```

正常安装和构建只依赖 npm 与仓库内源码，不需要本机 design 目录。只有同步或检查权威源码时需要传入目录；请先修改 design 源码再同步，避免维护两套组件。

## 实现与验证

- `apps/qq-codex/src/control.ts`：本机 IPC、身份验证、后台进程与结构化结果。
- `apps/qq-codex/src/lifecycle.ts`：初始化与关闭协调、逐项清理。
- `apps/el-bot-client`：Vue 界面、Rust 系统菜单栏／托盘和有限操作桥接；关窗驻留、重复打开唤起同一实例；无通用 shell 插件，不向远程页面授予控制权限。

自动验证覆盖控制令牌、实例隔离、锁不匹配、任务中停止、重复关闭、清理失败和两个客户端并发启动同一模拟进程。测试不建立 QQ 连接、不启动模型任务。完整仓库测试、lint、typecheck 以及精确 CLI tarball 的安装检查继续保留。

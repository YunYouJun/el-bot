# 云伯特 · Yun Bot

正式客户端已迁移到 **MyGo 0.7.4 + Go 1.27.3 原生 UI**，中文名称为「云伯特」，英文名称为 **Yun Bot**。默认开发、构建、菜单栏和安装包入口均使用 `apps/el-bot-client` 中的 Go 程序。旧 Vue／Tauri 源码保留作对照，仍参与 TypeScript 检查，可通过该包的 `legacy:dev`／`legacy:build` 显式运行。

## 语言与本机安装

侧栏提供「简体中文」「English」，托盘及「显示 → 语言」也可切换。界面、状态和原生菜单即时切换，偏好由 MyGo 保存到系统应用设置，重启后保留。macOS 系统应用名及原生对话框的系统文案在重新打开应用后跟随所选语言；「跟随系统」恢复系统语言。第三方返回的未知错误保留原文。

安装沿用应用标识 `cn.elpsy.elbot.client` 和 `~/.el-bot/client.json`，已有 SSH 主机别名、本机路径和未知设置字段继续保留。语言切换不修改机器人配置。关窗销毁原生窗口、释放界面资源，进程和托盘保持运行；托盘、Dock 或再次打开应用会重建窗口。退出客户端不会停止云端或独立运行的本机机器人。

```sh
pnpm client:dev
pnpm client:build
./script/build_and_run.sh --install-only  # 构建并安装，不自动打开
./script/build_and_run.sh                # 构建、备份旧 Yun Bot.app、安装并打开
```

macOS 安装到 `/Applications/Yun Bot.app`；旧安装包备份到仓库忽略目录 `.el-bot/backups/desktop/`。源码构建需要 Go 和 Xcode Command Line Tools；分层图标需要 Xcode 26+，默认构建不需要 Cargo。旧 Tauri 构建仍需其 Rust 工具链。

## 日常使用

客户端首页现以「快捷操作」为主：打开云端 DSH、本机 QQ 和任务程序；本机机器人状态可展开。路径、QQ 展示和运行日志位于「高级设置」。

「高级设置 → 云端机器人」只填写本机 SSH 配置中已有的主机别名。点击「打开云端 DSH」后，原生模块建立固定 SSH 隧道并在系统浏览器打开云端认证入口；只保存别名，不保存模型密钥或 Web 登录令牌。现有本机 CLI 尚未配置时，也可以单独使用云端入口。该连接目前已按 macOS 验证流程实现，Windows／Linux 的 SSH 复用与默认浏览器仍需实机验证。

云端负责会话、模型、分组和远程执行；桌面继续负责托盘驻留、本机程序、快捷入口和本机权限。远程页面在独立浏览器中运行。部署、迁移与回退见仓库 `apps/dsh-cloud/README.md`。

在「连接设置」中填写 Node、el-bot CLI、机器人配置、凭据和状态文件的完整路径。设置保存在 `~/.el-bot/client.json`，只有路径，不保存凭据值。每次操作都会重新读取设置。

- 点击「启动机器人」后，后台进程独立运行。关窗后客户端驻留菜单栏／托盘；macOS 关窗后释放窗口并隐藏 Dock 图标，再次打开时重建窗口。
- 从菜单栏／托盘或应用图标打开控制台，重复打开只唤起已有客户端实例。「退出客户端（机器人继续运行）」退出界面，后台机器人仍然运行。
- 菜单栏／托盘的启停入口复用窗口中的操作逻辑；有任务时打开确认界面，不会默认中断。
- 空闲时「停止」正常关闭连接、保存状态、释放锁；重复停止返回已停止。
- 有任务或管理操作时，普通停止被拒绝。界面允许明确选择「中断并停止／重启」，也可以继续运行，等待完成后再操作。已经产生的工作区修改不会撤销。
- 重启先等待旧实例清理完成并释放状态锁，再启动新实例。任务不会自动重放。
- 状态区分别显示 QQ 连接、配置选定的任务程序与任务状态。ACP 握手通过显示「已连接」；HTTP 回调显示「回调已监听」，模型与公网 QQ 收发仍需实际验证。
- 日志展示状态文件旁 `.log` 的最近约 32 KB；前台启动的日志仍在原终端。启动失败时在日志中查看原因。

首次绑定仍沿用 `/pair`，未绑定实例的配对码写入本机私有日志。客户端不修改主人绑定、项目白名单、持久去重、单任务准入或审批规则。

## 图片展示与本机程序

在「连接设置 → QQ 回复展示」选择 **展示图片卡片**、**Markdown 卡片（不展示图片）** 或 **纯文本（不展示图片）**。图片卡片支持浅色／深色主题。保存只修改当前机器人配置的 `messageFormat` 和 `image.theme`，保留其他配置、凭据与会话；正在运行时提示等待任务完成后重启，不自动中断。

「机器人」页面和菜单栏／托盘提供 **打开 Codex**、**打开 CodeBuddy**、**打开 dsh**、**打开 QQ**，在客户端所在电脑启动或唤起已安装应用。macOS 默认按应用标识 `com.openai.codex` / `com.tencent.codebuddycn` / `com.deepseek.dsh`（兼容 `dsh-tauri`） / `com.tencent.qq` 查找安装位置；CodeBuddy 默认查找中国版，其他版本可在连接设置填写完整 `.app` 路径覆盖。Windows 填写完整 `.exe` 路径，Linux 填写完整可执行文件路径。留空时 Windows／Linux 会提示先配置路径。新路径保存在 `~/.el-bot/client.json`，旧版路径配置仍可读取。

机器人配置中的 `agent` 选择 Codex、CodeBuddy 或 dsh 任务程序，状态区显示对应名称。打开程序的路径与任务 CLI 的 `agentExecutable` 分别配置，保存应用路径不会改变任务程序。客户端复用同一套启停入口，CodeBuddy / dsh 接入见[程序接入指南](/codex/agents)。

这些按钮仅用于本机操作，QQ 卡片和聊天命令不会启动任意程序，也不接受 shell 命令、网址或运行参数。打开应用后仍需完成相应账户配置、QQ 登录或机器人连接。当前本机启动验证为 macOS；其他桌面平台仍需对应实机验收。

以上客户端设置、`preferences` 与 ACP 支持需要包含相应功能的新构建。源码包版本不代表已经发布到 npm；先检查所配置 CLI 的版本与 `agent --help`，旧版缺少入口时使用当前源码构建的安装包。

## 人物卡

侧栏「人物卡」显示已连接云端机器人的人设摘要，支持快捷切换和恢复默认人设；「前往 Web 管理人物卡」打开 DSH 插件面板，集中提供本地文件上传、HTTPS 原文、Git 指定文件导入、小云示例、完整预览和历史版本回滚。两端操作远端同一份库。切换后下一次 QQ 任务准入开始新会话，正在执行的任务继续完成；导入与更新不会自动启用。详见[人物卡指南](/development/personas)。

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

这些命令也支持 `el-bot agent` 前缀与现有 `--profile`、`--config`、`--credentials`、`--state` 参数。客户端使用显式文件路径：填入 `paths` 返回的配置、凭据、状态，Codex 的 `codexHome` 须与原实例身份一致，ACP 不添加此字段。前台 `el-bot codex start` 行为保留。结构化命令返回 `{ "ok": true, "result": ... }` 或 `{ "ok": false, "error": ... }`，失败退出码为 1。

后台启动使用当前 CLI 的 Node 和入口文件，凭据值不会放入进程参数。Node 需要满足仓库支持版本，另外需要安装所选程序的 CLI，并完成相应账户 / 提供方配置；GUI 环境找不到 CLI 时，在机器人配置中填写 `agentExecutable`。

## 安全停止与旧实例

主进程持有原状态锁，发布私有控制信息和随机令牌；客户端必须匹配状态锁、控制通道与启动实例才能发送请求。macOS/Linux 使用当前用户私有目录中的 Unix socket；Windows 使用命名管道和随机令牌。控制状态不包含凭据、主人 ID、提示词或任务输出。

关闭处理在启动早期注册，重复请求等待同一个清理结果。关闭开始后不再接收新任务；初始化逐步检查退出状态。即使部分清理步骤失败，其余连接关闭和锁释放仍会执行，调用方收到失败结果。

旧版本没有控制通道时显示「暂不可管理」。请在原终端按 Ctrl+C 正常退出一次，再用新版客户端启动。客户端不会通过 PID 猜测身份、强杀机器人主进程或自动删除残留锁。异常残留锁需要人工核验旧进程已经不存在后处理。

清理超时会报告错误，不能当成「已停止」；重新查询状态和日志确认。任务取消与停止确认按所选程序的协议处理，见[能力对比](/codex/agents#能力对比)。

## 构建和分发

客户端侧栏与机器人状态卡使用 `BotMascot.vue` 三弧云朵角色，支持鼠标跟随、轻微转头和眨眼；窗口失焦、隐藏或开启“减少动态效果”时静止。状态卡根据真实任务状态显示思考、完成与异常表情。

品牌图标按 [YunLeFun/icons 规范](https://github.com/YunLeFun/icons/blob/main/docs/guide/contributing.md)分为透明主体 `el-bot-mark` 和满幅无圆角的 `el-bot-app-icon`。原有 `assets/brand/el-bot-mark.svg` 保持不变，继续用于文档 logo；`assets/brand/el-bot-cloud.svg` 是客户端角色、应用 SVG、PNG、ICO、ICNS、Icon Composer 分层源和 macOS 菜单栏模板共用的云朵源。默认正面主体宽度为 72%，静态图标的圆角只在 macOS ICNS 导出阶段应用一次，菜单栏使用单色模板适配明暗外观。

macOS 26 及以上使用生成的 `apps/el-bot-client/src-tauri/icons/ElBot.icon` 分层图标：品牌蓝底板和透明云朵矢量前景分离，主体保持背景宽度的 72%，由系统处理 Liquid Glass 高光、折射、圆角和外观适配。MyGo 根据 `mygo.json` 的 `macos.icon` 调用 Xcode 编译此资源，将 `Assets.car` 放入应用并设置 `CFBundleIconName`；同时携带原有的 `icon.icns` 作为静态回退。旧系统保留最高 1024 × 1024 的静态 ICNS 回退，`macos-icon.png` 仍是该静态版本的预览。Windows / Linux 图标和独立品牌 mark 不受分层材质影响。原生分层规范见 Apple 的[应用图标指南](https://developer.apple.com/design/human-interface-guidelines/app-icons)。

macOS 打包 CI 使用 `macos-26` / `macos-26-intel`，并通过 `apps/el-bot-client/scripts/check-macos-icon.mjs` 检查实际 `.app` 中的默认、深色、着色图层及原生高光，避免工具链缺失时仅带静态图标。该脚本也可手动运行，参数为打包后的 `.app` 路径。

修改图形后执行 `pnpm icons:generate`，用 `pnpm icons:check` 验证所有派生资产与源一致。客户端开发和安装包构建会自动生成图标。变体元数据与上游来源记录在 `assets/brand/metadata.json`；两个变体已登记到 [YunLeFun/icons 源码集合](https://github.com/YunLeFun/icons)，由图标集的 `pnpm icons:collect` 同步，npm 消费需等待后续版本发布。Iconify 名称为 `ylf:el-bot-mark` / `ylf:el-bot-app-icon`，UnoCSS 类名为 `i-ylf-el-bot-mark` / `i-ylf-el-bot-app-icon`。品牌 SVG 与派生图形采用 `assets/brand/LICENSE` 中的 MIT 许可。

默认 `pnpm client:build` 生成 `apps/el-bot-client/build/<GOOS>-<GOARCH>/` 下的原生应用和当前平台安装包。`pnpm clients:build` 进一步收集安装包与 SHA-256 到 `dist/desktop-<平台架构>/`。macOS 为 `.app`／DMG，Windows 为 NSIS，Linux 为 `.deb`／带安装脚本的 `.tar.gz`。不同平台的交叉编译不能替代对应系统的真实 UI 验收。

客户端没有内置 Node、任务程序或 el-bot CLI。只有使用本机机器人时才需要这些运行时；云端入口可以独立使用。配置、凭据或状态文件不会进入应用安装包。

### CI 打包与发布

`.github/workflows/desktop.yml` 是可复用的原生打包流程，普通 CI 与标签发布均调用它，也可从 Actions 手动触发。流程使用冻结的 pnpm 锁文件和 Go 模块校验和，验证图标、Go 测试、原生构建及保留的 Vue 类型检查，再生成安装包。

| 构建环境 | 架构 | 安装包 |
| --- | --- | --- |
| macOS 26 | arm64 | DMG |
| macOS 26 Intel | x64 | DMG |
| Windows Server 2022 | x64 | NSIS `.exe` |
| Ubuntu 22.04 | x64 / arm64 | `.tar.gz`、Debian `.deb` |

安装包名称包含客户端版本、平台与架构，每个平台生成 `SHA256SUMS-<平台架构>.txt`。CI 将它们保留为 7 天的 workflow artifacts；`v*` 标签发布先等待原生打包和 npm 安装兼容性验证通过，再通过 OIDC 发布 npm，并将同一批客户端安装包附到 GitHub Release。客户端版本为 `0.1.0`，独立于 el-bot npm 版本；发布内容会注明两者的运行环境要求。

macOS 预览包使用 ad-hoc 签名，没有开发者证书签名和 Apple 公证；Windows 预览包尚未配置发布者证书。正式分发需补齐对应证书与公证，Release 会明确说明当前签名状态。本机 `pnpm clients:build` 仍只生成本机安装包。

桌面 API 与国际化依据：[MyGo 官方文档](https://mygo.egoist.dev/docs/native)。旧 Tauri 构建作为显式对照入口保留。

## 云乐坊设计体系

原生客户端复用 el-bot 品牌图形与分层应用图标，在 Go 主题中映射云乐坊的蓝色、表面、间距和字体语义，跟随系统深浅色。完整人物卡管理留在 DSH Web，桌面只提供摘要、快捷选择与管理入口。

旧 Vue 对照界面继续保留 `@yunlefun/ui`、`@yunlefun/vue` 和已同步的 `YlfAgent*` 组件，源码与许可不因宿主迁移而删除；它们不进入 MyGo 原生运行时。需要继续同步旧组件时，仍使用 `scripts/sync-design-agent.mjs`。

## 实现与验证

- `apps/qq-codex/src/control.ts`：本机 IPC、身份验证、后台进程与结构化结果。
- `apps/qq-codex/src/lifecycle.ts`：初始化与关闭协调、逐项清理。
- `apps/el-bot-client`：Go 原生界面、系统菜单栏／托盘、双语目录及有限命令适配；关闭窗口驻留、重复打开唤起同一实例。只允许固定 CLI 操作、本机应用和云端部署命令。

自动验证覆盖控制令牌、实例隔离、锁不匹配、任务中停止、重复关闭、清理失败和两个客户端并发启动同一模拟进程。测试不建立 QQ 连接、不启动模型任务。完整仓库测试、lint、typecheck 以及精确 CLI tarball 的安装检查继续保留。

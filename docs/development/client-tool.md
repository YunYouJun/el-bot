# 小云 · Yun

当前优先开发 **macOS / iOS 原生 App**，中文名称为「小云」，英文名称为 **Yun**。SwiftUI 负责界面，macOS 通过少量 AppKit 接入应用图标、文件选择与进程生命周期。Android、Windows 和 Web 暂缓；已实现的 nsh 0.4.0 预览源码与构建入口保留，作为迁移对照。

## 共享代码与平台边界

- `packages/yun-apple`：共享 `YunCore`（模型、控制器协议、语言目录、连接地址校验）和 `YunUI`（语言选择、消息反馈、人物卡摘要等 SwiftUI 组件）。
- `apps/macos`：独立 SwiftPM App，使用系统侧边栏、工具栏、Settings 窗口、MenuBarExtra、菜单快捷键、文件选择器与应用图标。
- `apps/ios`：iPhone / iPad 原生 Xcode 工程，使用系统 TabView、NavigationStack 和 Form，最低 iOS 17。
- `apps/el-bot-client`：保留 Go 控制器、品牌图标、客户端版本与 nsh 预览；Go 不依赖 GUI 框架。

两个 App 共享 Swift 代码，但保留各自的交互与平台能力。AppKit 只用于 Mac；iOS 不执行本机 Node / SSH / CLI，不读取桌面配置或凭据。共享代码不等于会话自动同步，后者仍需要服务端身份认证、会话存储与流式接口。

macOS 已接回现有快捷操作、人物卡、设置、本机启停、日志和任务中断确认。两端现在通过同一 HTTPS 移动 API 提供原生会话列表、文本聊天、历史分页、QQ 状态和跨设备续聊。模型上下文继续由云端 DSH 保存，客户端重连不会复制会话或重放任务。

## 语言与本机安装

「设置 → 语言」提供「跟随系统」「简体中文」「English」。Mac 偏好保存在 `~/.el-bot/client.json`，iOS 保存在各自的 UserDefaults；业务文字即时切换，系统菜单和文件面板遵循系统语言。

iOS 会话列表在紧凑宽度下使用 `NavigationStack` 返回列表，iPad 宽屏与 macOS 继续保留 `NavigationSplitView`；聊天输入使用系统发送键、随滚动收起键盘，配对码字段自动规整粘贴内容并限制长度。设置中的「云乐坊账号」在云端配置 SSO 校验后才显示同步状态；配置账号发现后可用系统浏览器登录，查看名下在线云端并一键连接，配对码仍保留为备用。默认 proof adopter 未启用时不发起系统浏览器认证，也不把账号同步或在线列表伪装成已完成。

沿用应用标识 `cn.elpsy.elbot.client` 和既有 Mac 设置。SSH 主机别名、本机路径与未知设置字段继续保留。关窗后 App 和菜单栏继续运行，从菜单栏或 Dock 恢复；退出客户端只结束界面控制器，独立运行的机器人继续运行。

```sh
pnpm client:dev
pnpm client:build                           # macOS .app；其他系统校验 Go 控制器
./script/build_and_run.sh --install-only    # 构建、备份旧应用并安装
./script/build_and_run.sh                   # 构建、安装并打开
pnpm --filter @el-bot/client mobile:ios      # iOS Simulator 原生 .app
node scripts/build-apple.mjs --platform ios # 无签名真机构建，不能直接安装
```

Mac 输出位于 `apps/macos/build/darwin-<架构>/Yun.app`，最低 **macOS 14.0**；iOS 模拟器包位于 `apps/ios/build/Build/Products/Debug-iphonesimulator/Yun.app`。安装脚本安装到 `/Applications/Yun.app`，旧包备份到忽略目录 `.el-bot/backups/desktop/`。原生构建需要完整 Xcode（分层图标要求 Xcode 26+）、Swift、Go、Node 和 pnpm，不需要 Rust 或 nsh。`apps/ios/Yun.xcodeproj` 已提交，修改 `project.yml` 后用 XcodeGen 重新生成。

两端原生 App 不捆绑 Node 或机器人 CLI；Go 控制器随 Mac 包附带。仅在管理本机机器人时需要用户配置的 Node 与 el-bot CLI。

## 原生会话与设备连接

默认连接 `https://bot.yunle.fun`。Mac「连接云端 → 通过已有 SSH 连接配对」通过私有管理员通道取得五分钟有效的一次性配对码，并在固定的 HTTPS 入口兑换该 Mac 的设备凭据。完成后点击「配对 iPhone 或 iPad」生成另一份一次性码，在手机填写即可。也可在云端使用 `yun-bot-mobile --pair` 手工生成。配对码不写入普通设置、状态快照或日志。

每台设备持有独立、可撤销的凭据，保存在 `WhenUnlockedThisDeviceOnly` Keychain；服务器只保存摘要。当前有效期为三十天，仅面向可信本人设备。普通设置只保存不含凭据的 HTTPS origin。客户端不接受重定向转发认证头，不使用浏览器 cookie 保存设备身份，也不放宽 ATS 或证书验证。统一账号同步是独立的可选层：共享 Swift 客户端已准备 `ASWebAuthenticationSession` + PKCE 的参数与回调校验，云端使用 `@yunlefun/sso/server` 校验一次性身份断言后才关联语言偏好；账号发现进一步返回在线实例和短时入会票据，连接目标云端后再兑换该实例专属、可撤销的设备凭据。实际登录还需注册原生 `clientId`、注入遵循 CloudBase SDK 的 proof adopter、接入全局实例目录与账号中心票据签发服务，并单独真机验收。会话内容继续由已配对的云端 DSH 保存，账号登录不会下发模型密钥、QQ 凭据或长期设备 bearer。生产启用前还需要在云乐坊 SSO Registry 配置精确回调 URI 与 JWKS；详见[连接方案调研](./native-connectivity-research.md)。

原生侧栏/会话页显示同一 DSH 的会话标题、分组与模型，QQ 私聊、群聊与移动会话沿用各自的原始 ID。打开历史不会激活模型；发送只提交新文本和稳定 request ID，不上传旧历史作为另一份上下文。跨端续聊同一会话并不意味着将 App 消息再次发送到 QQ。

聊天页使用系统配色与动态类型：消息按内容自适应宽度，用户消息采用系统强调色，助手消息采用系统控件背景；时间作为气泡外的辅助信息。输入区使用系统 `.bar` 材质、胶囊输入框和圆形发送按钮，不用网页式卡片或自定义弹窗。断开设备连接使用系统 `confirmationDialog`，包含明确标题、说明与取消操作。

当前以前台轮询同步：会话列表五秒，聊天运行中两秒、空闲五秒；回到前台后补齐历史。尚未实现逐字流式输出、后台常驻、APNs、附件或原生工具审批。需要完整管理和审批时，Mac 继续打开私有 DSH Web。锁屏或退出 App 不取消云端任务。

发送前把待确认文本与 request ID 原子写入本机私有目录。网络超时后保留原 ID，用户明确重试仍使用该 ID；服务器按 DSH 原生持久消息/收件箱去重。历史中的 requestId 也可消除未确认状态，避免把已经接受的消息当作新任务再次发送。正式历史不另建客户端数据库。

`packages/mobile` 提供受限接口，代理只转发 `/el-bot/mobile/v1/`。根路径与通用 `/api` 仍不公开。`0.1.1` 的历史投影排除内部 runtime/approval 上下文，仅返回人类输入与助手文本，同时保留发送收据。部署、撤销和协议边界见[原生会话接口](./ios-companion.md)。

## 保留的 nsh 预览

```sh
pnpm --filter @el-bot/client nsh:build --skip-dmg
pnpm --filter @el-bot/client mobile:android
pnpm --filter @el-bot/client web:build
```

这些入口仍使用 `App.tsx`、`src/`、`native/` 和固定的 nsh 0.4.0 工具链。Mac 预览输出留在 `apps/el-bot-client/build/`，与新的 `apps/macos/build/` 分开。正式默认构建和安装不依赖此宿主；现有 Rust / TSX 检查仍保留，防止对照版本回退。

## 日常使用

客户端首页现以「快捷操作」为主：打开云端 DSH、本机 QQ 和任务程序；本机机器人状态可展开。路径和 QQ 展示位于独立「设置」窗口，日志从本机机器人区域打开。

「设置 → 云端 DSH」只填写本机 SSH 配置中已有的主机别名。点击「打开云端 DSH」后，原生模块建立固定 SSH 隧道并在系统浏览器打开云端认证入口；只保存别名，不保存模型密钥或 Web 登录令牌。现有本机 CLI 尚未配置时，也可以单独使用云端入口。该连接目前已按 macOS 验证流程实现，Windows／Linux 的 SSH 复用与默认浏览器仍需实机验证。

云端负责会话、模型、分组和远程执行；桌面继续负责托盘驻留、本机程序、快捷入口和本机权限。远程页面在独立浏览器中运行。部署、迁移与回退见仓库 `apps/dsh-cloud/README.md`。

在「设置 → 本机运行环境」中填写 Node、el-bot CLI、机器人配置、凭据和状态文件的完整路径。设置保存在 `~/.el-bot/client.json`，只有路径，不保存凭据值。每次操作都会重新读取设置。

- 点击「启动机器人」后，后台进程独立运行。关窗后客户端驻留菜单栏，Dock 与菜单栏都可以再次打开窗口。
- 从菜单栏／托盘或应用图标打开控制台，重复打开只唤起已有客户端实例。「退出客户端（机器人继续运行）」退出界面，后台机器人仍然运行。
- 本机机器人启停入口沿用原控制器逻辑；有任务时打开系统确认框，默认继续运行。
- 空闲时「停止」正常关闭连接、保存状态、释放锁；重复停止返回已停止。
- 有任务或管理操作时，普通停止被拒绝。界面允许明确选择「中断并停止／重启」，也可以继续运行，等待完成后再操作。已经产生的工作区修改不会撤销。
- 重启先等待旧实例清理完成并释放状态锁，再启动新实例。任务不会自动重放。
- 状态区分别显示 QQ 连接、配置选定的任务程序与任务状态。ACP 握手通过显示「已连接」；HTTP 回调显示「回调已监听」，模型与公网 QQ 收发仍需实际验证。
- 日志展示状态文件旁 `.log` 的最近约 32 KB；前台启动的日志仍在原终端。启动失败时在日志中查看原因。

首次绑定仍沿用 `/pair`，未绑定实例的配对码写入本机私有日志。客户端不修改主人绑定、项目白名单、持久去重、单任务准入或审批规则。

## 图片展示与本机程序

在「设置 → QQ 回复展示」选择 **展示图片卡片**、**Markdown 卡片（不展示图片）** 或 **纯文本（不展示图片）**。图片卡片支持浅色／深色主题。保存只修改当前机器人配置的 `messageFormat` 和 `image.theme`，保留其他配置、凭据与会话；正在运行时提示等待任务完成后重启，不自动中断。

「快捷操作」页面提供 **打开 Codex**、**打开 CodeBuddy**、**打开 dsh**、**打开 QQ**，在客户端所在电脑启动或唤起已安装应用。macOS 默认按应用标识 `com.openai.codex` / `com.tencent.codebuddycn` / `com.deepseek.dsh`（兼容 `dsh-tauri`） / `com.tencent.qq` 查找安装位置；CodeBuddy 默认查找中国版，其他版本可在连接设置填写完整 `.app` 路径覆盖。Windows 填写完整 `.exe` 路径，Linux 填写完整可执行文件路径。留空时 Windows／Linux 会提示先配置路径。新路径保存在 `~/.el-bot/client.json`，旧版路径配置仍可读取。

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

macOS 与 iOS 业务界面均使用 SwiftUI 系统组件；Mac 仅在文件选择、应用图标和单实例锁等边界使用 AppKit / Darwin。QQ 机器人资料图片继续保留在 `assets/avatars`。

品牌图标按 [YunLeFun/icons 规范](https://github.com/YunLeFun/icons/blob/main/docs/guide/contributing.md)分为透明主体 `el-bot-mark` 和满幅无圆角的 `el-bot-app-icon`。原有 `assets/brand/el-bot-mark.svg` 保持不变，继续用于文档 logo；`assets/brand/el-bot-cloud.svg` 是应用 SVG、PNG、ICNS、Icon Composer 分层源和 macOS 菜单栏模板共用的云朵源。默认正面主体宽度为 72%，静态图标的圆角只在 macOS ICNS 导出阶段应用一次，菜单栏使用单色模板适配明暗外观。

macOS 26 及以上使用 `apps/el-bot-client/icons/ElBot.icon` 分层图标，由构建脚本调用 Xcode 编译 `Assets.car` 并设置 `CFBundleIconName`；品牌蓝底板与透明云朵前景分离，主体保持背景宽度的 72%。macOS 14/15 使用同包中的静态 `icon.icns` 回退。系统负责原生高光、折射、圆角与外观适配；Windows/Linux 图标不受影响。

macOS 打包 CI 使用 `macos-26` / `macos-26-intel`，并通过 `apps/el-bot-client/scripts/check-macos-icon.mjs` 检查实际 `.app` 中的默认、深色、着色图层及原生高光，避免工具链缺失时仅带静态图标。该脚本也可手动运行，参数为打包后的 `.app` 路径。

修改图形后执行 `pnpm icons:generate`，用 `pnpm icons:check` 验证所有派生资产与源一致。客户端开发和安装包构建会自动生成图标。变体元数据与上游来源记录在 `assets/brand/metadata.json`；两个变体已登记到 [YunLeFun/icons 源码集合](https://github.com/YunLeFun/icons)，由图标集的 `pnpm icons:collect` 同步，npm 消费需等待后续版本发布。Iconify 名称为 `ylf:el-bot-mark` / `ylf:el-bot-app-icon`，UnoCSS 类名为 `i-ylf-el-bot-mark` / `i-ylf-el-bot-app-icon`。品牌 SVG 与派生图形采用 `assets/brand/LICENSE` 中的 MIT 许可。

`pnpm client:build` 在 Mac 生成原生 `.app`。`pnpm --filter @el-bot/client desktop:build` 构建 Release 应用和 DMG，`pnpm clients:build` 收集安装包与 SHA-256 到 `dist/desktop-<平台架构>/`。Mac 安装包使用 ad-hoc 签名，尚未 Apple 公证。

`.github/workflows/desktop.yml` 构建 macOS arm64 / x64 DMG，并编译 iOS Simulator 工程；其他平台安装包暂缓。普通 CI 与标签发布复用此流程。npm 发布范围、最低 Node.js 22.18.0 的精确 tarball 安装校验保持原样。

图标检查继续验证实际 `.app` 中的分层外观、高光与静态回退。品牌源与派生资产不因 UI 框架切换而重新设计。

## 实现与验证

- `apps/qq-codex/src/control.ts`：本机 IPC、身份验证、后台进程与结构化结果。
- `apps/qq-codex/src/lifecycle.ts`：初始化与关闭协调、逐项清理。
- `packages/yun-apple/`：Apple 共享模型、协议边界与公共 SwiftUI 组件。
- `apps/macos/`、`apps/ios/`：平台原生入口、导航与能力。
- `apps/el-bot-client/App.tsx`、`src/`：保留的 nsh 预览界面。
- `apps/el-bot-client/native/`：Rust/nsh 宿主、固定桥接函数、私有单实例通道、macOS 原生工具栏、Windows 托盘/关窗生命周期。
- `apps/el-bot-client/*.go`：独立控制器，复用原有命令白名单、配置合并、SSH 与任务中断规则。

自动验证覆盖控制令牌、实例隔离、锁不匹配、任务中停止、重复关闭、清理失败和两个客户端并发启动同一模拟进程。测试不建立 QQ 连接、不启动模型任务。完整仓库测试、lint、typecheck 以及精确 CLI tarball 的安装检查继续保留。

Apple 验证使用 `swift test --package-path packages/yun-apple`、`swift test --package-path apps/macos` 和 `pnpm --filter @el-bot/client mobile:ios`。共享目录的中英文 JSON 从控制器语言目录同步，`scripts/check-apple.mjs` 检查一致性及版本。协议测试覆盖分包、多帧、超限、截断和 HTTPS 地址；Mac 管道回归测试确认空闲控制器的小快照能立即到达。

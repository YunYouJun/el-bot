# el-bot MyGo + Augma 原型

这是独立分支 `codex/mygo-augma-prototype` 上的可丢弃原型，用于验证常驻客户端的成本与原生输入体验。正式 Tauri 客户端保留，尚未决定迁移。

## 运行

需要 Go 1.27.3（本次验证版本）和现有 Node.js 运行环境。从仓库根目录执行：

```bash
pnpm mygo:dev
pnpm mygo:build
```

构建产物位于 `apps/el-bot-mygo-prototype/build/darwin-arm64/`，包含 `.app` 和 `.dmg`，目前仅作本机原型使用。MyGo 固定为 v0.7.4，通过 `go.mod` 的工具依赖运行，构建不需要 Cargo；旁边的 Tauri 对照客户端仍然需要 Rust/Cargo。

原型使用独立的 `~/.el-bot/mygo-prototype-client.json`，只在点击保存时写入。连接设置中填写 Node、已构建的 el-bot CLI、机器人配置、凭据和状态文件的绝对路径。工作区 CLI 为 `packages/el-bot/dist/cli.mjs`，可先运行 `pnpm install --frozen-lockfile && pnpm build` 生成。未配置时界面明确提示路径不可用，不会自动启动机器人。

可以用临时设置文件执行只读集成检查：

```bash
pnpm mygo:check --settings /absolute/prototype-settings.json
pnpm mygo:check --settings /absolute/prototype-settings.json --check-operation logs
pnpm mygo:check --settings /absolute/prototype-settings.json --check-operation preferences
```

设置文件结构如下（只存路径，不存凭据内容）：

```json
{
  "nodePath": "/absolute/node",
  "cliPath": "/absolute/el-bot/dist/cli.mjs",
  "configPath": "/absolute/prototype-config.json",
  "credentialsPath": "/absolute/prototype.env",
  "statePath": "/absolute/prototype-state.json"
}
```

## 已实现的范围

- 机器人、运行日志、连接设置三个页面，复用压缩后的 el-bot 头像。
- `ui` 原生 GPU 绘制，不包含 WebView。菜单、托盘和文件选择器使用系统能力；页面控件不是 AppKit/SwiftUI 控件。
- Augma 浅深色语义色映射，跟随系统外观；空闲时没有装饰动画或定时轮询。
- 关闭窗口销毁界面并触发 Go GC，进程保留托盘；再次激活时重建窗口。退出原型不停止独立运行的机器人。
- 托盘包含三个页面、启动、停止、重启和退出。界面的“托盘操作”展示同一原生菜单模型，方便系统菜单栏拥挤时操作。
- 通过白名单 argv 调用现有 TypeScript CLI 的 `status/logs/start/stop/restart/preferences`，没有重写 QQ 协议或任务处理。单次命令按需启动 Node，75 秒超时，响应大小有上限。
- 繁忙任务的停止/重启需要原生确认框明确选择中断，继续复用核心的身份、审批、去重和任务准入规则。展示设置先读取，再允许保存。
- “中文输入验证”字段只保存在内存里。

Augma 的 `@augma/core` 是 CSS/设计 token 包，本原型手工映射 `packages/core/src/tokens.css` 的语义色，没有把 CSS 当作 Go UI 库导入。来源为 [YunYouJun/augma](https://github.com/YunYouJun/augma)（本地基准 HEAD `1dfcc85`），许可保留在 `resources/AUGMA-LICENSE`。头像和应用图标复用 el-bot 现有素材。

## 验证结果与边界

macOS 26.6.2 / arm64 上完成三个页面、共享原生菜单切页、文件选择器打开与取消、窗口关闭与驻留重开、系统浅深色实时切换。真实拼音逐键输入已提交“中文输入，🙂”，并验证 emoji 删除与恢复。没有建立 QQ 连接、执行模型任务或启动真实机器人。

只读 Go → TypeScript CLI 集成返回了停止状态、中文日志、Markdown/浅色展示设置。全仓库 lint、typecheck、各包 typecheck、完整构建以及 Rust 现有测试通过；Go vet 和 Windows/Linux amd64 交叉编译通过。Windows/Linux 的真实托盘、渲染和中文输入尚未运行验证。

自动化验证中，部分 MyGo 绘制按钮的无障碍点击没有响应，Tab/Return 导航可用；系统菜单点击正常。真实系统状态栏图标的点击路径仍需人工补验，本次菜单操作通过窗口内同一菜单模型验证。不能将本次结果写成完整的无障碍验收通过。

文件选择器可能创建额外的 AppKit/QuickLook XPC 服务；性能采样使用重新启动后的外壳，没有打开文件选择器。真实工作负载应另测，包含机器人、Node/模型进程和系统服务的长期占用。

## macOS 原生能力扩展

`platform.go` 集中处理本机程序入口；后续使用 `platform_darwin.go` / `platform_windows.go` / `platform_linux.go` 隔离差异，并向 UI 返回能力是否可用。

1. 托盘、菜单、系统对话框、通知、剪贴板、快捷键、深链等先用 [MyGo Desktop APIs](https://mygo.egoist.dev/docs/native)，按各平台实际支持情况开放。
2. 需要控制 NSWindow 时，MyGo 提供 `Window.NativeHandle()`；macOS 返回 NSWindow 指针，AppKit 调用必须在 `mygo.RunOnMain` 内执行。直接互操作需要自行维护生命周期和系统版本兼容性。
3. 更复杂的 Finder、Shortcuts/App Intents 或其他 Apple framework 集成，采用独立签名的 Swift helper 或窄 C ABI 桥接。按需调用，定义具体操作和版本化数据，不暴露通用执行任意代码的接口。需要系统权限的能力再走相应授权流程。
4. 如需 SwiftUI/RealityKit 独立窗口，由 macOS helper 承担；这不是已实现的跨平台嵌入组件。把能力作为可选增强，避免业务核心依赖 macOS。

## 性能复现

测量方法、结果和原始样本见 [bench/RESULTS.md](bench/RESULTS.md)。当前 Tauri 对照只添加了本地计时钩子，没有改变其隐藏窗口的生命周期。

```bash
mkdir -p /tmp/el-bot-prototype-bench
# 显式创建这个标记后，两个原型才记录就绪信号。
touch /tmp/el-bot-prototype-bench/enabled
# 手动启动两个 release app，关闭窗口，记录各自主进程 PID 后采样。
python3 apps/el-bot-mygo-prototype/bench/sample_macos.py \
  --pid mygo=123 --pid tauri=456 --seconds 30 --rounds 3 \
  --label closed --output /tmp/el-bot-prototype-bench/closed.json
```

测试结束后移除标记即可关闭计时记录。采样脚本只读进程计数器，不负责启动、关窗或控制应用。

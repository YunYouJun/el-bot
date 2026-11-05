# MyGo / Tauri 原型对照

2026-11-05 在 Apple M5 Pro / Mac17,8 / 48 GiB / 18 核 / macOS 26.6.2（25G83）完成。两个客户端均为本机 arm64 release、临时签名的 app；没有连接 QQ 或执行模型任务。Go 1.27.3 / MyGo v0.7.4；Tauri 以 `0ead2e2` 为基线，仅增加本分支的计时钩子，依赖使用原 lockfile。

## 结果

| 指标                           | MyGo 原型 | 现有 Tauri + 计时钩子 |
| ------------------------------ | --------: | --------------------: |
| 窗口打开，physical footprint   |  63.6 MiB |             105.1 MiB |
| 关窗驻留，physical footprint   |  52.4 MiB |             106.1 MiB |
| 关窗空闲 CPU，单核百分比       |    0.024% |                0.181% |
| 首次窗口就绪信号，3 次中位数   |    510 ms |               1019 ms |
| 驻留后重开就绪信号，3 次中位数 |     63 ms |                 81 ms |
| 关窗采样的进程数，含关联 XPC   |         2 |                     6 |

关窗采样每轮 30 秒、共 3 轮，同步采集两端：

| 轮次 | MyGo 内存中位数 | Tauri 内存中位数 | MyGo CPU | Tauri CPU |
| ---- | --------------: | ---------------: | -------: | --------: |
| 1    |       52.44 MiB |       105.46 MiB |  0.0095% |   0.1103% |
| 2    |       52.47 MiB |       106.25 MiB |  0.0242% |   0.2704% |
| 3    |       52.35 MiB |       106.10 MiB |  0.0269% |   0.1814% |

窗口打开采集一次 15 秒。表中关窗总值是三轮统计值的中位数。首次打开范围：MyGo 321–560 ms、Tauri 991–1146 ms；驻留重开范围：MyGo 44–64 ms、Tauri 71–84 ms。

## 口径与限制

- 这是外壳对照：两端保留默认连接路径，显示 CLI 未配置，不拉起 Node 常驻进程。Go → 实际 TypeScript CLI 的只读集成另行验证。真实机器人、Node daemon、模型服务的占用未计入，无法据此声称整套机器人内存减半。
- MyGo 关闭时销毁原生绘制窗口并触发 Go GC，重开重建；当前 Tauri 关闭时隐藏并保留 WebView，重开显示。内存差异包含生命周期策略，不能全部归因于框架；进一步优化 Tauri 的关窗释放策略可能缩小差距。
- MyGo 使用 `OnReadyToShow`；Tauri 使用 Vue mounted/focus 后两次 `requestAnimationFrame` 经 IPC 返回 Rust。首次计时从 Go 包初始化时间点 / Rust main 开始，重开从各自 show 路径开始。两种信号不完全等价，均不包括系统启动分派、进程入口之前的加载时间或显示器实际出光。这里的首次打开是新进程、文件缓存已热，不是重启系统后的冷盘测试。
- Tauri 在窗口初次显示后才完成 Web 前端信号，MyGo 在回调中 show/focus 后记录；因此不能用比值宣称精确的“用户可见打开速度提升两倍”。
- 内存使用 `proc_pid_rusage(RUSAGE_INFO_V2)` 的 `ri_phys_footprint`，按 app 的 resource coalition 聚合。包含重新托管到 launchd 的 WebKit GPU/Networking/WebContent、AudioToolbox 和 AppKit helper，避免只看主 PID。MyGo 也包含其 AppKit helper。
- coalition 使用诊断脚本中的私有 `proc_pidinfo` flavor 20，本机验证同组 helper ID 一致。其 ABI 不保证跨 macOS 稳定，读不到 root ID 时脚本失败；无法读取的其他进程会跳过。这不是产品中的统计接口。结构参考 [Apple XNU proc_info.h](https://github.com/apple/darwin-xnu/blob/main/bsd/sys/proc_info.h)。
- CPU 使用每个进程自身 user + system 累计时间差，不重复计入 child 计数；Mach ticks 按本机 timebase 125/3 换算成纳秒。100% 代表占满一个核心。每秒采样可能遗漏采样间退出的短命进程，空闲场景未观察到此类变化。
- 同时运行的日常应用没有关闭，系统缓存、调度和内存压力会影响结果。CPU 数值很低，样本较少，不能据此给出可靠的续航排名。physical footprint 的进程求和也不是整机去重后的物理内存差值。
- 文件选择器测试可能留下 QuickLook/AppKit helper，已在采样前重启测试应用。测试脚本没有代替 UI 操作，没有更改机器人状态。
- 后续修正了未参与基准路径的 DSH bundle ID；视图和关闭生命周期保持测量版本一致。

## 结论

在这套三页外壳和当前生命周期实现中，MyGo 关窗占用约低 51%，进程内首次就绪信号更早，具备继续做常驻客户端的价值。两端空闲 CPU 都很低，驻留重开差距较小。

建议保留 Tauri 正式版，把 MyGo 作为实验分支继续验证：Windows/Linux 实机的托盘与中文 IME、VoiceOver/无障碍按钮、真实长任务、休眠唤醒、崩溃恢复、签名与升级分发。本次没有替换正式客户端或承诺全平台已验收。

## 原始数据

- [打开窗口采样](samples/open.json)
- [三轮关窗采样](samples/closed.json)
- [六组窗口就绪信号](samples/timings.json)
- [只读采样脚本](sample_macos.py)

原始数据中的用户工作区路径已替换成 `<worktree>`，保留 PID、进程启动时间、每秒 counter 和统计结果。读取的是可执行文件名称，没有收集命令行参数、凭据或机器人内容。

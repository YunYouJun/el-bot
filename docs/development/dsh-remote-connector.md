# 远程 DSH：WKWebView 直连

当前方案：小云 macOS / iOS App 使用已有设备配对，通过 HTTPS 直连 `bot.yunle.fun`。完整 DSH 网页由服务器提供；macOS 已增加 WKWebView 入口，用户已确认能显示完整网页和会话列表。移动端保持现有实现，不新增 Remote 账号、协调服务或自研聊天面板。

## 选择入口

| 入口 | 界面与用途 | 连接方式 |
| --- | --- | --- |
| 小云 macOS 的 DSH Web | 完整 DSH 工作区、会话、流式交互与审批 | 配对凭据换网页票据，WKWebView 经本机代理访问已有 HTTPS 网关 |
| 小云 iOS 的 DSH Web | 手机上的完整 DSH 界面 | 相同的票据和代理协议，保留原有手机交互 |
| 小云 iOS / macOS 原生页面 | 日常聊天、QQ 群聊、人物卡、状态 | HTTPS 移动 API，当前以前台轮询更新 |
| SSH 打开 DSH Web | 已有的浏览器访问与排障入口 | SSH 隧道和 DSH 自身的 Web 认证 |

这些入口访问同一个云端 DSH。指定同一 session ID 时使用同一份历史和模型上下文，不把远程历史复制到本地 DSH 引擎。

## 连接与认证

```text
小云 App
  → 用一次性配对码取得该设备独立的访问凭据
  → 原生层通过 HTTPS 申请一次性网页票据
  → 原生层兑换云端网页 Cookie
  → 启动只监听 127.0.0.1 的本机代理
  → WKWebView 加载本机入口
  → 代理通过 HTTPS / WebSocket 连接 bot.yunle.fun
  → 服务器上现有的 DSH 会话与工作区
```

设备凭据保存在 Keychain。网页票据有效六十秒且只能兑换一次；票据、设备 Bearer 和云端 Cookie 都不放进网页 URL，也不交给页面脚本。WebView 仅持有本机代理自己的随机 HttpOnly Cookie。

本机代理的 HTTP 地址只用于同一台设备内的 WebKit 通信；代理到服务器继续使用系统校验证书的 TLS，不是把云端 DSH 改为明文公网服务。网关需在现有云端实例中显式开启，未授权请求仍被拒绝。

服务器重启会清空网页会话。点击「重新连接」可用已有设备配对重新申请票据，无需重新部署或迁移聊天数据。设备到期或被撤销时仍需重新配对。

具体接口和网关部署见[内嵌 DSH Web](./ios-companion.md#内嵌-dsh-web)。

## macOS 交互与生命周期

- 默认进入 DSH Web；未配对时显示现有连接页面，也可使用已有 SSH 辅助配对。
- 原生侧栏提供 DSH Web 入口，进入时默认收起小云侧栏，保留网页自己的完整 DSH 布局。系统侧栏按钮可展开原生导航。
- 工具栏提供后退、前进、刷新和重新连接；快捷操作、菜单栏和模型配置指南均可打开内嵌入口。
- WebView 按需创建，普通导航切换期间保留当前页面。换绑设备、断开连接或窗口销毁时关闭代理，并释放该网页会话。
- 使用独立的非持久化 WebKit 数据存储，不把云端登录状态混入系统浏览器。
- 网页顶层导航限制在当前本机代理 origin。主动点击的 HTTP(S) 外链使用系统浏览器；文件和其他应用协议不自动打开。
- DeepSeek 模型账号授权只接受其精确官方授权地址；使用系统浏览器完成授权，回调由已有本机代理转交云端。它与设备配对是不同的授权。
- 不新增网页脚本桥、本地文件读取接口或模型工具，也不修改 DSH 默认 DOM 与布局。

实现位于 `apps/macos/Sources/YunMac/Views/DesktopDSHWebView.swift` 和 `apps/macos/Sources/YunMac/Services/DesktopDSHWebController.swift`；复用 `YunCore` 的 `MobileAPI.webCookie()`、`DSHWebLaunch` 与 `DSHLoopbackProxy`。iOS 页面源码不因本轮 macOS 接入而修改。

## 为什么不继续使用社区 Remote 插件

[`ds-harness-remote`](https://github.com/liguobao/ds-harness-remote) 适合在本地 DSH 原生客户端中发现并打开远程 Host。其 `serverUrl` 指向实现 Remote 注册、登录、在线状态和连接协调接口的服务，而不是任意 DSH Web 网址。

它可以使用作者托管的 Remote Server，或自行部署相同协议的服务。已有 `bot.yunle.fun` 实现的是小云配对 API 和 DSH 网页网关，不能直接当作该插件的 Remote Server。

当前目标是连接已经可达的固定域名，现有配对与 Web 网关已能满足需求，因此不引入这套额外服务。先前的轻量 connector 草案和 Remote 接入计划不再作为实施路线。

### 本轮清理

- 通过官方 Desktop 插件管理命令卸载本次安装的 `ds-harness-remote@0.6.4`，从本地依赖和 bundles 移除。
- 还原安装时新增的 `minimumReleaseAgeExclude` 条目。
- 本轮生成但未登录的 Remote 设备身份目录移至本机忽略目录的备份；没有已授权 Remote 账号需要注销。
- 云端仅准备过独立的插件包，从未加入运行 profile、注册设备或改动 Compose。未启用的包已移入服务器私有备份。
- 原有 DSH、QQ、移动端网关与配对数据保留；服务器容器继续运行。

## 验证边界

macOS 新增测试覆盖同源导航、拒绝启动 token URL、官方授权地址校验和外链协议限制。共享代理已有测试覆盖 Cookie 隔离、HTTP 流式转发、WebSocket 请求、受限 OAuth 回调和监听器关闭。

本轮通过测试和构建，已安装运行新版 Mac App，并观察到与原云端的 HTTPS 及 WebSocket 连接；用户确认完整 DSH 网页和会话列表正常显示。自动化工具读取该窗口超时，因此未据此声称完整 UI 自动化通过。实际发送、审批和模型账号授权仍应分别验收，不能仅凭网页显示就当作全部交互已经通过。

# 小云原生会话接口

macOS 14 / iOS 17 原生客户端通过 `packages/yun-apple` 共用模型、HTTP 客户端、Keychain、待确认消息状态和 SwiftUI 会话组件。默认 HTTPS 入口为 `https://bot.yunle.fun`，连接已有 DSH `0.2.1-rc.5` 与官方 QQ 插件 `0.5.5`。当前机器人为小云 Bot（AppID `102275406`）。

手机设备工具和跨 App 实验见[小云手机助手实施计划](./ios-device-assistant.md)。首版保留云端 DSH，原生 App 通过本机配对调用独立 iCTRL 运行器；设备工具页不向云端提供通用 RPC。

## 配对和撤销

Mac 的「连接云端 → 通过已有 SSH 连接配对」通过已有 SSH 配置和管理员 Unix socket 生成一次性码，并只在本实例的固定 HTTPS 地址兑换；不会将其他服务器地址传入远端命令。配对后点击「配对 iPhone 或 iPad」，在手机输入新码。配对码五分钟有效、一次性使用，重新生成会替换旧码。

也可通过管理员终端操作：

```sh
sudo docker exec --user node el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --profile cloud --pair
sudo docker exec --user node el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --devices
sudo docker exec --user node el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --revoke <device-id>
```

配对后的可信本人设备拥有该实例的会话阅读与续聊权限。凭据有效三十天，服务器仅存 SHA-256 摘要，每次请求检查到期和撤销状态；客户端仅存 Keychain，使用 `WhenUnlockedThisDeviceOnly`，不放在 URL、UserDefaults、普通配置或日志。云端模型 Key 和 QQ 凭据不下发。断开连接会先请求撤销；网络失败时保留可重试状态，不把本地清除当作已经撤销。

## 限定 REST API

以下路径均相对 `/el-bot/mobile/v1`：

| 接口 | 用途 |
| --- | --- |
| `POST /pair` | 一次性码兑换当前设备凭据 |
| `GET /device`、`DELETE /device` | 查看、撤销当前设备 |
| `GET /sessions`、`POST /sessions` | 现有会话列表、固定工作区内创建原生会话 |
| `GET /sessions/:id?before=seq` | 人类输入和助手文本历史，最多八十条消息 |
| `POST /sessions/:id/messages` | 提交新文本与稳定 `requestId` |
| `GET /sessions/:id/models` | 当前会话选择及当前可路由的模型目录 |
| `PUT /sessions/:id/model` | 切换当前会话下一次请求使用的 provider/model |
| `GET /status` | 当前进程的 QQ 连接状态 |
| `POST /web/ticket` | 已配对设备显式请求完整 DSH Web 的一次性登录票据 |
| `POST /web/launch` | 原生网络层兑换票据，设置独立网页会话 Cookie |
| `GET /account` | 查询账号同步能力与轻量偏好 |
| `POST /account/instances` | 用云乐坊 SSO 双证明查询账号名下在线云端 |
| `POST /account/link` | 校验云乐坊 SSO 身份断言后关联账号 |
| `PUT /account/preferences` | 保存白名单内的语言偏好 |
| `DELETE /account` | 解除本实例的账号关联 |
| `POST /pair`（票据模式） | 用账号中心签发的一次性入会票据兑换本实例设备凭据 |

配对、账号发现、入会票据兑换和 Web 票据兑换不要求已有设备 bearer，其余原生路径均需要 `Authorization: Bearer <device-token>`。Web 票据必须先由已配对设备申请。请求 JSON 上限 20 KiB，新消息上限 4,000 个 UTF-16 单元。配对限制为全局每分钟二十次、最多二十台有效设备。响应禁止缓存。公网代理不挂载 DSH home；完整网页和 RPC 由下述 Web 网关单独认证，管理员 socket 始终不公开。

账号路由默认返回 503。启用时需给 `@el-bot/mobile` 配置 `account.cloudbaseEnvId`、`appId`、`clientId`、`issuer`、`jwksUrl`，并在云乐坊 SSO Registry 注册对应的公开客户端和精确 HTTPS 回调。网关校验 `@yunlefun/sso` 的双证明后，只持久化经服务端验证的用户标识、展示字段和语言偏好；不保存 SSO code、CloudBase ticket、access token、身份断言或聊天历史。设备配对仍是读取和续聊会话的授权边界，账号关联不会绕过它。

账号发现是独立于偏好同步的可选层：配置 `discovery.account`、`discovery.enrollmentSecret`、`discovery.instances` 后，`GET /account` 会返回 `discovery.enabled/canEnroll`，`POST /account/instances` 用同一套双证明返回账号名下两分钟内心跳有效的在线实例。只有再注入 `discovery.tickets` 的账号中心签发器后，`canEnroll` 才为真：签发器用 SSO 双证明为选中实例生成绑定 `userId`、`instanceId`、`publicOrigin`、设备名和随机 `clientId` 的 60 秒票据；目标实例验证票据并兑换一次独立的 30 天设备凭据，票据随即因 `clientId` 重放检查失效。在线状态来自目录服务的 `lastSeen` 心跳，不能用设备凭据的 30 天有效期冒充。当前仓库只提供协议、注入边界和负向测试；真实全局目录、SSO client 注册、票据签发服务和 proof adopter 仍由云乐坊账号中心提供，未配置时不显示假登录或假列表。

`0.1.1` 修复历史投影：DSH 内部 runtime/approval 上下文虽然也可能使用 `user/message` 事件，但不作为人类对话展示；只有 `source.kind === 'user'` 的用户文本和助手文本进入原生界面。人类输入的 `source.rpcId` 映射为可核对的 `requestId`，不下发完整 source 或工具结果。

## 接续、发送与生命周期

客户端沿用服务端的 session ID，不复制模型上下文或另建聊天数据库。读取历史使用公共 Session Controller，不激活冷会话；发送沿用其任务准入、模型选择和持久请求去重。App 续聊 QQ 关联会话不等于向 QQ 目标再次发送消息；QQ 收发继续由官方插件处理。

发送前将待确认文本和 request ID 原子写入本机私有目录（目录 `0700`、文件 `0600`）。超时后不自动创建新请求；用户明确重试使用原 ID。重新读取历史若找到同一收据，则清除待确认状态及原草稿。客户端重启也保留这一关联，避免重复执行。

原生会话前台轮询：列表五秒，聊天运行中两秒、空闲五秒。后台挂起停止观察，回到前台补齐；退出客户端不停止云端 QQ 或模型任务。原生聊天当前只提供文本，不提供逐字流式、附件、推送或原生工具审批；完整管理和审批可通过 App 内的 DSH Web 入口完成。

原生会话列表提供「全部／QQ」来源筛选，再按更新时间分段：今天、昨天、7 天内、30 天内，更早的记录按月份归档。搜索匹配标题、workspace、模型和来源平台，再对匹配结果重新分组。QQ 会话显示企鹅 logo，同时保留私聊／群聊文字标签、workspace 名称与当前模型。

列表及历史摘要的可选 `source` 字段包含 `platform: "qq"` 与 `kind: "direct" | "group"`。服务端优先通过 QQ 分组适配器的工作区目录识别来源，支持自定义目录；适配器尚未提供服务时，识别默认 `.dsh-qqbot/workspaces/<AppID>/private` 和 `groups` 目录。分类不依赖可编辑的会话或工作区标题，不下发 QQ OpenID。旧服务端未返回来源时仍可在「全部」中查看会话，客户端不会根据名称猜测 QQ 来源；需同时升级 mobile 包和原生客户端才能完整使用来源筛选。

iOS「状态」页复用 `assets/brand/el-bot-cloud.svg` 的三弧云朵与双竖眼设计。上下滚动带动云朵摇晃回弹，在云朵周围拖动时身体与眼睛跟随手指，轻点显示眯眼问候。动画不依赖配对，连接信息仍使用真实云端状态；离开页面或进入后台停止眨眼，系统「减弱动态效果」开启时关闭运动与自动眨眼。Debug 构建可传入 `--show-bot` 直接打开此页，便于独立验收。

聊天输入框上方的模型名称是原生菜单。目录来自 DSH 公共 `sessionController.modelCatalog()`，切换调用 `sessionController.selectModel()`；移动端不读取或改写 DSH 内部会话文件。控制器会恢复目标会话、按当前提供方目录校验 exact provider/model、串行持久化选择，并以规范化后的选择响应。运行中的请求继续使用开始时捕获的模型，新选择应用于下一次模型请求。跨设备修改通过会话列表的持久投影回传，原生端会在下一次刷新时更新。

## 构建与部署

### 内嵌 DSH Web

iOS 底部「DSH Web」使用 WKWebView 加载远端页面，保留原生会话与手机能力入口。不把前端构建产物、Node 或 DSH 引擎打进 App；网页随服务器更新。

内嵌网页默认禁用双指缩放，避免误触。点击 DSH Web 右上角齿轮，可切换「允许双指缩放」；选择保存在本机，刷新、重新连接和重启 App 后继续生效。关闭开关会恢复页面的最小缩放比例，普通滚动仍可使用。

DSH Web 使用顶部原生工具栏：左侧后退、前进，右侧刷新；齿轮菜单提供「重新连接」。iOS 26 及以上由系统提供 Liquid Glass。前进／后退状态跟随 WKWebView 的实际 URL 历史变化；没有对应历史时按钮禁用。

网页内部保留 DSH 默认侧栏和响应式布局，不注入抽屉或其他布局脚本。原生安全区背景跟随 WebKit 的页面背景色，减少上下边界的色差；网页首帧渲染和连接过程中使用系统背景色，暗色模式下进入不会出现白色闪屏。不镜像网页文字，也不改变网页控件的位置。

齿轮菜单的「允许上下回弹」默认关闭，开启后恢复网页到达上下边界时的弹性效果；设置保存在本机，刷新、重连和重启 App 后保留。开关控制原生滚动回弹，正常内容滚动仍可使用。使用 WebKit 会保留的 `bounces` 设置，避免单方向属性被后续视口更新覆盖。

缩放拦截使用原生双指手势的失败依赖。WebKit 在视口更新后可能自行启用内部手势，因此不能只依赖一次 `isEnabled = false`。Debug 验收参数 `--show-dsh-web --verify-dsh-web` 会显示只含开关、手势、缩放比例与加载状态的本机诊断信息，并临时防止自动锁屏；普通启动不显示或轮询这些信息。

登录流程为：现有 Keychain 设备凭据 → 原生 `POST /web/ticket` → 60 秒、仅可兑换一次的票据 → 原生网络层 `POST /web/launch` → 将经过校验的网页 Cookie 写入 WKHTTPCookieStore → WebView 以普通 GET 打开同一 HTTPS origin。票据只放 POST 请求体，设备 Bearer 不交给网页，DSH 自己的进程登录 token 与浏览器 Cookie 均保留在服务器进程中。

网关发出的 `__Host-yun-dsh-web` Cookie 使用 Secure、HttpOnly、SameSite=Strict 和 Path=/，有效期最多七天且不超过设备有效期。服务端仅保存其摘要；每次网页、资源或 RPC 请求重新检查设备是否有效，设备撤销后最迟一秒关闭现有 WebSocket／流式响应。重新连接会替换该设备先前的网页会话。服务器重启会清空网页会话，App 重新打开入口或点击「重新连接」即可通过已有配对恢复。

此入口提供完整的 DSH owner 网页能力，权限大于受限的原生聊天 API。它不向网页注入手机工具、JavaScript 消息桥或本地文件权限。网页顶层导航限定在已配对的同一 HTTPS origin，主动点击的外链交给系统浏览器。

服务端默认不启用 Web 网关。部署时在现有 `el-bot-mobile` 配置增加：

```yaml
web:
  enabled: true
  port: 3082
```

同时使用 `packages/mobile/deploy/compose.override.yaml` 的 `DSH_WEB_GATEWAY=http://dsh:3082`，将 Traefik 对该 hostname 的请求全部转给 mobile-proxy。认证网关位于 DSH 容器内，使用其实际私有监听地址访问原有 Web 服务；不增加宿主公网监听，也不改变桌面的 loopback 隧道。未认证访问 `/` 和 `/api/remote.mux` 仍返回 404，原生 API 未认证返回 401。

更新需要同时保留旧 mobile 包、profile patch、compose override 和 Traefik 配置，以便恢复 API-only 部署。现有设备状态文件及 Keychain 凭据无需迁移或重新配对。

### 网页会话调用本机 iCTRL

服务端设置 `phone.enabled: true` 后，在 DSH Web 右上角点击「开启手机控制」。小云先验证本机 iCTRL 的既有配对，再创建专用移动会话并导航到该会话；授权仅持续十分钟。可以在网页输入「打开 Chrome，短暂停留后返回小云」，由云端模型调用 `phone_open_app`。支持 `chrome`、`safari`、`settings`，默认返回小云；`return_to_yun=false` 会停留在目标 App。停止控制、切换账号、离开网页入口或授权到期会关闭通道。

流程为：DSH 网页提交会话消息 → 模型工具调用 → 云端按真实 Agent 的 session ID 匹配授权 → 小云使用设备 Bearer 与独立通道凭据主动领取 → 本机加密 iCTRL RPC → 回传结构化执行收据 → 模型显示结果。网页 Cookie 不能领取任务；网页没有原生脚本桥，iCTRL 密钥也不上传。网页 hash 只用于导航，不是控制授权。QQ 与其他会话不能继承该会话的手机授权。

手机在前台每秒领取一次任务，单个执行步骤借用有限的 iOS 后台时间完成切 App 和提交收据，不声明永久后台在线。任务二十秒到期，交给手机后不重投；调用身份去重，收据可重复提交，动作不会随网络重试重放。任务取消或连接丢失后，已交付但不能确认的执行记为 `unknown`，不会假报成功或自动重新执行。停止控制无法撤销已经发给运行器的一次打开动作。

控制通道和排队任务仅存服务器内存；服务重启后必须重新开启，不恢复旧动作。手机锁屏、运行器未启动或 iCTRL 配对被撤销时不能执行。当前工具只打开指定 App，不开放任意 RPC、点击、输入、截图、账户操作或文件访问。

DSH rc.5 的工具调度器使用模块内部 Symbol。npm 的 peer 依赖树会留下多份同版本 `dsh-tools`，导致真实工具调用在分派前报 `Cannot read properties of undefined (reading 'prepare')`。云端镜像通过 `tool-runtime.mjs` 的 Node resolve hook 将该模块统一到宿主副本，不改写供应商文件，也不绕过权限检查。现有镜像可复制该文件并叠加 `packages/mobile/deploy/phone.override.yaml`；新镜像由 entrypoint 预加载。升级 DSH 时必须重新审查此适配。`node --import /opt/dsh-runtime/tool-runtime.mjs /opt/dsh-runtime/tool-runtime-smoke.mjs` 离线核对模块标识、真实工具分派和 guard 拒绝，无需凭据或模型调用。

Debug 真机验收可使用 `--show-dsh-web --phone-web-smoke`。该参数在专用会话中通过真实网页编辑器填写并提交一次 Chrome 指令，仍走模型工具与手机领取链路，不直接调用云端 prompt API 或运行器。验收回执 `Library/Caches/phone-web-verification.json` 只记录任务／会话 ID、App、状态、返回结果和时间，不记录任何密钥。

### 会话资料

会话列表显示可获取的 QQ 群名或私聊昵称、最近收到的消息摘要和活动时间。进入会话后，右上角信息按钮打开详情页，展示群简介、分类、标签、成员数、机器人群内身份、入群时间、消息接收模式，以及会话模型和运行状态；有值才显示。平台允许主动推送的状态仅表示 QQ 平台设置，不改变应用自身的发送权限。

完整会话 ID、机器人 AppID、群或用户 OpenID、最近发送者 OpenID 和消息 ID 集中在详情页，支持选择与复制。OpenID 不是数字 QQ 号或群号；没有可靠群头像来源时继续使用 QQ logo。

群资料通过已有 QQ SDK 的只读接口获取，并按群缓存、合并并发请求和限制频率；接口未授权时显示权限说明。资料只关联当前允许的 QQ 对象及偏好文件中明确绑定的会话，不会创建会话或触发模型请求。最近消息摘要从升级后收到的事件开始记录，只保留有限的展示字段，不保存原始事件、鉴权令牌或附件下载地址。旧服务没有详情接口时，客户端仍可查看已有会话信息。

### 原生应用

```sh
pnpm --filter @el-bot/mobile build
pnpm --filter @el-bot/mobile typecheck
swift test --package-path packages/yun-apple
pnpm --filter @el-bot/client mobile:ios
./script/build_and_run.sh --verify
```

原生工程为 `apps/ios/Yun.xcodeproj`，可从 `project.yml` 用 XcodeGen 重建。模拟器使用仅适用于该 SDK 的本地 ad-hoc entitlement 验证 Keychain；真机构建需要自己的开发团队、证书和 provisioning，不使用模拟器身份。Mac 与 iOS 源码共用 `packages/yun-apple`。

### USB 真机安装

连接并解锁 iPhone，开启开发者模式，在本机 Xcode 中准备可用的 Apple Development 证书和覆盖该设备的 provisioning profile。下面的团队与设备变量由本机设置，不写入项目。已有 profile 可使用自动签名离线选择；缺少 profile 时先在 Xcode 中完成配置。

```sh
xcrun devicectl list devices
xcodebuild -project apps/ios/Yun.xcodeproj -scheme Yun -configuration Debug \
  -sdk iphoneos -destination "id=$YUN_IOS_DEVICE" \
  -derivedDataPath apps/ios/build/device \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$YUN_APPLE_TEAM" \
  CODE_SIGN_IDENTITY='Apple Development' CODE_SIGNING_ALLOWED=YES build
codesign --verify --deep --strict apps/ios/build/device/Build/Products/Debug-iphoneos/Yun.app
xcrun devicectl device install app --device "$YUN_IOS_DEVICE" \
  apps/ios/build/device/Build/Products/Debug-iphoneos/Yun.app
xcrun devicectl device process launch --device "$YUN_IOS_DEVICE" cn.elpsy.elbot.client
```

真机单独配对，不复制模拟器或 Mac 的 Keychain。签名成功及 `devicectl` 报告启动后，还需在解锁的手机上核对界面、配对和会话；锁屏时的启动成功不能作为完整验收。

现有服务器通过 Traefik 和独立移动代理公开 HTTPS，部署样例保留在 `packages/mobile/deploy`。升级只替换 mobile 包，不重建 QQ profile、不迁移历史、不修改模型或凭据。先备份、检查所有任务空闲，再重启 DSH 并核实健康、QQ ready、分组 ready、现有设备恢复，以及未授权访问拒绝。回退恢复旧 mobile 包再重启；设备状态位于原 profile 下，不在包目录中。

## 本轮验收

2026-11-06，用户明确授权 Mac / iOS 模拟器配对及发布 `0.1.1`。发布前确认 36 个会话均无运行中任务；保留旧包备份后重启，恢复健康及 QQ（`102275406`）在线。公网无凭据访问 mobile status 返回 401，根路径与通用 `/api` 返回 404。

Mac 与 iOS 模拟器各自配对，使用同一独立测试会话完成真实文本续聊：Mac 让模型记住校验词，iPhone 在原会话追问并获得正确结果，手机消息与回复随后回到 Mac。发布后的历史不再展示内部运行上下文，Mac 原凭据继续有效。最终构建重装并重新启动后，两端均自动恢复配对和同一会话的四条消息，没有重复发送。未向现有 QQ 私聊或群聊额外发送验收消息。

随后在用户明确授权下，将开发签名版安装到 USB 连接的 iPhone 15 Pro（iOS 27.0.1），确认未携带模拟器签名身份。真机单独配对后加载 36 个会话，状态页显示 QQ 已连接；在同一独立测试会话追问之前的校验词，获得正确回复并同步回 Mac。终止并重新启动 App 后，配对及包含真机问答的历史恢复，无须重新输入配对码。手机最后停留在可继续输入的聊天页面。

自动测试覆盖配对码到期/重放、撤销、接口边界、冷历史投影、同会话请求身份、发送超时及重启重试、历史收据自动确认和本机私有存储。连接方式的行业依据与后续 OAuth 演进见[连接方案调研](./native-connectivity-research.md)。

2026-11-07 增加原生会话模型菜单。移动端只调用 DSH `modelCatalog()` 和 `selectModel()`，并新增 `GET /sessions/:id/models`、`PUT /sessions/:id/model`。发布前检查最近会话均以 `turn/end` 或空闲期模型选择结束；替换 `@el-bot/mobile` 包后容器恢复健康，QQ 和 workspace 分组均为 `ready`。公网临时设备验证返回 4 个提供方、48 个模型选项，并以当前 `deepseek-api/deepseek-flash` 路由完成同模型切换后撤销临时设备。新版已签名覆盖安装到 `云游的iPhone`，安装后 App 进程正常启动，已有设备凭据未删除。

2026-11-07 部署 `@el-bot/mobile 0.1.2` 的认证 Web 网关，并将包含「DSH Web」标签的新版覆盖安装到同一 iPhone。部署前确认 40 个会话均无运行中任务，备份原 mobile 包、profile patch、compose override 和 Traefik 配置后更新；DSH 与 QQ 健康状态恢复，现有设备凭据继续有效。

真实临时设备验收得到票据接口 200、兑换 303、网页 200；撤销该设备后同一 Cookie 再访问为 404。临时设备已撤销。公网未认证根路径为 404、原生状态接口为 401。iPhone 使用原有配对自动登录，实际页面显示远端工作区和模型选择；终止重开后再次得到 HTTP 200 与 DSH 页面就绪信号，无须重新输入配对码。验收未发送模型任务，也未向 QQ 会话发送消息。

回归测试覆盖一次性票据、到期、来源限制、原始 DSH Cookie 不外泄、设备撤销、会话轮换、WebSocket 断开，以及原生端拒绝外部登录地址、不安全或可被脚本读取的 Cookie。Debug 仅在 App 私有缓存记录无凭据的页面就绪回执与本机截图，不上传媒体。

2026-11-07，在同一 iPhone 15 Pro（iOS 27.0.1）完成两轮独立 XCUITest 验收，均为零失败。真实双指手势在关闭时保持 `zoomScale=1`，开启后达到约 `1.82`，关闭后恢复为 `1`；刷新保留开启状态，冷重启 App 分别保留开启和关闭设置。

同源 URL 历史验证后退、前进和按钮可用状态，重新连接恢复 HTTP 200；切换到设置页会隐藏网页操作按钮，返回后恢复。普通启动不显示诊断信息，最终保留禁用缩放。网页内仅打开浮层、未产生 URL 历史的操作不会启用浏览器后退按钮。

随后按使用偏好将后退、前进和刷新移至顶部原生 Liquid Glass 工具栏，「重新连接」移入齿轮菜单，并增加默认关闭的上下回弹开关。新增真机 XCUITest 用时 80.450 秒、零失败：关闭时实际拖动的最小纵向偏移为 `0`，开启后为约 `-142.67` 点，松手回位；刷新和冷重启保留开启状态，关闭后冷重启保持禁用；顶部按钮位置、实际历史前进／后退和普通启动隐藏诊断信息均通过。最终双指缩放与上下回弹都保留为禁用。

2026-11-07 03:58 完成 `@el-bot/mobile 0.1.3` 的网页到本机 iCTRL 全链路验收。iPhone 内嵌网页编辑器实际提交 Chrome 指令，远端 DeepSeek Flash 调用一次 `phone_open_app({app: "chrome", return_to_yun: true})`，手机主动领取后调用本机运行器，成功打开 Chrome 并返回小云。手机收据为 `status=succeeded`、`launched=true`、`returned_to_yun=true`；同一云端会话日志恰有一次工具调用及一次成功结果，最终 `turn/end=completed`，网页显示成功回复和用时 9 秒。该成功会话未使用终端或其他工具，没有向 QQ 发送验收消息。随后以普通网页入口重新启动，确认历史中的成功回复仍可查看，关闭验收诊断。

此轮还修复了两类启动边界：会话列表就绪不代表网页已经恢复完先前会话；恢复中的视图引用也不能立刻替换。浏览器端现在等待实际主会话历史打开、退出同步引用发布后再导航，并仅在目标主会话真正打开时给出验收就绪信号。测试覆盖初始列表、旧会话恢复、同步回调重入、目标加载和手动切走；保存旧会话后冷启动新控制会话的真实浏览器复验通过。工具运行库副本问题另由离线测试先复现，再验证统一模块后的分派和权限拒绝；既有 QQ 安全 smoke 继续通过。

收尾验证：mobile 的 33 项 TypeScript 测试、Apple 共享包测试、定向 lint、全仓 `pnpm lint` 与 `pnpm typecheck` 均通过；真机和模拟器构建通过。合并并行新增文案后，再次通过 Apple 文案一致性检查。临时验收设备均已撤销，没有将运行器密钥、网页 Cookie 或测试认证文件加入 Git。当前功能仍要求手机解锁、运行器在线和小云前台接收任务；不等同于全天后台或重启后自动运行。

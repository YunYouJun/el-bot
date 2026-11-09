# 小云原生会话接口

macOS 14 / iOS 17 原生客户端通过 `packages/yun-apple` 共用模型、HTTP 客户端、Keychain、待确认消息状态和 SwiftUI 会话组件。默认 HTTPS 入口为 `https://bot.yunle.fun`，连接已有 DSH `0.2.2-rc.1` 与官方 QQ 插件 `0.5.5`。当前机器人为小云 Bot（AppID `102275406`）。

手机设备工具和跨 App 实验见[小云手机助手实施计划](./ios-device-assistant.md)。首版保留云端 DSH，原生 App 通过本机配对调用独立 iCTRL 运行器；设备工具页不向云端提供通用 RPC。

## 定时提醒通知

双通道提醒需要分别配置 QQ 的主人会话恢复与 iOS 的 APNs。DSH 原生任务显示已投递，仅表示提醒写入云端会话，不能用来判断 QQ 或手机通知已经送达。

iOS 设置首页按账号、通用和机器人分组，账号管理与提醒通知进入二级页面，语言选择保留在首页。「设置 → 提醒通知」使用原生开关；首次开启请求系统通知权限，允许后将 APNs 设备令牌通过已配对的 HTTPS 接口注册到当前实例。关闭开关会注销当前设备的云端推送，并记住此实例的选择，回前台或重启不会自动重新开启。系统拒绝通知时提供系统设置入口。授权返回和普通刷新保留已有状态；等待 APNs 令牌与连接通知服务在后台完成，不插入临时进度行，避免开关切换时页面闪烁，连接失败仍显示错误提示。最近推送回执保留在通知详情中。

手机退到后台后由 APNs 展示通知，不依赖前台轮询。点击通知重新验证当前实例和会话访问权限，再打开对应会话。App 不为提醒新增本地聊天缓存。

部署前在 Apple Developer 为 `fun.yunle.bot` 开启 Push Notifications，重新生成包含 `aps-environment` 的签名描述文件，并分别创建 Production、Sandbox 两把 Topic Specific APNs P-256 密钥，各自只允许 `fun.yunle.bot`。App Store Connect API 密钥不能替代 APNs 认证密钥。Debug 使用 `development`／sandbox，Release 使用 `production`；新权限必须随重新签名的 App 安装后才能生效。

云端使用 `packages/mobile/deploy/notifications.override.yaml`，配置 `YUN_APNS_TEAM_ID`、生产密钥的 `YUN_APNS_KEY_ID`／`YUN_APNS_KEY_FILE`，以及沙盒密钥的 `YUN_APNS_SANDBOX_KEY_ID`／`YUN_APNS_SANDBOX_KEY_FILE`。发送时按设备环境选择独立密钥与 JWT 缓存。`.p8` 只保存在服务器私有目录，以只读文件挂载且仅容器 UID 1000 可读，不写进镜像、profile 或 Git。没有配置 APNs 时接口返回 `configured: false`，App 显示尚未配置，不宣称推送已开启。

`GET /el-bot/mobile/v1/notifications` 返回当前设备的配置、注册状态和最近回执；`PUT` 注册设备令牌与环境，`DELETE` 停用此设备通知。接口要求有效设备 Bearer，并沿用 Origin 校验。令牌和最近 24 小时、最多 500 条回执保存在 `<profile>/el-bot-mobile/notifications.json`（目录 `0700`、文件 `0600`）；状态接口不返回令牌，回执不保存通知正文。

只观察宿主真实的 `source.kind: schedule` 事件，并在该轮结束后发送生成的提醒；普通聊天或伪造的提醒文本不会触发。每条提醒按会话、消息与设备持久去重，发送前先登记「结果未知」。超时、进程重启或丢失响应不会自动重发，避免重复通知。设备撤销或到期后停止推送；APNs 返回失效令牌时清除注册。回执区分「Apple 已接收」「Apple 已拒绝」「结果未知」，Apple 接收不等于用户已看到通知。

验收需要新签名的真机 App、主人允许系统通知，以及云端 APNs 配置。离线测试和模拟器编译不代表完成真实 QQ／APNs 双通道送达。

2026-11-09 真机双通道验收：`fun.yunle.bot` 推送权限和新开发描述文件已配置，生产、沙盒两把专用密钥部署到云端。iPhone 授权并注册沙盒令牌后，北京时间 21:35:16 的一次性原生提醒只投递一次，21:35:18 获得 APNs `accepted`；用户确认 QQ 私聊和手机通知均已收到。未新增周期任务，也未上传 TestFlight。

2026-11-10 构建 5 真机验收：设置首页按账号、通用和机器人分组，账号与提醒通知进入二级页面。关闭通知后云端注册数从 1 降至 0；App 退后台再回来、终止进程后冷启动均保持关闭，注册数仍为 0。确认新进程与旧进程不同后，重新开启开关，云端恢复一个沙盒注册，最终让 App 回到后台。签名编译、Swift 测试及 lint 已通过；XCTest runner 初始化超时，交互验收改用 iPhone 镜像，结合真实云端注册记录和进程生命周期核对，不能将其表述为 XCTest 用例通过。

2026-11-10 构建 6 移除通知连接期间临时插入的进度行。使用真实设置视图和离线状态替身在模拟器测量，关闭、连接中、开启三个状态的页脚位置保持一致，原有约 52 点位移消失。Debug `0.1.0 (6)` 已签名并覆盖安装到 iPhone 15 Pro，核对安装版本与新进程，`application-identifier` 和沙盒推送权限正确。578 项 TypeScript 测试、Swift 测试、全仓 lint、完整类型检查、Apple 文案一致性检查及 mobile／DSH 构建通过。手机使用中导致镜像无法连接，本次未复验真机开关交互。

## iOS 状态与手机能力

状态页的「远程宿主机」展示宿主机整机 CPU 使用率、内存已用／总量、磁盘已用／总量和使用率；「远端运行环境」继续描述 Docker 容器与 API 进程，两组数据互不替代。宿主机采样每 15 秒一次，CPU 为约一秒内的忙碌时间占比；内存使用量为 `MemTotal - MemAvailable`，磁盘比例与 `df` 一致，保留块不计入普通用户可用容量。详情中可查看可用空间与采样时间。前台状态页每 15 秒刷新，超过 60 秒的快照或离线保留的数据标为「上次快照」，不将采集失败显示成零占用。

Linux 宿主机使用 Python 3 标准库采集 `/proc/stat`、`/proc/meminfo` 和明确配置的文件系统容量。安装与接入：

```sh
# On the Linux host, from packages/mobile/deploy (or a copy of that directory).
sudo sh install-host-metrics.sh
# Append this override to the existing deployment's complete Compose file list.
sudo docker compose -f compose.yaml -f compose.override.yaml \
  -f host-metrics.override.yaml up -d --no-build dsh mobile-proxy
```

采集服务使用独立无登录账户，原子写入 `/var/lib/el-bot-host-metrics/host.json`；容器仅只读挂载该快照目录，不挂载宿主 `/proc`、根目录或 Docker socket。移动包通过可信环境变量 `YUN_HOST_METRICS_FILE`（或部署配置 `hostMetricsFile`）读取快照，校验版本、长度、时间与数值后，仅向已配对设备的 `GET /status` 返回可选 `host` 字段。旧服务和未配置采集器时仍能读取原有状态。默认只采集宿主根磁盘 `/`；额外挂载盘可通过 systemd override 的 `ExecStart` 重复指定 `--disk / --disk /data`。停止采集后仍保留最后快照，并明确标记过期。卸载可停用 timer、移除 Compose override 并恢复原移动包，无需重新配对。

更新移动包时，以 `docker inspect el-bot-dsh` 的实际挂载来源为准；已有升级 override 可能将其指向某个历史发布目录，替换部署根目录的 `mobile/` 不会生效。新包应写入独立发布目录，并在最后一层 Compose override 中同时绑定 DSH 的移动包和代理的 `dist`，保留旧绑定以便回退。未显式配置路径时，接口尝试读取约定的 `/run/el-bot-host-metrics/host.json`，缺少文件时仅省略宿主机指标。

状态页分别展示远端 API 是否可达与 QQ 连接状态。`GET /status` 的可选 `runtime` 字段提供主机名、系统内核、架构、Node.js 版本、可用 CPU 并行度、API 进程运行秒数和驻留内存（RSS，字节）；这组信息独立于 QQ 健康文件，只向已认证设备返回。容器部署时描述的是进程所在的容器环境，不代表物理宿主机的资源用量。旧服务未返回 `runtime` 时，客户端仍可查看 QQ 状态；刷新失败时保留的运行信息标为上次快照。会话统计隐藏零值。

手机能力页聚焦控制器连接、配对和浏览器往返验证，使用原生分组表单与 SF Symbols。系统版本、电量、低电量模式、温度、可用存储、控制器版本、设备读取与原始 JSON 放在「诊断详情」，执行结果按需进入详情查看。浏览器验证仍需确认占用屏幕，配对批准与本机凭据校验保持不变。

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
| `GET /status` | 当前进程的 QQ 连接状态与可选远端运行环境 |
| `POST /system/restart` | 请求云服务优雅退出并由容器拉起；`force` 可中断运行中任务 |
| `GET /personas`、`POST /personas` | 人物卡列表、预览、导入、启用、恢复默认与检查更新 |
| `POST /web/ticket` | 已配对设备显式请求完整 DSH Web 的一次性登录票据 |
| `POST /web/launch` | 原生网络层兑换票据，设置独立网页会话 Cookie |
| `GET /account` | 查询账号同步能力与轻量偏好 |
| `POST /account/instances` | 用云乐坊 SSO 双证明查询账号名下在线云端 |
| `POST /account/link` | 校验云乐坊 SSO 身份断言后关联账号 |
| `PUT /account/preferences` | 保存白名单内的语言偏好 |
| `DELETE /account` | 解除本实例的账号关联 |
| `POST /pair`（票据模式） | 用账号中心签发的一次性入会票据兑换本实例设备凭据 |

配对、账号发现、入会票据兑换和 Web 票据兑换不要求已有设备 bearer，其余原生路径均需要 `Authorization: Bearer <device-token>`。Web 票据必须先由已配对设备申请。请求 JSON 上限 20 KiB，人物卡接口单独放宽至 256 KiB 以容纳文本的 JSON 转义；人物卡原文仍限 32 KiB。新消息上限 4,000 个 UTF-16 单元。配对限制为全局每分钟二十次、最多二十台有效设备。响应禁止缓存。公网代理不挂载 DSH home；完整网页和 RPC 由下述 Web 网关单独认证，管理员 socket 始终不公开。

账号路由默认返回 503。启用时需给 `@el-bot/mobile` 配置 `account.cloudbaseEnvId`、`appId`、`clientId`、`issuer`、`jwksUrl`，并在云乐坊 SSO Registry 注册对应的公开客户端和精确 HTTPS 回调。网关校验 `@yunlefun/sso` 的双证明后，只持久化经服务端验证的用户标识、展示字段和语言偏好；不保存 SSO code、CloudBase ticket、access token、身份断言或聊天历史。设备配对仍是读取和续聊会话的授权边界，账号关联不会绕过它。

账号发现是独立于偏好同步的可选层：配置 `discovery.account`、`discovery.enrollmentSecret`、`discovery.instances` 后，`GET /account` 会返回 `discovery.enabled/canEnroll`，`POST /account/instances` 用同一套双证明返回账号名下两分钟内心跳有效的在线实例。只有再注入 `discovery.tickets` 的账号中心签发器后，`canEnroll` 才为真：签发器用 SSO 双证明为选中实例生成绑定 `userId`、`instanceId`、`publicOrigin`、设备名和随机 `clientId` 的 60 秒票据；目标实例验证票据并兑换一次独立的 30 天设备凭据，票据随即因 `clientId` 重放检查失效。在线状态来自目录服务的 `lastSeen` 心跳，不能用设备凭据的 30 天有效期冒充。当前仓库只提供协议、注入边界和负向测试；真实全局目录、SSO client 注册、票据签发服务和 proof adopter 仍由云乐坊账号中心提供，未配置时不显示假登录或假列表。

`0.1.1` 修复历史投影：DSH 内部 runtime/approval 上下文虽然也可能使用 `user/message` 事件，但不作为人类对话展示；只有 `source.kind === 'user'` 的用户文本和助手文本进入原生界面。人类输入的 `source.rpcId` 映射为可核对的 `requestId`，不下发完整 source 或工具结果。

## 接续、发送与生命周期

客户端沿用服务端的 session ID，不复制模型上下文或另建聊天数据库。读取历史使用公共 Session Controller，不激活冷会话；发送沿用其任务准入、模型选择和持久请求去重。App 续聊 QQ 关联会话不等于向 QQ 目标再次发送消息；QQ 收发继续由官方插件处理。

新建会话采用惰性创建：点击「新建会话」只打开本地草稿页，不调用 `POST /sessions`；首次点击发送时才创建云端会话并提交消息。未发送就返回不会留下空会话，草稿只保存在本机界面状态。会话列表隐藏 DSH `sessionListMetadata.blank` 为真的记录；标题尚未生成时，服务端使用 `titleInput.first` 的首条提示词作为临时标题，DSH 原生 `title` 投影生成后自动替换。标题摘要由 DSH 完成，移动端不再调用模型生成第二个标题。

发送前将待确认文本和 request ID 原子写入本机私有目录（目录 `0700`、文件 `0600`）。超时后不自动创建新请求；用户明确重试使用原 ID。重新读取历史若找到同一收据，则清除待确认状态及原草稿。客户端重启也保留这一关联，避免重复执行。

原生会话前台轮询：列表五秒，聊天运行中两秒、空闲五秒。后台挂起停止观察，回到前台补齐；退出客户端不停止云端 QQ 或模型任务。原生聊天当前只提供文本，不提供逐字流式、附件、推送或原生工具审批；完整管理和审批可通过 App 内的 DSH Web 入口完成。

云端服务支持主人私聊发送 `/restart`，或使用 iOS「状态 → 服务操作 → 重启小云服务」。两者都先检查可用的 DSH `appExit`，再等待 QQ 回复或原生 HTTP 响应完成后优雅退出；`docker compose` 的 `restart: unless-stopped` 负责重新拉起，通常 10–30 秒恢复。存在运行中的任务时默认拒绝，发送 `/restart force` 或在 iOS 确认框中确认后才会中断并重启。无法自动拉起的环境只返回升级提示，不直接调用 `process.exit`。

原生会话列表提供「全部／QQ」来源筛选，再按更新时间分段：今天、昨天、7 天内、30 天内，更早的记录按月份归档。搜索匹配标题、workspace、模型和来源平台，再对匹配结果重新分组。QQ 会话显示企鹅 logo，同时保留私聊／群聊文字标签、workspace 名称与当前模型。

列表及历史摘要的可选 `source` 字段包含 `platform: "qq"` 与 `kind: "direct" | "group"`。服务端优先通过 QQ 分组适配器的工作区目录识别来源，支持自定义目录；适配器尚未提供服务时，识别默认 `.dsh-qqbot/workspaces/<AppID>/private` 和 `groups` 目录。分类不依赖可编辑的会话或工作区标题，不下发 QQ OpenID。旧服务端未返回来源时仍可在「全部」中查看会话，客户端不会根据名称猜测 QQ 来源；需同时升级 mobile 包和原生客户端才能完整使用来源筛选。

iOS「状态」页复用 `assets/brand/el-bot-cloud.svg` 的三弧云朵与双竖眼设计。上下滚动带动云朵摇晃回弹，在云朵周围拖动时身体与眼睛跟随手指，轻点显示眯眼问候。动画不依赖配对，连接信息仍使用真实云端状态；离开页面或进入后台停止眨眼，系统「减弱动态效果」开启时关闭运动与自动眨眼。Debug 构建可传入 `--show-bot` 直接打开此页，便于独立验收。

聊天输入框上方的模型名称是原生菜单。目录来自 DSH 公共 `sessionController.modelCatalog()`，切换调用 `sessionController.selectModel()`；移动端不读取或改写 DSH 内部会话文件。控制器会恢复目标会话、按当前提供方目录校验 exact provider/model、串行持久化选择，并以规范化后的选择响应。运行中的请求继续使用开始时捕获的模型，新选择应用于下一次模型请求。跨设备修改通过会话列表的持久投影回传，原生端会在下一次刷新时更新。

### 上下文与压缩策略

普通会话与 QQ 群聊顶部以小圆环直接显示上下文占用百分比，点击圆环打开信息页。没有容量或占用数据时显示「—」，不伪造零占用；圆环进度封顶，文字保留真实超限百分比。沿用现有前台轮询更新，群聊将会话原生投影随已有 `GET /sessions/:id/qq` 回包返回，不额外增加轮询请求。

会话右上角「信息」中的「上下文与记忆」读取 DSH 原生 `contextPressure` 投影，优先显示下一次请求的 `projectedTokens`，没有估算时回退到最近请求的 `pressureTokens`。占用不是累计计费 token，包含缓存输入，切换模型后需等待请求更新；缺少容量时只显示 token 数，缺少统计时不显示虚假的零占用。

`GET /sessions/:id/info` 的可选 `context.policy` 通过原生 `agentPresets.serviceFor` 读取压缩器的有效配置，并应用 exact provider/model 覆盖。运行中的 Agent 使用其已绑定版本；冷会话仅租用当前预设 scope 读取策略，不创建 Agent、不调用模型，并标注接续后应用。预设缺失或服务端不支持时保留会话信息与管理入口。只下发压缩开关、触发比例、原文保留量及预留空间，不下发完整插件配置或凭据。

iOS「前往 DSH 管理」关闭信息页并切换到现有 DSH Web 标签，沿用设备配对和原生 Web 登录票据；不在手机存储或修改策略。当前 DSH 版本没有单独的阈值表单，该入口进入完整管理界面。

2026-11-07 已部署 `context-20261107-1100`：仅替换既有只读挂载的 mobile 包，保留当前 DSH 镜像与四份 Compose 配置。切换前确认无运行任务并备份至服务器 `backups/context-20261107-1100.tgz`；只读验收确认 24 个会话返回真实占用、压缩策略可读、群聊回包包含同一统计。原有会话文件、配对与配置保留，临时验收设备已撤销，未发送 QQ 消息或触发模型任务。iPhone 15 Pro 已覆盖安装构建 4；真机 UI 自动化在 XCTest 与 IDE 建立连接时中断，未据此声称交互验收通过。

### 模型与 API Key 指南

iOS「设置 → 模型与 API Key」提供三步指南：打开当前云端 DSH，在「账号菜单 → 设置 → 模型 → 添加模型提供商」保存提供商与 Key，再回到聊天页选择模型。指南中的按钮复用已有设备配对与 Web 登录票据，直接切换到 App 的 DSH Web 标签；未配对时按钮禁用，并提示先连接云端。

首次成功连接后，会话列表显示可关闭的轻量提示；点击指南或关闭后，将状态保存在本机 UserDefaults，重启不再提示。模型目录成功返回但为空时，聊天输入区提供配置指南与刷新按钮；加载失败仍显示原有错误，不将网络失败解释为未配置模型。重新进入聊天或回到前台会刷新模型目录，手动刷新可以重新读取此前缓存的空目录。

指南说明会话模型的选择独立保存、下一次请求生效，以及云端默认模型用于没有单独选择的会话；已有模型可用时无需完成引导。模型 Key 继续由当前云端实例保存，原生 App 不新增密钥输入或同步接口。不同实例分别配置，设备访问凭据继续保存在本机 Keychain。Debug 构建可通过 `--show-model-guide` 独立打开指南检查布局。

## 会话归档、永久删除与群列表

iOS 会话列表支持左滑或长按操作，macOS 支持会话右键菜单。「已归档」分类可查看和恢复历史。归档状态使用 DSH 自身的 workspace registry 持久化，各端共享；运行中的会话及宿主报告仍有子任务、后台任务或日程活动的会话拒绝归档和删除。

左滑「永久删除」使用红色普通按钮发起确认，不能给该入口设置 SwiftUI 的 `destructive` 角色，否则系统会在确认前移除列表行，连同该行上的确认弹窗状态一起销毁。破坏性角色仅用于长按菜单和确认弹窗；会话行等云端确认成功后再移除。验收须分别覆盖左滑与长按入口，以及确认取消、删除失败后的保留与重试。

永久删除在 iOS 和 macOS 共用一次确认流程。点击删除入口后，服务端生成绑定设备、会话和当前活动时间的 60 秒一次性凭据，再显示包含会话名称、不可撤销及跨设备影响说明的确认弹窗；用户确认后才提交删除，取消不会删除历史。会话期间发生变化、确认过期、换设备或仍在运行都会拒绝。删除流程先建立 DSH 归档准入屏障，持久化删除意图，再解除 QQ 续聊绑定、清空待处理群上下文与最近消息摘要、释放所属 Agent、验证持久化写锁、移除该会话的 JSONL 目录及投影缓存。删除失败不返回成功；日志已移除但缓存清理未完成时保留可重试的删除入口，重启也会尝试完成未结束的操作。

永久删除桥接已验证 DSH `0.2.1-rc.5` / `0.2.2-rc.1` 的 JSONL 后端，通过后端的 `locate` 定位，会拒绝根目录之外的路径和项目／会话目录中的符号链接。旧进程在插件安装前已持有的普通 Web Agent 若无法取得所属 disposer，会保留删除意图并要求重启服务，不能强行删除仍被持有的文件。永久删除只移除选中的会话；独立备份和其他分叉会话里已有的副本需要分别管理。QQ 的消息去重、额度和安全摘要继续保留，删除不能重置防护配额。

归档当前 QQ 会话时先保留原绑定，立即恢复可继续同一会话。若归档期间有新任务进入或从群列表打开聊天，QQ 准入会先清理旧背景缓冲、切换到新上下文；此后恢复的旧群会话提供历史查看，当前聊天从群列表进入，避免恢复操作替换较新的群上下文。

「机器人群列表」在 iOS 会话列表右上角、macOS 侧栏单独提供，与会话历史独立保存。群名、成员数按可用权限显示；入群状态分为已加入、已退出和待确认。新目录从 QQ 会话绑定补录旧群，之后通过 `GROUP_ADD_ROBOT`、`GROUP_DEL_ROBOT` 和群消息事件更新，不能声称已完整同步平台的所有群。机器人加入的群均可打开聊天，已退出的群不能打开；没有逐群白名单或授权开关。

群目录保存于 `<profile>/el-bot-qq/groups.json`，会话删除状态和历史来源摘要保存于 `<profile>/el-bot-mobile/session-lifecycle.json`。删除历史后，群入口及群资料保留；再次打开只创建或恢复经过现有 QQ 安全准入的会话，不调用模型、不向 QQ 发送消息。

新增原生接口继续使用配对设备 Bearer 与 Origin 校验：

| 接口 | 用途 |
| --- | --- |
| `PUT /sessions/:id/archive` | 归档或恢复，正文为 `archived: boolean` |
| `POST /sessions/:id/deletion` | 准备一次性删除确认 |
| `DELETE /sessions/:id` | 提交绑定的 `confirmation` |
| `GET /groups` | 读取独立群目录 |
| `POST /groups/:id/conversation` | 打开该群当前会话或创建空会话 |

会话摘要增加可选的 `archived` 和 `readOnly` 字段，旧服务端缺少字段时仍兼容。上线需同时升级 `@el-bot/mobile`、`@el-bot/dsh` 和原生客户端。离线验证可运行 `pnpm exec tsx apps/dsh-cloud/session-management-smoke.mjs <隔离的 DSH npm 安装目录>`；固定版本真实 Cordis、Agent registry、workspace registry、JSONL 和存储表只使用临时目录，不建立 QQ 连接或模型任务。也可用 Node 执行该脚本，额外传入打包后的 mobile `dist/index.mjs` 路径。

2026-11-07 验证：全仓库 472 项 TypeScript 测试、36 项 Swift 测试、完整 typecheck 通过。固定 DSH 版本的真实组件离线验证覆盖归档／恢复、活动拒绝、Agent 写锁释放、日志与缓存删除，以及插件卸载后继续创建会话。iOS 与 macOS 编译通过；隔离的 SwiftUI 模拟器验收走通归档、恢复、第一次确认取消、第二次确认删除、保留群入口、禁用未获准群和重新进入聊天。上述过程不连接真实 QQ、不调用模型；尚未部署云端或安装真机。

## QQ 群聊视角与原生接管

QQ 群聊现在使用独立 SwiftUI 群消息页面：群成员消息在左，机器人发送记录在右；主人使用自己 QQ 在群内发的消息同样属于左侧成员消息。原生页面不再把模型会话日志当成 QQ 已发送消息。历史仅从该能力接入后收集，不补造无法获取的旧消息；入站正文单条最多 4000 字符，附件只显示文字占位。每会话保留最近 1000 条，存储上限 2 MiB，支持向前分页。

发送记录从现有 SDK 的消息发送边界采集，先记录发送中，再依据实际 QQ 消息 ID 回执标记已发送；明确拒绝标记失败，超时或缺少回执标记结果未知。主人手动发送单独标记「主人接管」，正文保持原文，标记只出现在 App 内。新记录不保存原始 QQ 事件、凭据和附件下载地址，目录和文件仍分别使用 `0700` / `0600`。

「接管发言」沿用 Web 的同一租约、暂停、在途回复等待、限流和发送去重。默认接管十分钟，显示剩余时间，并提供「恢复自动回复」；退出页面不立即结束租约。暂停未完成可重试，不会提前开放发送。接管期间仍显示实际收到的群消息；即使消息记录过程跨越租约到期，也不会把暂停时收到的消息补交模型。

手动输入使用原生多行输入框，最多 1200 字符。发送方式默认「回复最近消息」；没有有效回复依据时需等待新消息，或明确选择「主动发送」。点击「发送消息」直接发出，不再逐条弹出预览或二次确认。客户端在后台取得通过配对设备与会话双重绑定的发送凭据并保存到 outbox，发送仍受原有白名单和平台权限检查；发送失败不会自动切换方式或改写正文。

原生端将待发送文本与发送凭据 ID 写入私有 outbox 后才提交发送。超时和 App 重启都不自动重发，刷新可按持久化回执消除待确认状态；明确重试使用同一个发送凭据 ID。结果未知时先在 QQ 核对，「已核对 QQ，保留原文」只解除待确认状态，不发送消息。删除会话时同步清理群消息记录和本机对应 outbox，保留独立群入口；正在发送的接管消息也会阻止归档和删除。

移动接口为 `GET /sessions/:id/qq`（支持 `before` 游标）、`POST /sessions/:id/qq`（`begin/end/preview/send`）及 `GET /sessions/:id/qq/members/:senderId`（读取该成员的长期印象，没有时只返回成员标识）。配对设备 Bearer、Origin、当前 QQ 群会话、机器人入群状态及归档状态逐层检查，目标群由服务端当前绑定确定，不接受客户端传入任意目标。原生接管没有注册成模型工具。归档和被替代的旧会话只提供历史查看。普通原生模型会话保留原有输入与模型交互，群聊页保留模型切换及信息菜单。

服务端需要同时更新 `@el-bot/dsh` 和 `@el-bot/mobile`。传输记录位于 `<profile>/el-bot-qq/qq-transcript/`，移动预览授权位于 `<profile>/el-bot-mobile/qq-previews.json`，后者只含设备、会话、预览标识与有效期。可用 `node apps/dsh-cloud/group-chat-smoke.mjs <含 QQ SDK 的隔离 npm 目录> <构建后的 qq.mjs>` 验证真实 SDK 的离线入站、手动原文、回执和去重；脚本不启动连接，所有发送终止在本地桩。

2026-11-07 验证：全仓库 482 项 TypeScript 测试、37 项 Swift 测试、lint、完整 typecheck、iOS 模拟器编译与 macOS 编译通过。真实 QQ SDK `1.0.5` 的离线发送边界检查覆盖入站接收、手动原文、真实形状的回执、重复确认去重和恢复后的旧回复拦截。隔离的 iOS SwiftUI 验收走通左右消息视角、主人 QQ 消息归左、接管、输入、预览取消、确认发送、原文与接管标识展示、恢复自动回复；发送超时后的重启恢复由 Swift 测试验证只读取既有回执，不重发。以上使用本地桩，不连接真实 QQ、不调用模型；尚未部署云端或安装真机。

直发交互调整已通过本地验证：全仓库 482 项 TypeScript 测试、38 项 Swift 测试、lint、完整 typecheck、DSH Web 构建与 iOS 模拟器编译通过。Swift 测试覆盖单击发送、连续点击去重、成功清空草稿、目标不匹配拒绝发送，以及超时后重启只查询回执。本次未部署、未覆盖安装真机，也未向真实 QQ 发送消息。


## 构建与部署

### 原生人物卡

iOS 的「状态」页右上角和「设置 → 人物卡」进入同一个 SwiftUI 管理页面，无需打开 DSH Web。列表展示当前启用版本的名称和摘要，每行右侧的「切换」可直接启用该卡最新版本；若当前启用的是该卡旧版本，按钮显示为「更新」。点开卡片后可预览设定、选择历史版本并启用；macOS 侧保留右键快捷启用入口。「使用默认人设」停用人物卡。详情中的「检查更新」只保存并预览新快照，确认后再启用。

导入表单支持系统文件选择器、HTTPS Markdown 原文链接和公开 HTTPS Git 仓库。Git 来源可指定仓库内路径与分支、标签或提交 ID。文件在本机按 32 KiB 上限读取并验证 UTF-8，再作为文本上传；不向服务端发送可执行文件读取的路径。人物设定默认使用原生 Markdown 预览，支持标题、列表、强调、引用、代码块和表格，并可切换到「源码」核对原文，两种模式均可选择文本。不执行 HTML、不加载正文图片，也不打开卡片中的链接；切换人物卡或历史版本时重新显示预览。上传文件更新时需重新导入。

实施按三层拆分：

1. 移动接口：已配对设备的 bearer 与 Origin 校验通过后，只允许 `list/preview/import/use/disable/update`；校验来源、ID、版本和大小，然后以浏览器限制模式调用现有 `elBotPersonas` 服务。
2. 原生客户端：`YunCore` 定义响应模型与类型化请求，SwiftUI 提供列表、详情、版本选择和导入表单；统一呈现加载、错误、保存提示和重试入口。
3. 验证：用真实临时人物卡库覆盖设备撤销、跨端共享、导入不自动启用、固定版本和回滚，并验证 Swift 编解码及 iOS 编译。

云端必须加载新版 `@el-bot/mobile` 和现有 `@el-bot/dsh` 人物卡插件。移动端每次操作读取该插件的同一份库，不另建目录或保存独立的启用状态；未安装插件返回 `503 personas_not_configured`，旧服务端返回 404 时原生页显示升级提示。此功能不依赖 Web 网关。页面首次打开、回到前台或手动刷新时读取云端状态。

人物卡只作用于当前实例的 QQ 机器人；切换后下一次任务准入创建新会话，当前任务继续完成，普通 DSH Web 聊天不受影响。这里记录的是仓库实现，生产部署和真机文件导入仍需单独验收。

2026-11-07 验证：全仓库 460 项 TypeScript 测试、Swift 测试、lint、完整 typecheck 和 iOS 模拟器编译通过。另用实际 SwiftUI 页面与本机临时人物卡服务，在 iPhone 17 Pro / iOS 26.5 模拟器上通过 XCTest 走通列表、详情、启用、恢复默认、链接导入、导入后保持未启用和再次启用。验收服务使用隔离设备凭据和临时库，未连接真实 QQ；此结果不代表已部署生产或通过真机文件选择器验收。

### 内嵌 DSH Web

iOS 底部「DSH Web」使用 WKWebView 加载远端页面，保留原生会话与手机能力入口。不把前端构建产物、Node 或 DSH 引擎打进 App；网页随服务器更新。

内嵌网页默认禁用双指缩放，避免误触。点击 DSH Web 右上角齿轮，可切换「允许双指缩放」；选择保存在本机，刷新、重新连接和重启 App 后继续生效。关闭开关会恢复页面的最小缩放比例，普通滚动仍可使用。

DSH Web 使用顶部原生工具栏：左侧后退、前进，右侧刷新；齿轮菜单提供「重新连接」。iOS 26 及以上由系统提供 Liquid Glass。前进／后退状态跟随 WKWebView 的实际 URL 历史变化；没有对应历史时按钮禁用。

网页内部保留 DSH 默认侧栏和响应式布局，不注入抽屉或其他布局脚本。原生安全区背景跟随 WebKit 的页面背景色，减少上下边界的色差；网页首帧渲染和连接过程中使用系统背景色，暗色模式下进入不会出现白色闪屏。不镜像网页文字，也不改变网页控件的位置。

齿轮菜单的「允许上下回弹」默认关闭，开启后恢复网页到达上下边界时的弹性效果；设置保存在本机，刷新、重连和重启 App 后保留。开关控制原生滚动回弹，正常内容滚动仍可使用。使用 WebKit 会保留的 `bounces` 设置，避免单方向属性被后续视口更新覆盖。

缩放拦截使用原生双指手势的失败依赖。WebKit 在视口更新后可能自行启用内部手势，因此不能只依赖一次 `isEnabled = false`。Debug 验收参数 `--show-dsh-web --verify-dsh-web` 会显示只含开关、手势、缩放比例与加载状态的本机诊断信息，并临时防止自动锁屏；普通启动不显示或轮询这些信息。

网页准入流程为：现有 Keychain 设备凭据 → 原生 `POST /web/ticket` → 60 秒、仅可兑换一次的票据 → 原生网络层 `POST /web/launch` → 校验网页 Cookie → 启动仅监听 `127.0.0.1` 的原生代理 → WebView 以普通 GET 加载本机入口。云端网页 Cookie 只由原生代理通过 HTTPS 转发，不写入网页存储；WKHTTPCookieStore 仅保存本机代理的随机 HttpOnly 会话 Cookie。票据只放 POST 请求体，设备 Bearer 不交给网页，DSH 自己的进程登录 token 保留在服务器进程中。

网页账号菜单的「登录」是上游 DeepSeek 账号授权，与上述设备准入不同。已验证的 DSH `0.2.1-rc.5` 客户端提交 `window.location.origin` 作为回调来源，服务端 `loginOrigin()` 只接受带显式端口的 HTTP loopback 地址。直接加载云端 HTTPS 页面会在生成授权链接前被拒绝。因此 iOS 原生代理提供真实的 `http://127.0.0.1:<port>` 入口，原样转发网页、HTTP 流和 WebSocket；云端一跳仍使用系统校验证书的 TLS。端口按云端实例保存在本机，以保持网页本地存储；端口占用时重新分配，不复用其他实例的已保留端口。

原生层接住网页预先打开的空白窗口，仅将精确匹配的 DeepSeek 官方授权地址呈现在 SFSafariViewController 中。用户完成登录后，官方页面回调手机本机代理，再转发至原有 DSH 回调处理器；state、PKCE、授权码交换和云端凭据保存均由原有 DSH 实现。代理只有固定的 GET `/oauth/callback` 可免本机会话 Cookie 到达，且仅返回校验过的官方成功跳转，不返回错误页或其他云端内容。普通请求必须通过本机 Cookie、Host 和 Origin 检查，云端响应的 Set-Cookie 不交给网页；监听器不接受局域网连接。上游 DSH 源码、网页 DOM、默认侧栏和响应式布局均无需修改。

2026-11-07 真机验收：从原网页账号菜单进入官方授权页，用户手动完成登录授权；云端成功加载账号模型；原网页账号菜单出现「退出登录」，退出并重新启动 App 后仍保持登录，顶部快捷按钮继续存在。Swift 测试覆盖本机访问限制、流式转发、回调成功和失败时的内容隔离。

网关发出的 `__Host-yun-dsh-web` Cookie 使用 Secure、HttpOnly、SameSite=Strict 和 Path=/，有效期最多七天且不超过设备有效期。服务端仅保存其摘要；每次网页、资源或 RPC 请求重新检查设备是否有效，设备撤销后最迟一秒关闭现有 WebSocket／流式响应。重新连接会替换该设备先前的网页会话。服务器重启会清空网页会话，App 重新打开入口或点击「重新连接」即可通过已有配对恢复。

此入口提供完整的 DSH owner 网页能力，权限大于受限的原生聊天 API。它不向网页注入手机工具、JavaScript 消息桥或本地文件权限。网页顶层导航限定在当前原生代理的同一本机 origin；代理的上游固定为已配对的 HTTPS origin。主动点击的外链交给系统浏览器，DeepSeek 官方授权使用上述专用浏览器流程。

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

DSH rc.5 的工具调度器使用模块内部 Symbol。npm 的 peer 依赖树会留下多份同版本 `dsh-tools`，导致真实工具调用在分派前报 `Cannot read properties of undefined (reading 'prepare')`。云端镜像通过 `tool-runtime.mjs` 的 Node resolve hook 将该模块统一到宿主副本，不改写供应商文件，也不绕过权限检查。现有镜像可复制该文件并叠加 `packages/mobile/deploy/phone.override.yaml`；新镜像由 entrypoint 预加载。升级 DSH 时必须重新审查此适配。`node --import /opt/dsh-runtime/tool-runtime.mjs /opt/dsh-runtime/tool-runtime-smoke.mjs` 离线核对模块标识、真实工具分派和 guard 拒绝，无需凭据或模型调用。 DSH `0.2.2-rc.1` 已改用独立执行器管线，不再启用旧 Symbol 适配；同一脚本通过原生执行器验证新版分派与拒绝。

Debug 真机验收可使用 `--show-dsh-web --phone-web-smoke`。该参数在专用会话中通过真实网页编辑器填写并提交一次 Chrome 指令，仍走模型工具与手机领取链路，不直接调用云端 prompt API 或运行器。验收回执 `Library/Caches/phone-web-verification.json` 只记录任务／会话 ID、App、状态、返回结果和时间，不记录任何密钥。

### 会话资料

会话列表显示可获取的 QQ 群名或私聊昵称、最近收到的消息摘要和活动时间。进入会话后，右上角信息按钮打开详情页，展示群简介、分类、标签、成员数、机器人群内身份、入群时间、消息接收模式，以及会话模型和运行状态；有值才显示。平台允许主动推送的状态仅表示 QQ 平台设置，不改变应用自身的发送权限。

群消息气泡展示发送者头像，并在昵称前显示平台返回的群主或管理员身份标签；普通成员不额外占位。服务端只从入站事件的 `author.member_role` 记录白名单内的 `owner`、`admin`、`member`，不保存原始事件。旧消息没有角色字段时保持无标签；最近一条入站消息可由会话摘要补齐角色。

点击群成员头像会打开成员详情页，展示头像、昵称、群内身份、发送者 OpenID、机器人 AppID，以及这条消息的类型、发送时间和消息 ID，支持选择与复制。会话信息菜单不再重复展示最近收到的消息正文、发送者字段和这组消息标识。OpenID 不是数字 QQ 号或群号。会话列表和群消息气泡使用机器人 AppID 与发送者 OpenID 拼接 QQ 头像地址；只能展示发过言的成员，加载失败时回退到昵称首字或 QQ logo。群头像地址需要数字群号，官方群资料接口不提供该字段，因此群头像继续使用 QQ logo。

成员详情页在存在长期印象时显示「小云的印象」与更新时间；没有印象时整段隐藏，读取失败只显示一条可重试提示。成员身份以群事件的 `member_openid`（入站字段 `senderId`）为唯一键：同一 AppID 下按当前实测该值可跨群识别同一用户，因此任意已授权群的成员详情都会读取同一份印象；群历史、成员列表、会话绑定和权限仍按 `group_openid` 隔离，该身份也不跨机器人使用。印象保存于 `<profile>/el-bot-qq/member-impressions.json`，文件权限为 `0600`，不随群历史清理、会话轮换或归档删除；JSON 保留全局成员表与群关联表，升级时会从旧版按群存储的数据合并，同一成员取最新印象并保留所有群关联。JSON 是权威索引；同目录自动生成可读的 `member-impressions.md` 镜像，按群输出成员、发送者 OpenID、印象与更新时间，也是 `0600`。Markdown 由 JSON 生成，直接编辑不会回写。群聊仍然不开放任何工具，因此群成员无法直接写入；主人在已认证的 QQ 私聊中可通过 `qq_group_member_impression` 工具列出、读取、记录或清除印象，其他会话与群聊调用会被拒绝。单条印象最多 280 字符，每个群最多关联 500 名成员、实例最多保存 5000 名成员，超出时按最早更新时间淘汰。

2026-11-07 真机验收：云端更新后健康检查与 QQ ready 通过，iPhone 15 Pro 上群主标签和成员详情页正常显示；`--open-last-sender` 仅用于 Debug 截图验证。42 项 QQ 安全测试、61 项 Swift 测试、`@el-bot/dsh` 类型检查与 iOS 真机编译均通过。

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
xcrun devicectl device process launch --device "$YUN_IOS_DEVICE" fun.yunle.bot
```

手动选择已有描述文件时，将上述构建参数改为 `CODE_SIGN_STYLE=Manual`，通过 `YUN_IOS_PROVISIONING_PROFILE="$YUN_IOS_PROFILE"` 传入本机描述文件名称。工程仅对 iPhoneOS App target 应用该设置；不要全局传入 `PROVISIONING_PROFILE_SPECIFIER`，否则 Swift Package 的资源 bundle 也会被要求使用 App 描述文件而导致构建失败。推送验收还需核对签名后的 `application-identifier` 和 `aps-environment`，分别与 App ID、Debug／Release 环境一致。

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

2026-11-07 18:18，云端部署 `native-20261107-095727`，保留原有 45 个会话、5 个设备配对记录及 profile 配置。更新前停止服务并备份数据；新版镜像先以禁网容器通过 QQ 安全、实际 SDK 收发记录和实际 DSH 归档／删除检查，再切换上线。备份位于服务器 `backups/native-20261107-095727.tgz`，旧包和清单保留在对应 release 目录，旧镜像保留在 Docker 中。部署新增 `compose.native.yaml`，后续重启须同时加载既有三个 compose 文件及此覆盖文件；回滚仅恢复代码和镜像，保留当前数据卷与删除日志。

同一 iPhone 15 Pro 覆盖安装 `0.1.0` 构建 `2`，沿用原签名与 Keychain，无须重新配对，本机原有设置保留。真机归档、恢复、取消删除、二次确认永久删除及独立群入口检查通过，用时 29.885 秒；仅删除专门创建的验收会话，原有会话集合未变化。真实 QQ 群成员消息在左、机器人消息在右，手机接管、取消预览、原文确认、实际发送和恢复自动回复检查通过，用时 31.053 秒。平台回执与云端记录确认手机测试消息恰好发送一次。测试结束已恢复自动回复、撤销临时验收凭据并移除手机辅助测试 App。

群聊记录从接入时开始，仅保存机器人实际收到的消息和实际发送结果，不回补平台未提供的旧消息。真机自动化输入后应等待键盘布局稳定再定位发送按钮，以免坐标在键盘弹出时变化。

原生群聊气泡支持 Markdown 段落、列表、引用、代码和表格；QQ 的 `qqbot-at-user`、`qqbot-at-everyone`、旧版 `<@…>` 及指令标签显示为可读文字，指令标签不会执行或发送消息，代码示例保持原文。手机手动发送的消息继续按字面展示。

新的群聊记录会额外保存最多 12 个附件的展示字段。图片只接受 `*.qpic.cn`、`multimedia.nt.qq.com` 和 `multimedia.nt.qq.com.cn` 的链接，统一使用 HTTPS；签名下载地址仅保存在服务端私有的群聊记录中，不加入会话资料、模型输入或源码。iOS 使用独立的无 Cookie、无设备 Bearer 网络会话加载图片，限制下载大小和解码像素，点击可放大预览；链接过期或不受支持时显示占位并可重试。Markdown 图片和 `<qqimg>` 使用同样的图片来源限制。语音、视频和文件显示类型及可用的文件名，暂不提供播放或下载。旧版已经丢弃的附件地址无法回补。

2026-11-07 完成本地图文展示验证：43 项 QQ 安全与群聊链路测试、53 项 Swift 测试、全仓 lint 和 typecheck、DSH 构建与 iOS 模拟器构建通过。iPhone 17 Pro / iOS 26.5 的两项 UI 用例分别验证附件图片与预览关闭、Markdown 图片与 `<qqimg>`，并检查文件名、失效图片和混合排版。UI 验收使用隔离的共享包副本，通过 URLProtocol 注入模拟图片；图片加载和渲染代码沿用实际实现。此轮未更新云端或真机，不代表真实 QQ 图片接收链路已验收。

2026-11-07 19:41 完成云端与 iPhone 15 Pro（iOS 27.0.1）的真实群聊图文验收。云端最终补丁为 `qq-rich-20261107-1139`，在现用镜像上更新 DSH 展示适配包，保留宿主版本、配置、会话和五个设备配对记录；备份为服务器 `backups/qq-rich-20261107-1139.tgz`。新增的 `compose.rich.yaml` 须与既有四份 Compose 文件一起使用。回退时恢复该 release 中的 `compose.rich.before.yaml` 后重建 DSH 容器，保留当前数据卷。

实际通过已登录 QQ 向「机器人测试群」发送一条包含 @ 格式标签和 Markdown 的测试文字及两张相同 PNG。首张图片揭示真实附件使用 `multimedia.nt.qq.com.cn`，旧来源校验遗漏该域名；补齐服务端与 Swift 的 exact host 校验后重新构建、部署并覆盖安装，再次发送的 512×512 PNG 在手机成功加载。旧记录中被过滤的地址仍不能补回，未改写历史。

真机 XCTest 用时 16.863 秒、零失败：原配对自动恢复，标签显示为可读文字，实际 QQ CDN 图片展示、点开大图、关闭返回及冷启动后重新加载均通过。修复后 43 项 QQ 链路测试、55 项 Swift 测试、定向 lint 与真机签名构建通过；公网未认证原生 API 为 401、Web 为 404。临时验收凭据已撤销，真机测试辅助程序已移除。所有测试消息均在上述测试群中，机器人保持自动回复模式。

2026-11-07，原生会话列表增加轻量删除、归档及恢复反馈：操作期间保留会话行、显示进度并阻止重复操作；云端确认成功后，以约 0.2 秒的列表过渡淡出并补位。启用系统“减弱动态效果”时禁用列表动画。失败提示不会被后台轮询清除，旧的在途刷新也不能恢复已删除的会话。

本轮 Swift 测试 41 项通过，覆盖等待确认、失败后重试、重复删除拦截和旧刷新回包。独立 iOS 模拟器验证失败保留／重新确认成功（21.482 秒）及真实系统减弱动态效果（12.589 秒），录屏确认删除行淡出和相邻行补位。iPhone 15 Pro 覆盖安装构建 3 后，原有配对恢复、专用测试会话删除及群入口保留检查通过（15.038 秒）；仅删除新建验收会话，原有 45 个会话均保留，临时凭据和测试辅助 App 已清理。

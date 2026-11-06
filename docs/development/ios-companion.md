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
| `GET /account` | 查询账号同步能力与轻量偏好 |
| `POST /account/instances` | 用云乐坊 SSO 双证明查询账号名下在线云端 |
| `POST /account/link` | 校验云乐坊 SSO 身份断言后关联账号 |
| `PUT /account/preferences` | 保存白名单内的语言偏好 |
| `DELETE /account` | 解除本实例的账号关联 |
| `POST /pair`（票据模式） | 用账号中心签发的一次性入会票据兑换本实例设备凭据 |

配对、账号发现和票据兑换不要求已有设备 bearer，其余路径均需要 `Authorization: Bearer <device-token>`。请求 JSON 上限 20 KiB，新消息上限 4,000 个 UTF-16 单元。配对限制为全局每分钟二十次、最多二十台有效设备。响应禁止缓存。公网代理不挂载 DSH home，只转发上述前缀；DSH 根页面、通用 RPC、文件接口和管理员 socket 不公开。

账号路由默认返回 503。启用时需给 `@el-bot/mobile` 配置 `account.cloudbaseEnvId`、`appId`、`clientId`、`issuer`、`jwksUrl`，并在云乐坊 SSO Registry 注册对应的公开客户端和精确 HTTPS 回调。网关校验 `@yunlefun/sso` 的双证明后，只持久化经服务端验证的用户标识、展示字段和语言偏好；不保存 SSO code、CloudBase ticket、access token、身份断言或聊天历史。设备配对仍是读取和续聊会话的授权边界，账号关联不会绕过它。

账号发现是独立于偏好同步的可选层：配置 `discovery.account`、`discovery.enrollmentSecret`、`discovery.instances` 后，`GET /account` 会返回 `discovery.enabled/canEnroll`，`POST /account/instances` 用同一套双证明返回账号名下两分钟内心跳有效的在线实例。只有再注入 `discovery.tickets` 的账号中心签发器后，`canEnroll` 才为真：签发器用 SSO 双证明为选中实例生成绑定 `userId`、`instanceId`、`publicOrigin`、设备名和随机 `clientId` 的 60 秒票据；目标实例验证票据并兑换一次独立的 30 天设备凭据，票据随即因 `clientId` 重放检查失效。在线状态来自目录服务的 `lastSeen` 心跳，不能用设备凭据的 30 天有效期冒充。当前仓库只提供协议、注入边界和负向测试；真实全局目录、SSO client 注册、票据签发服务和 proof adopter 仍由云乐坊账号中心提供，未配置时不显示假登录或假列表。

`0.1.1` 修复历史投影：DSH 内部 runtime/approval 上下文虽然也可能使用 `user/message` 事件，但不作为人类对话展示；只有 `source.kind === 'user'` 的用户文本和助手文本进入原生界面。人类输入的 `source.rpcId` 映射为可核对的 `requestId`，不下发完整 source 或工具结果。

## 接续、发送与生命周期

客户端沿用服务端的 session ID，不复制模型上下文或另建聊天数据库。读取历史使用公共 Session Controller，不激活冷会话；发送沿用其任务准入、模型选择和持久请求去重。App 续聊 QQ 关联会话不等于向 QQ 目标再次发送消息；QQ 收发继续由官方插件处理。

发送前将待确认文本和 request ID 原子写入本机私有目录（目录 `0700`、文件 `0600`）。超时后不自动创建新请求；用户明确重试使用原 ID。重新读取历史若找到同一收据，则清除待确认状态及原草稿。客户端重启也保留这一关联，避免重复执行。

首版前台轮询：列表五秒，聊天运行中两秒、空闲五秒。后台挂起停止观察，回到前台补齐；退出客户端不停止云端 QQ 或模型任务。当前只提供文本，不提供逐字流式、附件、推送或原生工具审批，完整管理和审批继续使用私有 DSH Web。

原生会话列表按更新时间分段：今天、昨天、7 天内、30 天内，更早的记录按月份归档。搜索先匹配标题、workspace 和模型，再对匹配结果重新分组；私聊与群聊使用不同图标和文字标签，同时保留 workspace 名称与当前模型。

iOS「状态」页复用 `assets/brand/el-bot-cloud.svg` 的三弧云朵与双竖眼设计。上下滚动带动云朵摇晃回弹，在云朵周围拖动时身体与眼睛跟随手指，轻点显示眯眼问候。动画不依赖配对，连接信息仍使用真实云端状态；离开页面或进入后台停止眨眼，系统「减弱动态效果」开启时关闭运动与自动眨眼。Debug 构建可传入 `--show-bot` 直接打开此页，便于独立验收。

聊天输入框上方的模型名称是原生菜单。目录来自 DSH 公共 `sessionController.modelCatalog()`，切换调用 `sessionController.selectModel()`；移动端不读取或改写 DSH 内部会话文件。控制器会恢复目标会话、按当前提供方目录校验 exact provider/model、串行持久化选择，并以规范化后的选择响应。运行中的请求继续使用开始时捕获的模型，新选择应用于下一次模型请求。跨设备修改通过会话列表的持久投影回传，原生端会在下一次刷新时更新。

## 构建与部署

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

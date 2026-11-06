# 云伯特 iOS 伴侣端

首版使用 SwiftUI，最低 iOS 18。中文名「云伯特」、英文名「Yun Bot」，支持在设置中即时切换中英文和跟随系统。

手机通过 `https://bot.yunle.fun` 连接个人云机上的 DSH，查看会话、分组、模型和文本历史，继续原会话或新建移动端会话，并查看小云 Bot（AppID `102275406`）的 QQ 连接状态。模型密钥、QQ 凭据、工具执行和完整会话历史均留在云端；手机退出不影响常驻机器人。

## 设备配对

管理员通过 SSH 在 DSH 容器内生成一次性配对码：

```sh
sudo docker exec el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --profile cloud --pair
```

在手机填写 HTTPS 地址和配对码。配对码五分钟内有效、仅能兑换一次。设备凭据有效期为三十天，仅存入本机 Keychain（`WhenUnlockedThisDeviceOnly`），不随备份迁移。服务器只保存 SHA-256 摘要。

查看或撤销设备：

```sh
sudo docker exec el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --devices
sudo docker exec el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --revoke <device-id>
```

撤销立即生效。手机断开连接会请求撤销并清除本地凭据；若手机离线，应通过上述云端命令撤销。

## 构建

安装 Xcode 和 XcodeGen，然后在仓库根目录执行：

```sh
swift test --package-path apps/ios/Modules/YunBotCore
xcodegen generate --spec apps/ios/project.yml
xcodebuild -project apps/ios/YunBot.xcodeproj -scheme YunBot \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath apps/ios/DerivedData CODE_SIGNING_ALLOWED=NO build-for-testing
```

安装并运行模拟器版本时，把 `CODE_SIGNING_ALLOWED=NO` 替换为 `CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO`。项目提供仅用于模拟器的 Keychain entitlement，使无开发团队的本地 ad-hoc 签名也能验证凭据保存；真机不使用这份模拟器身份。

真机需要在 Xcode 选择自己的开发团队后构建安装。仓库不包含签名证书或 provisioning profile，也不自动上传 App Store / TestFlight。Xcode 工程与 `project.yml` 一同维护。

`CompanionUITests` 支持真实云端配对、状态检查、中英切换和重启恢复。仅在测试 runner 环境配置短期 `YUNBOT_PAIRING_CODE` 时执行；普通 CI 跳过真实云端验证。配对码、测试结果包和带凭据的本地测试配置应放在忽略目录。

## 云端边界与部署

`packages/mobile` 是独立 DSH bundle，固定适配 `0.2.1-rc.5` 的公共 Session Controller。移动请求仅传新消息、会话 ID 和稳定 request ID，模型选择与上下文由 DSH 继续管理；失败重试复用 request ID。读取历史不会激活冷会话；不把工具结果、推理块或凭据投影给手机。

插件通过私有 Unix socket 提供管理员操作。公网只开放 `/el-bot/mobile/v1/` 的限定 REST 接口，不转发 DSH 通用 RPC、文件接口或桌面登录入口。配对后的设备拥有该 DSH 的会话阅读与续聊权限，只应给可信的本人设备配对。

现有云机使用 Traefik，部署示例位于 `packages/mobile/deploy`：

1. 构建 `@el-bot/mobile`，将其 `package.json`、`cordis.patch.yml`、`dist`、`deploy` 放入现有部署目录的 `mobile/`。
2. 保留原镜像和 home 挂载，合并 `compose.override.yaml`。DSH 保持原来的 bridge 网络及 `127.0.0.1` 端口映射；独立 Node 代理连接 bridge 和 `dokploy-network`，只转发移动 API，不挂载 DSH home 或模型凭据。
3. 容器内执行 `deploy/configure.mjs`，为现有 cloud profile 增加 bundle 和 HTTPS origin；脚本先备份配置，拒绝重复添加。可在维护窗口先复制脚本、配置，再重建服务，使挂载生效。
4. 把 `traefik.yaml` 安装到 Traefik 动态配置目录。域名 DNS 指向云机；示例使用 Let's Encrypt TLS challenge，DNS 记录为仅 DNS。
5. 重建 DSH 后确认健康、QQ 已连接，HTTPS 无凭据访问返回 401，根路径和通用 RPC 路径返回 404，再生成手机配对码。

这套配置不改变已有 TokenLink → Hy4、DeepSeek API、QQ 绑定和自动分组。云机不能访问 TokenLink 内网时，已有 Hy4 会话仍需原网络条件；移动端不会自动替换模型。

首版仅在前台轮询：运行中两秒、空闲五秒。每次历史读取最多八十条，可向前加载；单条文本展示上限 16,000 字符，新消息上限 4,000 个 UTF-16 单元。不提供后台常驻、推送、附件上传和工具审批界面。云端工具审批仍须通过 DSH Web/桌面入口处理。

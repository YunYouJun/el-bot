# 云伯特 / Yun Bot iOS

SwiftUI 原生云端伴侣端。构建、设备配对、运行方式与限制见 [开发说明](../../docs/development/ios-companion.md)。

`Modules/YunBotCore` 包含可独立测试的 HTTPS 客户端和 DTO；`Sources` 包含 Keychain 与原生界面；`UITests` 是显式配对后执行的真实云端走查。`project.yml` 是 XcodeGen 工程源，生成的工程一并提交，方便直接用 Xcode 打开。

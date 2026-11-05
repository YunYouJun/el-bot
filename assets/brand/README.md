# el-bot 图标

遵循 [YunLeFun/icons 贡献规范](https://github.com/YunLeFun/icons/blob/main/docs/guide/contributing.md)。

- `el-bot-mark.svg` 保留原有天线机器人品牌 mark：透明背景、64 × 64 网格，关键内容位于 6..58 安全区域，继续用于文档 logo。
- `el-bot-cloud.svg` 是客户端和应用图标共用的三弧云朵源：中央大弧、左右小弧和平底，参考 YunLeFun/icons 的 `home-mark` 外轮廓。`cloud-body` 与 `cloud-eyes` 分开维护，独立轮廓宽 52 单位，方便同一套眼睛在客户端运动、在图标中定格。
- `el-bot-app-icon.svg` 从云朵源生成：主体等比缩放至背景宽度的 72%，左右各留白 14%；满幅品牌蓝背景，无外层圆角、透明边角或系统阴影。独立品牌 mark 保持原始尺寸。
- `metadata.json` 使用 YunLeFun 的产品、变体、分类与上游来源格式；两个变体已登记到 [YunLeFun/icons 源码集合](https://github.com/YunLeFun/icons)，从本仓库的 `dev` 分支单向同步。npm 消费需等待包含这两个变体的版本发布。

```sh
pnpm icons:generate
pnpm icons:check
```

生成脚本位于 `apps/el-bot-client/scripts/generate-icons.mjs`。客户端的 `BotMascot.vue` 从云朵源读取轮廓和眼睛；应用 SVG、客户端 / 文档 favicon、PNG、ICO、ICNS、Icon Composer 分层源和菜单栏模板均由脚本生成，不单独修改。文档 logo 仍从原有品牌 mark 生成。

应用 SVG 保持方形原稿。macOS 的静态 ICNS 在平台导出阶段应用一次圆角与外围留白，主体仍占蓝色背景宽度的 72%；Windows / Linux PNG、ICO 使用同样的主体比例和满幅背景。macOS 菜单栏使用未增加应用底板留白的云朵轮廓，输出 32 px 单色 alpha 模板，由系统适配明暗外观。

## 客户端小云

侧栏与机器人状态卡复用 `BotMascot.vue`，保持 72% 的正面主体宽度。角色根据窗口内鼠标位置轻微转头、移动眼神，偶尔眨眼，也可点击或用键盘触发眨眼。鼠标离开窗口后回正，窗口失焦、隐藏或开启“减少动态效果”时停止动画；组件卸载时清理事件监听、帧请求和计时器。

状态卡根据真实运行状态显示待机、思考、完成与异常表情；较大尺寸在完成时微笑、异常时显示平嘴。应用图标使用默认正面定格，表情不写入静态资产。

## macOS 原生 Liquid Glass

`apps/el-bot-client/src-tauri/icons/ElBot.icon` 是同一脚本生成的 [Icon Composer](https://developer.apple.com/icon-composer/) 分层源：品牌蓝底板与透明云朵矢量前景分离，前景保持 72% 宽度，双竖眼使用镂空。高光、折射、圆角和外观适配由系统处理，源图层不预烘焙这些效果。独立品牌 mark 不受影响。

macOS 专用的 `tauri.macos.conf.json` 在打包前运行 `build:macos`：先构建前端，再由 `scripts/compile-macos-icon.mjs` 调用 Xcode 26 及以上的 `xcrun actool`，将 `.icon` 编译到 `src-tauri/target/icon-composer/Assets.car`。Tauri 收入该目录并自动设置 `CFBundleIconName`。macOS 26 及以上使用原生分层材质；旧系统继续使用同包内的静态 ICNS。Windows / Linux 不读取 `.icon`，也不依赖 Xcode。编译产物只存在于构建目录，不提交到 Git。

单独编译可避开 Tauri 在 Xcode 27 下调用图标编译器时的 [`Bad file descriptor` 问题](https://github.com/tauri-apps/tauri/issues/16386)。若独立编译也命中这一明确错误，脚本只重启当前用户的 `ibtoold` 缓存服务并重试一次；其他错误直接失败，不回退成静态图标。

在 macOS 上可直接用 Icon Composer 打开 `ElBot.icon` 检查默认、深色和单色外观。修改图形或材质参数时，修改生成脚本并重新生成，不单独修改派生文件。完成打包后运行以下命令，检查实际应用中的矢量图层、外观、系统玻璃高光和 ICNS 回退；CI 使用同一检查阻止静态图标误发：

```sh
node apps/el-bot-client/scripts/check-macos-icon.mjs \
  "apps/el-bot-client/src-tauri/target/release/bundle/macos/el-bot Client.app"
```

应用图标使用三弧云朵与双竖眼，默认底色为晴空蓝 `#4B86C8`；客户端标记直接读取云朵源中的配色。原有品牌 mark 保留天线与原配色。验收时检查 16、24、32、64 px 的识别度，以及浅色和深色背景上的效果。这里仅统一产品品牌图标，不替换表示日志、设置等操作的功能图标。

## 图标集入口

- Iconify：`ylf:el-bot-mark`、`ylf:el-bot-app-icon`。
- UnoCSS：`i-ylf-el-bot-mark`、`i-ylf-el-bot-app-icon`。
- 独立 SVG：`@yunlefun/icons/svg/el-bot-mark.svg`、`@yunlefun/icons/svg/el-bot-app-icon.svg`。

在 YunLeFun/icons 仓库运行 `pnpm icons:collect` 同步规范 SVG，运行 `pnpm icons:collect:check` 检查上游一致性。

## 许可

本目录的 `el-bot-mark.svg`、`el-bot-cloud.svg`、`el-bot-app-icon.svg` 及其派生品牌图形按 [MIT License](./LICENSE) 授权，便于图标集复用。名称、Logo 和品牌标记的使用遵循 [YunLeFun 商标政策](https://github.com/YunLeFun/icons/blob/main/TRADEMARKS.md)。

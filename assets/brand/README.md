# el-bot 图标

遵循 [YunLeFun/icons 贡献规范](https://github.com/YunLeFun/icons/blob/main/docs/guide/contributing.md)。

- `el-bot-mark.svg` 是唯一手工维护的主体源：透明背景、64 × 64 网格，关键内容位于 6..58 安全区域。
- `el-bot-app-icon.svg` 从同一主体生成：满幅品牌蓝背景，无外层圆角、透明边角或系统阴影。
- `metadata.json` 使用 YunLeFun 的产品、变体、分类与上游来源格式；两个变体已登记到 [YunLeFun/icons 源码集合](https://github.com/YunLeFun/icons)，从本仓库的 `dev` 分支单向同步。npm 消费需等待包含这两个变体的版本发布。

```sh
pnpm icons:generate
pnpm icons:check
```

生成脚本位于 `apps/el-bot-client/scripts/generate-icons.mjs`。界面直接引用主体源；客户端 favicon、文档 logo / favicon、PNG、ICO、ICNS 和菜单栏模板均由脚本生成，不单独修改。

应用 SVG 保持方形原稿。macOS 的 ICNS 在平台导出阶段应用一次圆角与留白；Windows / Linux PNG、ICO 使用满幅构图。macOS 菜单栏使用同一主体的 32 px 单色 alpha 模板，由系统适配明暗外观。

图标轮廓保留 el-bot 的天线与双竖眼，品牌蓝为 `#3867A4`。验收时检查 16、24、32、64 px 的识别度，以及浅色和深色背景上的效果。这里仅统一产品品牌图标，不替换表示日志、设置等操作的功能图标。

## 图标集入口

- Iconify：`ylf:el-bot-mark`、`ylf:el-bot-app-icon`。
- UnoCSS：`i-ylf-el-bot-mark`、`i-ylf-el-bot-app-icon`。
- 独立 SVG：`@yunlefun/icons/svg/el-bot-mark.svg`、`@yunlefun/icons/svg/el-bot-app-icon.svg`。

在 YunLeFun/icons 仓库运行 `pnpm icons:collect` 同步规范 SVG，运行 `pnpm icons:collect:check` 检查上游一致性。

## 许可

本目录的 `el-bot-mark.svg`、`el-bot-app-icon.svg` 及其派生品牌图形按 [MIT License](./LICENSE) 授权，便于图标集复用。名称、Logo 和品牌标记的使用遵循 [YunLeFun 商标政策](https://github.com/YunLeFun/icons/blob/main/TRADEMARKS.md)。

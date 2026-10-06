# 本机程序图标

图标随客户端打包，用于识别对应程序。图标和名称的权利归各自所有者，不属于 el-bot 的品牌资产。

- `codex-light.png`、`codex-dark.png`：来自 OpenAI 桌面应用的 `icon-codex-light.png`、`icon-codex-dark-color.png`，导出为 64 × 64 PNG；分别用于浅色和深色界面。
- `qq.png`：来自 QQ 桌面应用的 `app/resource/favicon.png`，导出为 64 × 64 PNG。
- `codebuddy.svg`：来自 [CodeBuddy 官网](https://www.codebuddy.ai/) 使用的 [SVG 图标](https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg)，保留原始内容。
- `dsh.svg`：来自 [DSH Tauri 的 favicon](https://github.com/dsh-tauri/deepseek-harness-desktop/blob/main/public/favicon.svg)，对应客户端打开的 `dsh-tauri` 桌面应用，保留原始内容。程序入口显示为「DSH Tauri」，与底层 DeepSeek Harness（DSH）区分。

连接状态标签和程序按钮通过 `ProgramLogo.vue` 共用图标，同时保留文字名称；图标使用空的 `alt`，避免辅助技术重复朗读。

# @el-bot/dsh

el-bot 的 DSH 集成包：人物卡 Web 管理页、QQ 任务的人设快照注入，以及私聊／群聊工作区分组。通用人物卡逻辑复用 `@el-bot/persona`；桌面客户端只负责摘要、快捷切换与打开系统浏览器。

当前兼容 DSH `0.2.1-rc.5`、`@tencent-connect/dsh-qqbot` `0.5.5`。尚未发布到 npm，请构建后使用打包产物安装。

```sh
pnpm --filter @el-bot/dsh build
pnpm --filter @el-bot/dsh pack --pack-destination /tmp/el-bot-dsh-artifacts
```

将本包安装到 DSH profile 可解析的 node_modules，并在 profile 的 `package.json` 的 `dsh.profile.bundles` 增加 `@el-bot/dsh`。插件通过 bundle patch 注册；profile 的 `cordis.patch.yml` 可覆盖实例配置：

```yaml
- id: el-bot-personas
  config:
    profileDirectory: /absolute/path/to/.dsh/profiles/cloud
    title: 小云 Bot
```

不要把两台实例指向同一个 profile。库保存在 profile 的 `el-bot-personas/`。通过 DSH 登录后，在侧栏「人物卡」上传 Markdown 文件，或导入 HTTPS 原文／公开 Git 仓库；预览后显式启用。`#el-bot-personas` 可直接定位面板，认证仍使用 DSH 根路径登录入口。管理页和接口 `/el-bot/personas/` 均校验宿主连接身份，不能绕过登录。

QQ 分组适配的插件路径是 `@el-bot/dsh/qq-workspaces`。沿用现有 `el-bot-qq-workspaces` 条目及 appId、私聊／群聊标题、profileDirectory，将 QQ 插件条目的 inject 保留为 `[qqWorkspaceGrouping]`。分组通过宿主工作区和会话 fork 接口接管既有会话，保留历史、原模型和私聊白名单；异步迁移等待会话空闲。此适配针对已验证的 QQ 插件版本，找不到对应加载器或会话接口时失败，不覆盖原会话。

人物卡仅在 QQ `getOrCreate` 任务准入时固定。切换后，空闲的旧角色会话按 QQ `/new` 方式创建新会话，旧历史保留；正在运行的任务保持原快照。选择和会话绑定都持久化，重启后仍能判断是否需要新会话。人设以普通上下文加入 `system-prompt/assemble`，不更改 AGENTS、工具、审批和普通 Web 会话。

客户端通过已认证 SSH 执行随包构建的 `dist/cli.mjs --profile cloud` 读取摘要；仅开放 `--use <id> --revision <sha256>`、`--disable` 这两种修改，不接收任意远程命令。小云示例及许可证见[人物卡指南](../../docs/development/personas.md)。

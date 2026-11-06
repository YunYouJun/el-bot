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

QQ 分组适配的插件路径是 `@el-bot/dsh/qq-workspaces`。沿用现有 `el-bot-qq-workspaces` 条目及 appId、私聊／群聊标题、profileDirectory；启用下文群聊防护时，QQ 插件必须额外依赖 `qqRuntimeSecurity`。分组通过宿主工作区和会话 fork 接口接管既有会话，保留历史、原模型和私聊白名单；异步迁移等待会话空闲，跳过访问策略已禁止的旧会话。此适配针对已验证的 QQ 插件版本，找不到对应加载器或会话接口时失败，不覆盖原会话。

## 群聊防护

`@el-bot/dsh/qq-security` 为固定版本的官方 QQ 入口提供程序级限制。需要 DSH `0.2.1-rc.5`、QQ 插件 `0.5.5`、SDK `1.0.5`；缺少单调工具拦截接口或版本不符时停止加载，QQ 入口因缺少依赖而不能连接。此模块不用于 `apps/qq-codex` 的旧 C2C 遥控入口。

```yaml
- id: im-qqbot
  inject: [qqWorkspaceGrouping, qqRuntimeSecurity]
  config:
    requireMention: true
    access:
      c2cMode: allowlist
      c2cAllow: [OWNER_C2C_OPENID]
      groupMode: allowlist
      groupAllow: [TEST_GROUP_OPENID]
- insert:
    - id: el-bot-qq-security
      name: '@el-bot/dsh/qq-security'
      config:
        appId: YOUR_APP_ID
        ownerOpenId: OWNER_C2C_OPENID
        groupAllow: [TEST_GROUP_OPENID]
        profileDirectory: /absolute/path/to/.dsh/profiles/cloud
```

使用真实 OpenID 的配置只保存在私有 profile。`ownerOpenId` 必须与现有私聊唯一白名单相同；群成员 OpenID 不用于认领主人。`groupAllow` 缺省为空，最多 32 个显式群，不从聊天、昵称或历史会话自动扩容。云端另需保留 `qqRuntimeHealth` 依赖。

群里所有成员（包括主人）只能聊天。程序在历史缓存、附件下载、斜杠命令之前检查身份与目标，所有群管理命令和交互按钮都被拦截；主人仅在已绑定的 C2C 私聊中使用工具、管理与审批。群聊隐藏工具定义，同时通过宿主单调 guard 拒绝真实执行，不能用提示注入、PTC、未知工具、后续审批或新增插件放行。群消息只保留文本，附件与引用附件不下载。

群聊不读取宿主 AGENTS、技能和工作区提示，只保留群聊约束及已启用的人物卡；私聊沿用原有提示和工具。引用索引包含 AppID、会话类型和 peer 摘要，防止不同群或私聊相同编号串读。普通历史缓存按群保存，最多 6 条，每条截至 512 字符；当前 @ 消息最多 2000 字符。首次接管旧群会话会新建空会话，历史留档；每 12 次模型请求再次换新，限制长期上下文增长。认证 Web 直接恢复的群会话同样禁止工具，未准入 QQ 管理器前不允许模型请求。

默认限额：每人每群每分钟 4 次、每群每分钟 12 次、实例每分钟 40 次触发；每群 24 小时 200 次、实例 24 小时 1000 次触发。实际模型请求另计同样的 24 小时上限，每轮只允许一次，输出最多 512 tokens。窗口从首次计数起算。忙碌群不排队，限流静默丢弃；未 @ 的背景消息另限每群每分钟 30 条、实例 60 条。回复仅允许原群原消息的被动纯文本，4 分钟内最多 2 条，每条最多 1200 字符，不带按钮、群提及或文件。

配额、消息去重和安全会话绑定保存在 `<profile>/el-bot-security/state.json`，目录 `0700`、文件 `0600`，原子提交后才执行。它只含摘要、计数和会话 ID，不保存正文与凭据；进程重启保留配额，损坏或写失败拒绝准入。同目录 `runtime.json` 在受保护的 SDK 开始连接时记录安装状态、PID 和时间，应与本轮 `cloud-boot.json` 及连接健康一起核对。每实例只运行一个接收进程，不能让多个进程共享该 journal。旧会话日志依旧属于 DSH 历史，背景缓冲的 24 小时有效期不代表历史日志自动删除。

小云的群聊表达边界见 `packages/persona/examples/xiaoyun.md` 的补充节；它不替代程序权限。新增群或变更主人需通过已认证的管理端修改私有配置并重载，不能在群里自助授权。

Web 宿主通过 `sessionProjections` 的 `modelSelection` 同步模型选择：输入框模型菜单的选择优先于 QQ 恢复参数，并写回该 QQ 会话的持久偏好；QQ `/model` 分支也更新同一投影。适配监听器随 agent 释放，已替换的旧 agent 不再回写偏好。OpenAI Key 的添加和客户端切换步骤见 [`apps/dsh-cloud/README.md`](../../apps/dsh-cloud/README.md#openai-api-与客户端切换)。

人物卡仅在 QQ `getOrCreate` 任务准入时固定。切换后，空闲的旧角色会话按 QQ `/new` 方式创建新会话，旧历史保留；正在运行的任务保持原快照。选择和会话绑定都持久化，重启后仍能判断是否需要新会话。人设以普通上下文加入 `system-prompt/assemble`，不更改 AGENTS、工具、审批和普通 Web 会话。

客户端通过已认证 SSH 执行随包构建的 `dist/cli.mjs --profile cloud` 读取摘要；仅开放 `--use <id> --revision <sha256>`、`--disable` 这两种修改，不接收任意远程命令。小云示例及许可证见[人物卡指南](../../docs/development/personas.md)。

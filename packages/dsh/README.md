# @el-bot/dsh

el-bot 的 DSH 集成包：人物卡 Web 管理页、主人手动接管与定时群发、QQ 任务的人设快照注入，以及私聊／群聊工作区分组。通用人物卡逻辑复用 `@el-bot/persona`；桌面客户端只负责摘要、快捷切换与打开系统浏览器。

当前兼容 DSH `0.2.1-rc.5` / `0.2.2-rc.1`、`@tencent-connect/dsh-qqbot` `0.5.5`。尚未发布到 npm，请构建后使用打包产物安装。

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

配置文件分三层：

- `packages/dsh/cordis.patch.yml`：包内 bundle patch，只负责插入默认插件；不要在这里写 AppID、OpenID 或密钥。
- `<profile>/cordis.patch.yml`：实际实例配置。完整可复制示例见 [`examples/profile-cordis.patch.yml`](examples/profile-cordis.patch.yml)。
- `<profile>/cordis.yml`：宿主合并后的运行配置，不要手改。

profile patch 里的 `- id: el-bot-personas` 用于覆盖 bundle patch 已插入条目的配置；`el-bot-qq-workspaces` 和 `el-bot-qq-security` 需要显式放进 `insert`。

不要把两台实例指向同一个 profile。库保存在 profile 的 `el-bot-personas/`。通过 DSH 登录后，在侧栏「机器人」→「人物卡」上传 Markdown 文件，从内置精选目录单卡导入 DSH 人设广场，或导入 HTTPS 原文／公开 Git 仓库；预览后显式启用。`#el-bot-personas` 可直接定位面板，认证仍使用 DSH 根路径登录入口。管理页和接口 `/el-bot/personas/` 均校验宿主连接身份，不能绕过登录。

人物卡、手动接管和定时群发页面遵循 DSH 的控件与间距规范。同源 iframe 会同步宿主实际生效的深浅色、语义颜色、字体和圆角，切换宿主主题或自定义配色时无需刷新；独立打开或无法读取宿主时跟随系统主题。主题适配仅用于 DSH Web 插件，小云客户端继续使用各平台原生 UI。

QQ 分组适配的插件路径是 `@el-bot/dsh/qq-workspaces`。沿用现有 `el-bot-qq-workspaces` 条目及 appId、私聊／群聊标题、profileDirectory；启用下文群聊防护时，QQ 插件必须额外依赖 `qqRuntimeSecurity`。分组通过宿主工作区和会话 fork 接口接管既有会话，保留历史、原模型和私聊白名单；异步迁移等待会话空闲，跳过访问策略已禁止的旧会话。此适配针对已验证的 QQ 插件版本，找不到对应加载器或会话接口时失败，不覆盖原会话。

## 群聊防护

`@el-bot/dsh/qq-security` 为固定版本的官方 QQ 入口提供程序级限制。需要 DSH `0.2.1-rc.5` / `0.2.2-rc.1`、QQ 插件 `0.5.5`、SDK `1.0.5`；缺少单调工具拦截接口或版本不符时停止加载，QQ 入口因缺少依赖而不能连接。此模块不用于 `apps/qq-codex` 的旧 C2C 遥控入口。

```yaml
- id: im-qqbot
  inject: [qqWorkspaceGrouping, qqRuntimeSecurity]
  config:
    requireMention: true
    access:
      c2cMode: allowlist
      c2cAllow: [OWNER_C2C_OPENID]
      groupMode: open
- insert:
    - id: el-bot-qq-security
      name: '@el-bot/dsh/qq-security'
      config:
        appId: YOUR_APP_ID
        ownerOpenId: OWNER_C2C_OPENID
        profileDirectory: /absolute/path/to/.dsh/profiles/cloud
```

完整的 profile 配置（含 `im-qqbot`、分组适配、人物卡和定时群发）见 [`examples/profile-cordis.patch.yml`](examples/profile-cordis.patch.yml)。云端部署另需在 `im-qqbot.inject` 增加 `qqRuntimeHealth`。

使用真实 OpenID 的配置只保存在私有 profile。`ownerOpenId` 必须与现有私聊唯一白名单相同；群成员 OpenID 不用于认领主人。群聊天不设白名单，机器人加入的群均可聊天；接收范围仍由 QQ 群设置决定。云端另需保留 `qqRuntimeHealth` 依赖。

安全模块没有群白名单或群接入模式开关，并将官方 QQ 插件的 `access.groupMode` 固定为 `open`。升级时删除安全条目的旧群接入配置及 QQ 插件的旧群列表配置。主人私聊认证、群聊工具禁用、按群隔离、限流与被动回复限制继续生效；`runtime.json` 的 `groupMode` 固定记录为 `open`。

群里所有成员（包括主人）只能聊天。程序在历史缓存、附件下载、斜杠命令之前检查身份与目标，所有群管理命令和交互按钮都被拦截；主人仅在已绑定的 C2C 私聊中使用工具、管理与审批。群聊隐藏工具定义，同时通过宿主单调 guard 拒绝真实执行，不能用提示注入、PTC、未知工具、后续审批或新增插件放行。群消息只保留文本，附件与引用附件不下载。

主人私聊另注册 `qq_group_member_impression` 工具，用于按群名或群 OpenID、成员昵称或发送者 OpenID 列出、读取、记录和清除小云对群成员的短印象。工具执行时再次确认当前 agent 属于已认证主人私聊，群聊、其他 QQ 对象和普通会话一律拒绝；印象只进入客户端成员详情，参与不了群聊授权，也不会被注入群提示。成员身份以群事件的 `member_openid`（入站字段 `senderId`）为唯一键：同一 AppID 下按当前实测该值可跨群识别同一用户，因此群 A 记录的印象可被群 B 的成员详情读取；群历史、成员列表、会话绑定和权限仍按 `group_openid` 隔离，且该身份不跨机器人使用。记录保存于 `<profile>/el-bot-security/member-impressions.json`，目录 `0700`、文件 `0600`，单条最多 280 字符；不随群历史清理或会话轮换删除。每次变更后同步生成 `member-impressions.md` 可读镜像，按群列出成员、发送者 OpenID、印象与更新时间；同一成员可出现在多个群，但 JSON 只保存一份全局印象。Markdown 只是 JSON 的投影，直接编辑不会回写。

群聊不读取宿主 AGENTS、技能和工作区提示，只保留群聊约束及已启用的人物卡；私聊沿用原有提示和工具。引用索引包含 AppID、会话类型和 peer 摘要，防止不同群或私聊相同编号串读。普通历史缓存按群保存，最多 6 条，每条截至 512 字符；当前 @ 消息最多 2000 字符。首次接管旧群会话会新建空会话，历史留档；每 12 次模型请求再次换新，限制长期上下文增长。认证 Web 直接恢复的群会话同样禁止工具，未准入 QQ 管理器前不允许模型请求。

默认限额：每人每群每分钟 4 次、每群每分钟 12 次、实例每分钟 40 次触发；每群 24 小时 200 次、实例 24 小时 1000 次触发。实际模型请求另计同样的 24 小时上限，每轮只允许一次，输出最多 512 tokens。窗口从首次计数起算。忙碌群不排队，限流静默丢弃；未 @ 的背景消息另限每群每分钟 30 条、实例 60 条。回复仅允许原群原消息的被动纯文本，4 分钟内最多 2 条，每条最多 1200 字符，不带按钮、群提及或文件。

配额、消息去重和安全会话绑定保存在 `<profile>/el-bot-security/state.json`，目录 `0700`、文件 `0600`，原子提交后才执行。它只含摘要、计数和会话 ID，不保存正文与凭据；进程重启保留配额，损坏或写失败拒绝准入。同目录 `runtime.json` 在受保护的 SDK 开始连接时记录安装状态、PID 和时间，应与本轮 `cloud-boot.json` 及连接健康一起核对。每实例只运行一个接收进程，不能让多个进程共享该 journal。旧会话日志依旧属于 DSH 历史，背景缓冲的 24 小时有效期不代表历史日志自动删除。

小云、大肥鱼的群聊表达边界分别见 `packages/persona/examples/xiaoyun.md` 与 `dafeiyu.md` 的补充节；它们不替代程序权限。变更主人需通过已认证的管理端修改私有配置并重载，不能在群里自助授权。

## QQ 指令

`@el-bot/dsh/qq-security` 在官方 QQ 插件和模型之前安装确定性指令路由。私聊里的 `/help`、`/ping`、`/restart` 以及 Cordis 插件注册的命令会直接回复，不经过模型；`/new`、`/compact`、`/model`、`/preset`、`/stop`、`/bot-help`、`/bot-ping`、`/bot-version`、`/bot-me`、`/bot-status` 继续交给 `dsh-qqbot` 处理。未知的 `/xxx` 会收到「未找到指令」，不会落入普通聊天或触发模型。

`/restart` 仅在容器或显式 `DSH_RESTART_SUPERVISED=1` 的受管进程中可用。它先确认没有运行中的会话；有任务时发送 `/restart force` 才会中断并重启。回复完成后通过 DSH `appExit` 优雅退出，由 `restart: unless-stopped` 拉起。

`/help` 默认使用 QQ 单聊自定义 Markdown（标题、粗体、列表、引用和分隔线）展示，不依赖模型；机器人没有 Markdown 权限、平台拒绝或旧客户端无法渲染时自动回退纯文本。可将安全插件配置中的 `commandMarkdown` 设为 `false` 始终使用纯文本。自定义指令返回普通字符串时仍按纯文本发送，只有显式返回 `{ markdown, text }` 或调用 `replyMarkdown()` 才启用富文本，避免把外部内容意外变成链接或图片。

QQ 后台的指令面板只负责客户端展示和点击输入，`only_admin` 是界面标记，不是安全边界。真正的身份判断来自 QQ 传输层的 `user_openid`：当前只有已认证主人的 C2C 私聊能进入指令路由。群聊中的斜杠指令仍然全部拦截，`only_admin`、群名片、引用文本和消息里的自称都不能提升权限。发送 `/bot-me` 可以核对 OpenID。

其他 DSH 插件通过 `qqCommands` 服务注册命令，API 与 el-bot 的链式写法一致：

```ts
import type { QQCommandRegistry } from '@el-bot/dsh/qq-security'

export function apply(ctx: { get: (name: string) => unknown }) {
  const commands = ctx.get('qqCommands') as QQCommandRegistry
  commands.command('echo')
    .description('原样返回参数')
    .usage('/echo <文本>')
    .example('/echo hello')
    .alias('repeat')
    .scope('c2c')
    .permission('owner')
    .action((args, command) => args.length
      ? args.join(' ')
      : command.replyMarkdown('### 用法\n\n发送 **/echo 文本**', '用法：/echo 文本'))
}
```

这不是旧 `plugins/` 里绑定 NapCat `Bot` 实例的 `ctx.command()`；DSH 运行时通过 `qqCommands` 提供同风格的链式注册，旧插件需要迁移到 Cordis 入口后再注册。命令定义不接受 YAML 中的任意代码，避免把配置读取变成远程执行入口。

命令默认 `scope('c2c')`、`permission('owner')`。`scope` 可选 `c2c`、`group`、`all`；当前群聊入口会在调用自定义命令前拦截，所以 `group` 和 `all` 尚不能在群里执行。`permission` 可选 `owner`、`group-admin`、`everyone`；在 C2C 私聊中 `group-admin` 会被拒绝，`everyone` 仍受主人 C2C 白名单限制。返回值可以是字符串、`{ markdown, text }`、它们的数组或 `Promise`，也可以调用 `context.reply()` / `context.replyMarkdown()` 分条回复；回复会移除 `<qqbot-*>` 控件标记和群提及，并限制为 1600 字符。异常只回复通用错误，不把上游原始错误或凭据发给 QQ。

指令消息按 `messageId` 持久去重，QQ 重投不会重复执行；主人正在手动接管时，自动指令、命令回复和模型输出都不会执行。后台建议只放实际可用的 10 个入口：`/help`、`/ping`、`/new`、`/compact`、`/model`、`/preset`、`/bot-status`、`/stop`、`/bot-help`、`/bot-version`。不要把 `apps/qq-codex` 的 `/run`、`/result`、`/projects`、`/review`、`/steer`、`/threads` 混入此实例面板，它们属于另一套 C2C 遥控入口。

## 主人手动接管

通过原有 DSH 登录入口进入，在侧栏「机器人」→「手动接管」（`#el-bot-manual` 可直接定位）打开。页面和 `/el-bot/manual/api` 沿用宿主的主人 Cookie、Host 与 Origin 校验，不开放 QQ 指令或模型工具入口。未加载 `@el-bot/dsh/qq-security` 时不会显示此视图。原生 App 通过已配对设备的受限接口复用同一接管服务，见[原生群聊与接管](../../docs/development/ios-companion.md#qq-群聊视角与原生接管)。

1. 选择允许聊天的已绑定会话，点击「暂停自动回复并接管」。默认 10 分钟，可选 5、10、30 分钟；API 接受 30 秒至 30 分钟。
2. 等待当前任务取消、流式回复停止及在途请求结束。暂停仅作用于选中的群或主人私聊；该会话的新消息不进入模型、命令或审批处理，只在控制页内存中保留最近 10 条文本，每条最多 2000 字符。
3. 选择「主动发送」或「回复最近消息」，输入最多 1200 字符原文，点击「发送」直接发出，无须逐条预览或二次确认。正文不调用模型、不裁剪、不转换 Markdown，以 QQ `msg_type: 0` 发送；QQ 客户端的最终展示由平台决定。
4. 点击「结束接管」，或等待超时。关闭网页不会立即结束接管。之后的新消息恢复原有自动回复策略；暂停期间的消息不补发给模型，接管前的旧回复和没有新消息／互动事件依据的延迟主动输出会被拦截。已经提交给 QQ 的消息无法因结束接管而撤回。

手动发送始终检查当前会话权限、机器人连接、接管租约、会话绑定和配额。每会话每分钟最多 4 次手动发送，并共用每群每分钟 12 次、每群 24 小时 200 次、实例每分钟 40 次／24 小时 1000 次的配额；主人私聊另有每分钟 12 次／24 小时 200 次上限。被动发送只使用最近符合条件的消息，4 分钟内最多 2 次，不会因失效悄悄改成主动发送。

点击发送后，客户端自动取得绑定目标、会话、原文、发送方式和租约的发送凭据，2 分钟内有效，无须展示预览。同一凭据只提交一次；网络超时或缺少消息 ID 的回执标为「结果未知」，刷新及进程重启都不会自动重发。可重试同一次请求以读取回执；请先在 QQ 内确认结果，再点击「已核对 QQ，保留原文」解除待确认状态，决定是否新建发送。

租约与发送回执持久化到 `<profile>/el-bot-security/manual.json`（目录 `0700`、文件 `0600`）。回执仅保留最近 24 小时的正文摘要、目标摘要、状态、时间和平台消息 ID，不保存正文；预览与最近消息只在内存中。重启继续执行尚未到期的接管，未完成发送改为结果未知；损坏或写失败会停止接管能力并拒绝相关自动输出。该功能仍要求每实例单一接收进程。

## 定时群发

主人可以在「机器人」→「定时群发」（`#el-bot-schedule`，页面 `/el-bot/schedule/`）创建到点发送的任务。页面和 `/el-bot/schedule/api` 只接受通过 DSH 登录的主人 Cookie、Host 与 Origin 校验；任务不会注册为模型工具，群成员、群内提示注入和审批按钮都不能创建、修改或触发任务。每个实例最多 24 个任务，每个群最多 4 个。

任务支持三种内容：

- **固定文本**：主人输入的 1–1200 字符原文，原样发送，不调用模型。
- **AI 群聊总结**：读取最近 1–168 小时、最多 20–500 条群内文本，用 `ctx.llm` 生成 500 字以内的摘要。默认复用该群会话当前选择的模型；也可在安全插件配置中用 `summary.provider`、`summary.model` 指定兜底模型。模型不可用、生成失败或窗口内没有消息时，本次不发送，只在任务记录里留下错误。
- **规则统计**：不调用模型，只统计消息数、活跃成员和最近发言。

每个任务都可以先点「预览」生成这一次会发送的原文，预览不会提交给 QQ；确认后再点「立即执行」，或等待计划时间触发。AI 总结每次生成可能不同，预览结果不缓存。

AI 总结会把窗口内的群文本发送给该群当前选择的模型提供方。它不进入群会话历史，不向模型开放工具，也不会把摘要原文写入运行回执；如果群内容不适合发送给该提供方，请改用「规则统计」或固定文本。

```yaml
- id: el-bot-qq-security
  config:
    appId: YOUR_APP_ID
    ownerOpenId: OWNER_C2C_OPENID
    profileDirectory: /absolute/path/to/.dsh/profiles/cloud
    timezone: Asia/Shanghai
    summary:
      provider: deepseek-api
      model: deepseek-flash
      maxTokens: 800
      timeoutMs: 30000
```

`summary.provider` / `summary.model` 必须与宿主 `llm-pi-ai` 中已配置的 provider 和模型 ID 一致；不同实例可以使用 TokenLink、OpenAI 或其他提供方。完整 profile 示例见 [`examples/profile-cordis.patch.yml`](examples/profile-cordis.patch.yml)，其中 `summary` 以注释形式给出。

调度按 `timezone` 的墙上时间计算，默认 `Asia/Shanghai`。任务按本地时间中的星期和 HH:mm 触发，同一分钟只执行一次，重启后不会重复补发；机器人离线时记录「离线跳过」，恢复连接后不会在非计划时间补发。任务和 24 小时内的运行回执保存在 `<profile>/el-bot-security/scheduled.json`（目录 `0700`、文件 `0600`），固定文本会随任务配置保存，回执只保存任务 ID、状态、时间、错误码和平台消息 ID，不保存正文。

定时发送复用主人手动接管的主动发送通道与配额：每会话每分钟最多 4 次，并共用每群每分钟 12 次、每群 24 小时 200 次、实例每分钟 40 次／24 小时 1000 次的限制。发送失败不会自动重试，也不会改发到其他群；QQ 群关闭「允许主动发送」时记录平台错误 `40034105`。主人正在手动接管某个群时，该群的自动输出仍处于暂停状态，定时发送会被拦截并记录失败；结束接管后按后续计划继续。

上线前检查：

1. `im-qqbot.inject` 包含 `qqRuntimeSecurity`，且 `el-bot-qq-security` 已插入。
2. 目标群已选择模型，或 `summary.provider` / `summary.model` 已配置且可用。
3. `runtime.json` 包含 `scheduledEnabled: true`。
4. 目标群允许主动发送；否则回执记录 `40034105`。
5. 通过 DSH 登录能打开 `/el-bot/schedule/`，未登录访问 API 被拒绝。

### QQ 平台发送权限

官方 [消息 API 概述](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html) 支持主动消息；目标好友或群可关闭「允许主动发送」，此时发送失败。主动发送不是绕过平台授权的通道。[群聊发送接口](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html) 与 [私聊发送接口](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html) 均支持纯文本；群聊错误 `40034105` 表示没有主动发送权限。平台窗口与额度高于本模块限制时，仍使用本模块较小上限。

上线前应在 QQ 后台核对对应 AppID、认证和在线状态，并在目标会话核对其主动发送开关。控制页最初显示「主动发送权限待回执核验」，只根据真实发送回执显示最近成功或被拒；成功一次不代表权限永久有效。2026-11-07 对当前小云 Bot 后台只读核验：企业已认证、在线，公开好友／公开加群开关关闭；没有更改服务范围或群管理权限。后台该页不提供目标会话主动发送开关，仍需目标设置或实际回执确认。离线验收没有向真实 QQ 发送消息。

## 模型与人物卡

Web 宿主通过 `sessionProjections` 的 `modelSelection` 同步模型选择：输入框模型菜单的选择优先于 QQ 恢复参数，并写回该 QQ 会话的持久偏好；QQ `/model` 分支也更新同一投影。适配监听器随 agent 释放，已替换的旧 agent 不再回写偏好。OpenAI Key 的添加和客户端切换步骤见 [`apps/dsh-cloud/README.md`](../../apps/dsh-cloud/README.md#openai-api-与客户端切换)。

人物卡仅在 QQ `getOrCreate` 任务准入时固定。切换后，空闲的旧角色会话按 QQ `/new` 方式创建新会话，旧历史保留；正在运行的任务保持原快照。选择和会话绑定都持久化，重启后仍能判断是否需要新会话。人设以普通上下文加入 `system-prompt/assemble`，不更改 AGENTS、工具、审批和普通 Web 会话。

精选目录静态打包自 [`huaizhuanghub/dsh-persona-repository`](https://github.com/huaizhuanghub/dsh-persona-repository)，审核基线为 commit `bf402d0`，当前 7 张卡。目录运行时不会请求上游 manifest；每张卡展示作者和自身许可证，单卡导入复用公开 Git 流程，默认引用 `main` 并记录实际 commit。导入后只进入预览，不自动启用。「检查更新」会重新读取来源。上游同名的 `dafeiyu` 未列入精选目录，以免覆盖内置的 whyever77 适配版本。

客户端通过已认证 SSH 执行随包构建的 `dist/cli.mjs --profile cloud` 读取摘要；仅开放 `--use <id> --revision <sha256>`、`--disable` 这两种修改，不接收任意远程命令。小云、大肥鱼示例及许可证见[人物卡指南](../../docs/development/personas.md)。

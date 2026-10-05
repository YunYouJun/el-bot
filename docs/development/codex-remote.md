# QQ 遥控本地 Codex

通过 QQ 官方机器人的私聊，在自己的电脑上启动 Codex 任务、继续项目会话、处理审批和查询结果。
实现使用 QQ 官方 API 和 Codex app-server 的 stdio 协议；运行时不依赖 Mirai、NapCat 或桌面浏览器调试端口。

现支持按本机版本生成 API 目录、连接已有 app-server，并通过 Codex 随应用提供的 MCP 适配器管理桌面项目、聊天、侧栏和工具。桌面宿主接入与验证条件见 [管理 Codex Desktop](/codex/desktop)。

先看[功能展示](/codex/)，也可以复制[AI 接入提示词](/codex/ai-setup)，让本机助手完成环境检查与初始化。

## 环境要求

- Node.js 22.18+；推荐使用仓库 `.node-version` 指定的 Node.js 24。
- 本机已安装 Codex CLI，执行 `codex login`；`codex app-server` 必须可用。
- 在 [QQ 开放平台](https://q.qq.com/) 创建机器人，取得 AppID 和 **AppSecret**。
- 在后台「开发设置 → 事件订阅与回调」选择 **WebSocket**，配置运行机器的出口 IP 白名单。
- 根据平台的服务范围或开发体验用户设置，让自己的 QQ 可以添加机器人并私聊。

默认 CLI 沿用本机 Codex 的账户和模型配置，也可在配置文件中指定 `model`。新实例推荐使用 `--profile` 隔离账户、凭据和会话，见[实例隔离与恢复](/codex/instances)。无需 YunLeFun 账户；QQ 鉴权与本人 `/pair` 绑定仍然必需。
默认连接独立的本地 app-server，创建并恢复自己维护的项目会话。配置已有后端代理后可以绑定该后端的会话；桌面项目、聊天和侧栏管理另需连接 Desktop 宿主适配器，见[管理 Codex Desktop](/codex/desktop)。

## 安装 CLI

安装包为 `el-bot`，Codex 功能统一放在 `el-bot codex` 子命令下；`el` 别名仍可使用。
Codex 命令内置所需的工作区协议实现，运行时不依赖仓库、TypeScript、tsx，
也不要求单独安装 `qq-sdk` 或 `@el-bot/codex`。原有机器人开发入口保留为 `el-bot dev [root]`。

本文对应 `el-bot@1.0.0-rc.2`。预发布版使用 `next` 标签；安装后先检查版本与子命令：

```bash
pnpm add -g el-bot@next
el-bot --version
el-bot codex --help
# 或无需全局安装：pnpm dlx el-bot@next codex <命令>
```

从源码构建并打包：

```bash
git clone https://github.com/YunYouJun/el-bot
cd el-bot
pnpm install
pnpm build
pnpm --filter el-bot pack --pack-destination ./dist
```

安装生成的包，之后可在任意目录运行：

```bash
pnpm add -g ./dist/el-bot-1.0.0-rc.2.tgz
el-bot --help
el-bot codex --help
```

需要固定版本时：

```bash
pnpm add -g el-bot@1.0.0-rc.2
```

## 三步开始

### 1. 初始化

```bash
el-bot codex init --project /absolute/path/to/my-project --name my-project
```

不传 `--project` 时使用当前目录。终端会询问 AppID 和 AppSecret，密钥使用隐藏输入。
配置与凭据默认写入用户目录，文件权限为 `0600`（支持 POSIX 权限的平台），不会覆盖已有文件或清除绑定。
已有配置时，直接编辑配置增加项目即可；不必重复初始化。

| 文件 | 默认路径 | 用途 |
| --- | --- | --- |
| 配置 | `~/.el-bot/qq-codex.json` | 项目白名单、模型和接入方式 |
| 凭据 | `~/.el-bot/qq-codex.env` | AppID、AppSecret |
| 状态 | `~/.el-bot/qq-codex-state.json` | 本人绑定、项目会话、任务和消息去重 |

在脚本或非交互环境中使用 `init --no-prompt`：已有 `QQ_BOT_APP_ID`、`QQ_BOT_SECRET` 环境变量时写入凭据，
否则创建空白模板供手动填写。已有凭据文件保持原样。不要将密钥作为命令行参数传入，以免出现在进程列表和 shell 历史中。

### 2. 检查

```bash
el-bot codex check --all
```

`check` 默认检查项目目录、请求 Codex 刷新登录信息，并核对 ChatGPT 账户的模型目录与各项目配置；`check --qq` 仅验证 QQ AccessToken 与网关地址；
`check --all` 检查两者。这些命令不会启动模型任务、建立 QQ 长连接或发送消息，也不会输出访问令牌。
检查失败会返回非零退出码。
检查还会读取保存的会话，识别归档、丢失和目录变化；`--qq` / `--all` 会校验 AppID 与状态是否匹配。归档恢复见[实例隔离与恢复](/codex/instances#明确恢复-不丢历史)。
模型目录检查通过不代表模型请求一定成功；网络、账户额度及服务端模型权限仍需真实任务验证。

### 3. 启动与绑定

```bash
el-bot codex start
```

第一次启动时，在 QQ 中私聊自己的官方机器人，发送终端显示的绑定码：

```text
/pair 终端显示的绑定码
```

绑定码有效期为 10 分钟。绑定成功后，只有该用户的 `user_openid` 可以提交任务。
其他用户和群聊消息不会执行，也不会收到项目信息。随后直接发任务文本，或用 `/help` 查看命令。
服务需要保持运行，使用 Ctrl+C 正常退出；CLI 不会自动安装开机启动服务。

## CLI 命令与配置

AI 助手可用 `init --no-prompt` 创建配置、`paths` 核对路径、`check --all` 做连接检查。
完整的非交互接入与用户操作边界见 [AI 快速接入](/codex/ai-setup)。

| 命令 | 作用 |
| --- | --- |
| `el-bot codex init` | 创建配置和凭据，可用 `--project`、`--name`、`--no-prompt` |
| `el-bot codex check` | 验证项目与本机 Codex，可用 `--qq` 或 `--all` |
| `el-bot codex start` | 启动 QQ 遥控服务；`el-bot codex` 也会启动 |
| `el-bot codex paths` | 查看实际配置、凭据、状态路径，不显示密钥 |
| `el-bot codex recover --project 名称` | 停止服务后重置该项目的续聊绑定，备份状态并保留本人绑定和历史 |
| `el-bot codex api` | 从本机 Codex 生成方法目录，支持 `--experimental`、`--method` |
| `el-bot codex desktop-init` | 向已有配置接入桌面宿主；需管道与专用聊天 ID |
| `el-bot codex desktop-check` | 只读验证宿主目录和项目列表，不运行模型 |
| `el-bot codex --help` / `el-bot --version` | 查看 Codex 帮助或 el-bot 版本 |

所有 Codex 子命令支持 `--profile <name>`、`--config <path>`、`--credentials <path>`、`--state <path>`；参数放在 `codex` 后，例如：

```bash
el-bot codex start --config /path/to/config.json --credentials /path/to/bot.env --state /path/to/state.json
```

自定义路径后，初始化、检查和启动应使用相同参数。不同机器人的实例需要分别指定凭据、配置和状态文件。
仅更换 `--config` 不会自动更换默认状态文件；状态锁会阻止两个实例同时使用同一个文件。
使用 `--profile personal` 可以自动分配独立目录和 Codex 账户目录，须在该目录登录。状态自动绑定 AppID、测试环境和 Codex 目录，见[实例隔离与恢复](/codex/instances)。

配置文件示例：

```json
{
  "projects": {
    "el-bot": "/absolute/path/to/el-bot",
    "my-project": "/absolute/path/to/my-project"
  },
  "defaultProject": "el-bot",
  "transport": "websocket",
  "sandbox": false,
  "messageFormat": "markdown"
}
```

项目目录必须存在；相对路径相对于配置文件，QQ 只能通过项目名称选择。
`sandbox` 指 **QQ 平台的测试环境**，与 Codex 执行沙箱无关。
如果 `codex` 不在 PATH，可以设置 `codexExecutable` 为可执行文件的绝对路径。
`model` 可覆盖本机 Codex 的默认模型。不填写时沿用当前项目的本机配置；桌面应用中的模型名可能不适用于 CLI。
若检查提示模型不在当前 ChatGPT 账户目录中，将遥控配置的 `model` 设置为检查建议的模型，再重新检查并启动。自定义模型服务及 API Key 账户不套用 ChatGPT 模型目录。
`messageFormat` 默认是 `markdown`，已有配置无需迁移；设置为 `text` 可始终使用纯文本。`image` 开启[图片卡片](#图片卡片与本地预览)，默认直接上传本地 PNG 到 QQ，无需自建公网图片入口。

凭据文件格式：

```dotenv
QQ_BOT_APP_ID="你的 AppID"
QQ_BOT_SECRET="你的 AppSecret"
```

显式使用 `--credentials` 或 `--profile` 时只读取对应凭据文件，环境变量不覆盖该文件，文件缺失会直接报错。
默认模式按 **完整进程环境 → 默认凭据文件 → 当前目录 `.env`** 读取；AppID 和 Secret 必须来自同一来源，半套凭据直接报错，不跨来源拼接。
旧变量 `QQ_BOT_APP_SECRET` 仍兼容；`QQ_BOT_APP_TOKEN` 不能替代 AppSecret。
只读取 QQ 凭据，不把 dotenv 中无关的变量注入 Codex 子进程。

已知自己的机器人 OpenID 时，可设置 `ownerOpenId`；它不是 QQ 数字账号。
更换绑定人需停止服务，在本机备份并移走旧状态后重新绑定；配置与已有绑定不一致时拒绝启动。

### 旧版与源码使用

源码仍支持：

```bash
pnpm cli codex init --project /absolute/path/to/project
pnpm cli codex check --all
pnpm cli codex start
```

旧源码快捷入口 `pnpm qq:codex` 继续支持 `init`、`check`、`start`，以及 `--check`、`--check-qq` 和 `--config` / `--state` 启动参数。
此前生成的 `@el-bot/qq-codex` 安装包由统一的 `el-bot` 安装包替代；配置和状态路径不变，无需重新绑定。
配置优先级为显式 `--config`、当前目录 `.el-bot/qq-codex.json`、用户目录默认配置。
迁移前可运行 `paths` 核对实际路径；保持 `--state` 指向原状态即可沿用绑定和会话，不要删除状态来解决启动错误。

### 常见连接问题

若 AccessToken 获取成功，但网关返回 `HTTP 401, code 11298`，表示调用机器的出口 IP 不在后台白名单。
添加该机器的出口 IPv4，保留仍在使用的服务器地址；更换网络后可能需要更新。
后台显示「在线」并不意味着当前电脑已有 API 访问权限。

新版后台的「查看 AppSecret」可能实际打开重置流程。重置会使旧密钥失效，影响已有服务；优先使用已保存的 AppSecret。
网关已连接但没有私聊事件时，检查后台是否仍为 Webhook、测试用户是否可添加机器人，以及绑定码是否过期。

### 任务失败的诊断与恢复

任务失败后，QQ 会显示识别到的原因、错误类型和处理步骤。`/status` 与 `/result 任务ID` 可以再次查询；已产生的部分结果和失败类型保存在本机，重启后仍可查看。
失败卡片提供「连接诊断」；会话归档、丢失、目录变化或上下文不足时还提供绑定该任务项目的「新建会话」。也可发送 `/diagnose [项目]`。服务不可用时，停止进程后执行 `el-bot codex recover --project 名称`；使用 profile 时带上同一个 `--profile`，不会清除主人或重放任务。

| 错误类型 | 处理方式 |
| --- | --- |
| `authentication`：登录失效 | 在运行服务的电脑执行 `codex login`；profile 模式须设置对应 `CODEX_HOME`，完成后重启服务 |
| `model`：模型不支持 | 运行 `el-bot codex check`，用检查建议的模型配置 `model`，再重启服务 |
| `session-archived`：会话归档 | 发送 `/new` 后提交新任务；原会话和历史结果保留 |
| `session-missing` / `project-changed`：会话或项目变化 | 核对原机器、账户与目录；需要新会话时发送 `/new` |
| `quota` / `rate-limit`：额度或限流 | 检查账户额度与重置时间，或稍后重新提交 |
| `context`：上下文或会话预算达到上限 | 保留必要背景，发送 `/new`，用较短提示开始 |
| `network`：模型连接失败 | 检查本机网络、代理和模型服务 |
| `timeout` / `connection`：本机连接不可用 | 检查 Codex 进程，重启遥控服务 |
| `stop-unconfirmed`：无法确认命令终止 | 服务已停止接收新任务；在本机检查并结束该任务的命令进程，核对 Codex 终端控制接口支持后重启。不能将此状态视为命令已停止 |
| `unknown`：未识别原因 | 运行 `el-bot codex check --all`，核对本机账户、模型与项目配置 |

登录信息可读取不代表访问令牌一定有效；切换 Codex 账户后，已有遥控进程可能仍持有旧凭据，需要重新登录并重启。
服务不会自动重试失败任务、切换模型或取消会话归档；由用户处理原因后重新提交。Codex 内部重试中的错误不会提前将任务标为失败。
QQ 报告使用固定的诊断文案，不转发上游原始错误、令牌、账户资料或本机路径。

## QQ 命令

| 命令 | 作用 |
| --- | --- |
| 直接发送文字 | 在当前项目提交任务，继续上一次会话 |
| `/run 提示词` | 明确提交提示词；可用于以 `/` 开头的内容 |
| `/review [目标 JSON]` | 审查代码，默认审查未提交改动；也支持基线分支、提交或自定义要求 |
| `/steer 提示词` | 向当前执行中的任务补充要求 |
| `/projects [页码]` | 分页查看本地配置允许的项目，点击按钮切换 |
| `/project 名称` | 切换项目，保留每个项目各自的会话 |
| `/new [项目]` | 清除指定项目的续聊绑定，省略时使用当前项目；保留历史，下次任务新建会话 |
| `/diagnose [项目]` | 只读检查会话归档、丢失和目录变化，不调用模型 |
| `/status [页码]` | 查看当前任务、状态及待审批/待回答编号，长列表分页 |
| `/stop [任务ID]` | 请求停止当前任务；指定 ID 时只停止对应任务，用 `/status` 确认最终状态 |
| `/result [任务ID] [页码]` | 分页查看结果；不填任务 ID 时查看最近任务 |
| `/approval ID [页码]` | 查看审批命令、文件变更或问题的完整详情 |
| `/approve ID` | 批准这一条命令/文件变更请求 |
| `/reject ID` | 拒绝该请求 |
| `/answer ID {"问题ID":"回答"}` | 回答 Codex 的结构化问题，必须包含全部问题 ID |
| `/help [分类] [页码]` / `/menu [分类] [页码]` | 打开分组帮助；图片模式支持分类内翻页；`/?`、`/帮助`、`/菜单` 也可使用 |
| `/threads [游标]` / `/thread use ID` | 浏览当前项目会话，绑定已有会话 |
| `/thread fork` | 复制当前会话历史并绑定新会话，不启动模型任务 |
| `/models` / `/skills` / `/plugins` / `/mcp` | 浏览本机能力 |
| `/api [前缀] [页码]` / `/rpc 方法 JSON` | 查阅本机版本目录，校验后调用协议 |
| `/desktop projects` / `/desktop chats` / `/desktop tools` | 桌面宿主项目、聊天和工具目录 |
| `/desktop schema 工具` / `/desktop call 工具 JSON` | 查阅参数，调用宿主工具 |
| `/inspect ID [页码]` / `/confirm ID` / `/cancel ID` | 查看全部详情后确认一次管理写操作，或取消 |
| `/manage-result ID [页码]` / `/events [页码]` | 查询管理结果和最近脱敏事件 |

### 帮助与快捷入口

绑定成功后自动展示帮助卡片；任务接收、状态、结果和审批卡片也都有「帮助菜单」按钮。
发送 `/help`、`/menu`、`/?`，或单独发送「帮助」「菜单」即可再次打开。帮助分为五类：

- `/help 1`：任务与结果，包含输入任务、状态、结果和停止用法。
- `/help 2`：项目与会话，解释项目切换、续聊和新会话。
- `/help 3`：审批与回答，说明完整查看详情和单次处理流程。
- `/help 4`：API 与能力管理，包含版本目录、会话绑定和管理确认。
- `/help 5`：Codex Desktop 管理，包含桌面项目、聊天和工具入口。

图片模式每页最多展示四条命令，命令名、参数和说明使用不同样式；例如 `/help 1 2` 查看「任务与结果」第二页。按钮先在当前分类内翻页，再进入下一分类，分类编号保持不变。Markdown / 纯文本模式每类展示完整命令列表。
前三类提供「输入任务」「任务状态」「最近结果」「选择项目」「新建会话」按钮，以及文档链接；管理类提供 API 和桌面列表入口。
「输入任务」将 `/run ` 填入草稿，补齐后自行发送；「新建会话」先弹出确认，执行 `/new` 后下一条任务才创建会话，历史结果保留。
`/projects` 每页展示最多四个项目及对应按钮；名称较长时按钮文字会缩短，正文保留完整名称，可手动发送 `/project 完整名称`。
未知的斜杠命令会返回帮助卡片，不提交模型任务。中文「帮助」「菜单」只有独立成句时作为命令，诸如「帮助 修复测试」仍是任务提示。

帮助和项目浏览不依赖正在运行的模型任务，Codex 断开时仍可查询；切换项目和新建会话仍受单任务限制。
没有富文本或按钮权限时，同一页的文字指令保留，仍可手动操作。

「文档站点」打开 [el-bot 文档首页](https://docs.bot.elpsy.cn/)；「使用帮助」打开[完整 QQ 命令说明](https://docs.bot.elpsy.cn/development/codex-remote#qq-%E5%91%BD%E4%BB%A4)。
卡片正文同时提供这两个链接与 [AI 接入指南](https://docs.bot.elpsy.cn/codex/ai-setup)，纯文本回退保留完整网址。
链接按钮使用[官方消息按钮](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/msg-btn.html)的跳转类型，直接打开网页，不发送 QQ 指令、不启动 Codex 任务。
目的地址为固定 HTTPS 文档网址，不附带用户、项目、任务或本机路径信息；模型输出中的网址仍按原文转义显示，不生成链接按钮。

新的 Codex 帮助、AI 接入和 Desktop 管理页面需部署文档后才会在线生效。部署前可以使用卡片内的五页命令帮助，或阅读仓库中的对应 Markdown。

示例：

```text
/project el-bot
检查最近的变更，修复类型错误并运行测试
/status
/approval a1b2c3d4 2
/approve a1b2c3d4
/result e5f6a7b8 2
```

同一服务只运行一个任务。任务进行中，新提示词会提示忙碌；查询、回答、审批和停止仍可使用。
项目目录发生变化后，先使用 `/new`，避免把旧会话恢复到不同目录。

## Markdown 卡片与操作按钮

默认使用官方 C2C 的自定义 Markdown 和内联键盘：帮助、项目选择、任务接收、任务状态、结果和审批详情都有标题、正文与操作按钮。
QQ 官方于 2026-04-23 向所有机器人开放单聊与群聊自定义 Markdown；本应用当前使用单聊。
协议见[官方 Markdown 文档](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html)和[发送单聊消息 API](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)。

| 卡片 | 操作 |
| --- | --- |
| 帮助菜单 | 翻页、输入任务、任务状态、最近结果、选择项目、新建会话、文档站点、使用帮助 |
| 项目选择 | 翻页、点选项目、帮助菜单 |
| 任务已接收 / 执行中 | 刷新状态、查看结果、停止当前任务、帮助菜单 |
| 已完成 / 中断 / 失败 | 查看结果、刷新状态、填写下一条任务、帮助菜单 |
| 多页结果或状态 | 上一页、下一页 |
| 审批详情 | 上一页、下一页、拒绝请求、帮助菜单；全部详情送达后才显示批准本次 |
| 结构化问题 | 填写回答，将 `/answer ID ` 放入输入框后自行补齐 JSON；帮助菜单 |

指令按钮发送与手动输入相同的 QQ 指令，仍经过本人校验、去重和单次审批。文档链接按钮直接打开网页。停止按钮绑定具体任务 ID，旧卡片不会误停新任务；批准请求过期或已处理后，旧按钮无效。
单聊按钮使用 `action.permission.type: 2`，由服务端根据事件中的 `author.user_openid` 校验绑定人。C2C 的 `user_openid` 不能作为客户端 `specify_user_ids` 的用户 ID 使用，否则手机 QQ 可能提示「无权限操作」，指令不会发出。更新并重启服务后，手动发送 `/help` 或 `/status` 获取新卡片；旧卡片的按钮权限不会随服务更新。
「输入任务」只填入 `/run `，不会自动开始执行。停止和批准带确认提示，服务端仍校验任务或请求是否有效。

卡片展示发送时的快照，点击「刷新状态」会发送新的卡片。任务输出和审批参数以转义后的引用正文显示，保留原文，避免输出中的链接、图片或伪造按钮被当成操作；分页不会丢失文字或拆坏 Unicode 字符。
每张卡片同时提供文字指令，便于不支持按钮的客户端使用。

若 QQ API 明确拒绝 Markdown 或按钮格式，当前进程会逐级改用「无按钮 Markdown → 纯文本」。每次尝试使用新的 `msg_seq`，仍计入同一输入最多 4 次回复的额度。
网络超时、额度限制、内容审核或未知错误不会自动重发；结果保留在本地，可发送新的 `/result` 查询。审批详情只有发送成功后才计入已查看页。

### 色彩与高亮

正文使用官方支持的标题、加粗、引用和分隔线。项目、任务编号及审批范围加粗显示，结果正文和操作指令分区。
⏳ 启动中、🔵 执行中、✅ 已完成、⏹️ 已中断、🔴 失败、🟡 待处理均保留文字说明，颜色只辅助识别。

按钮按官方 `render_data.style` 区分主次：蓝色线框（`1`）用于主要操作，灰色线框（`0`）用于辅助查询，白底红字（`3`）用于停止或拒绝。
官方还提供蓝底白字（`4`）样式，见[发送单聊消息 API 的 RenderData](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)。
这些是客户端预置样式，无法指定任意 RGB 颜色；[官方 Markdown 支持格式](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html)未提供正文文字颜色、背景色或 CSS 接口，也未承诺代码块语法高亮。
实际呈现由 QQ 客户端决定。本次 macOS QQ 联调中，彩色状态符号、加粗字段和蓝色线框按钮正常显示；API 接受了样式 `3` / `4`，但客户端仍把它们显示为灰色线框。因此主操作选择已验证的蓝色线框。文档展示图用于说明预置样式，不保证每个客户端呈现完全一致。

### 图片卡片与本地预览

当前开发构建支持在[本机客户端](/development/client-tool#图片展示与本机程序)选择是否展示图片，或执行 `el-bot codex preferences --message-format image --image-theme dark` 开启深色图片、`--message-format markdown` / `--message-format text` 关闭图片。设置写入当前实例配置，保留其他字段；等待任务完成后重启生效。此设置命令尚未包含在 npm `1.0.0-rc.2`。

图片模式在本机将帮助、项目、任务状态和结果卡片渲染成 PNG，支持浅色 / 深色主题及彩色状态条。帮助图片用高对比色突出命令，参数以较小字号显示，说明另起一行；提醒独立展示，图内不堆叠长网址。默认直接上传到 QQ，以富媒体消息展示图片，再发送一条带原生按钮的简短 Markdown 操作卡片；文字指令和文档链接保留为可复制、可点击内容。
审批和结构化问题详情继续使用原生 Markdown，确保完整内容可核对、可复制，图片加载失败不会影响审批详情的送达判断。管理 API 的文字结果也沿用原有分页。

先用包含 `render` 子命令的本地构建预览，不需要 QQ 凭据或 Codex 登录：

```bash
el-bot codex render --card result --theme dark --output ./result.png
el-bot codex render --card help --page 1 --output ./help.png
el-bot codex render --card help --page 1 --part 2 --theme dark --output ./help-next.png
el-bot codex render --card result --text-file ./result.txt --output ./result-preview.png
```

输出为 PNG，已有文件不会被覆盖。帮助预览的 `--page` 指定分类，`--part` 指定分类内页码；`--part` 仅用于帮助卡片。`--font-file`、`--font-family` 可指定本机字体；Linux 主机需安装中文字体，例如 Noto Sans CJK，或提供对应字体文件。默认使用本机字体，不下载字体、不执行结果中的 HTML 或 Markdown 链接。

要在 QQ 中展示，将配置改为：

```json
{
  "messageFormat": "image",
  "image": {
    "transport": "upload",
    "theme": "dark"
  }
}
```

此片段合并到已有配置，保留项目、传输方式、凭据和绑定。`theme` 可选 `light` / `dark`，默认 `light`；可额外配置 `fontFiles`（本地字体路径数组）和 `fontFamily`。

只设置 `"messageFormat": "image"` 也可启用默认的浅色上传模式。`image.transport: "upload"` 按官方流程调用 `upload_prepare`，将本地 PNG 分片 PUT 到 QQ 提供的预签名地址，再调用 `upload_part_finish` 和 `files` 完成上传。使用返回的 `file_info` 发送 `msg_type: 7` 图片，随后发送按钮与可复制指令。全程使用 `srv_send_msg: false`，不发送主动消息。每张卡片通常占用两次被动回复；剩余预算不足两次时改用原生 Markdown，不上传图片，总发送尝试仍不超过 4 次。接口见[单聊预上传](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_id_upload_prepare.post.html)、[分片完成](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_id_upload_part_finish.post.html)、[上传结果](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_files.post.html)。

真实 QQ 联调已验证本地 PNG 上传、平台图片链接可读取及 macOS QQ 富媒体图片展示。当前接口返回从 `1` 开始的分片编号，SDK 同时兼容文档中的从 `0` 开始编号。此机器人使用 `raw_url` 嵌入 Markdown 时，转存校验返回 `40034141`（图片转存失败）；富媒体消息接受键盘字段，但 macOS QQ 未展示按钮，所以直接上传模式分两条消息展示图片和操作卡片。`raw_url` 的有效期由平台决定，本次响应为 24 小时，不作为固定配置。

状态刷新和帮助翻页按钮也已通过 macOS QQ 实机验证。QQ 会把长图缩为缩略图，点击图片可放大查看；可复制指令和文档链接仍在图片后的操作卡片中。

上传模式不启动图片 HTTP 服务，也不接收 QQ 指令中的任意本地文件路径；只上传已经渲染的当前卡片。图片内容会传到 QQ 平台，临时链接有效期由响应 `ttl` 决定；不把预签名地址、`file_info` 或令牌写进运行日志、状态文件。每张 PNG 最大 2 MiB，高度最多 4000 像素，超限回退到 Markdown。链接过期后发送 `/status`、`/result` 或 `/help` 生成新图。使用 Webhook 接收事件时，事件入口仍需公网 HTTPS；WebSocket 接收加直接上传不需要入站公网端口。

如需自行托管图片，可使用以下可选配置：

```json
{
  "messageFormat": "image",
  "webhookPort": 8788,
  "image": {
    "transport": "public",
    "publicBaseUrl": "https://bot.example.com/qq-codex/images",
    "theme": "dark"
  }
}
```

此模式在 `127.0.0.1:webhookPort` 提供 `/qq-codex/images/<随机编号>.png`，需 HTTPS 反向代理转发图片路径，按平台要求配置图片域名。只配置 `publicBaseUrl` 的旧配置自动选择 `public`，不会改变已有接入方式。代理应只开放所需路径，关闭访问日志和外部缓存。地址使用随机 192 位编号，10 分钟后过期，不包含用户、项目或任务 ID；缓存只在内存中保存，最多 64 张、16 MiB，达到上限时淘汰旧图，退出清除。图片包含任务内容，持有链接即可读取。

`el-bot codex check` 只验证本机 PNG 渲染，不上传或发送图片。公网托管模式仍需验证反向代理与 Markdown 转存；它在一条 Markdown 消息中展示图片和按钮，并设置 `force_verify_image_resource: true`。API 成功响应不能保证所有客户端呈现一致。

渲染、上传失败时，在发送前回退为 Markdown，不消耗回复序号。平台明确拒绝富媒体图片时回退到原生 Markdown；明确拒绝 Markdown 格式时逐级尝试无按钮 Markdown、纯文本。公网图片模式也可降级为无按钮图片；转存校验明确失败时跳过图片，直接使用 Markdown。所有尝试共享既有的 4 次被动回复预算；网络超时、额度、内容审核和未知发送错误仍不自动重发。默认 Markdown 模式不启动图片 HTTP 服务。

### 可以在频道使用吗？

**QQ 官方频道支持消息收发；当前 `el-bot codex` 遥控仍只接入本人 C2C 私聊，不能直接在频道遥控。**
频道支持纯文本、Embed 和 Markdown 等消息，但自定义 Markdown 目前需要内邀开通，和已向所有机器人开放的单聊 / 群聊不同。
参考[各场景支持情况](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/overview.html)与[Markdown 能力说明](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html)。

频道接入需要处理 `AT_MESSAGE_CREATE`（`PUBLIC_GUILD_MESSAGES`），并通过 `/channels/{channel_id}/messages` 回传结果。
频道用户使用 `author.id`，不能把已有 C2C `user_openid` 绑定直接用于频道；必须建立独立的本人身份校验和频道 / 子频道白名单。
官方按钮的 `enter` 自动发送能力仅适用于单聊，频道的指令按钮需用户检查输入后发送。
协议见[频道消息事件](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/channel/message/event.html)与[发送子频道消息](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/channel/message/send.html)。
频道被动回复有效期为 5 分钟，长任务需要用户重新查询结果，不能照搬 C2C 的回复窗口。

频道成员可能看见任务输出与审批详情。建议先在仅本人可见的文字子频道验证；不要通过复用私聊绑定或默认接受全频道消息来接入本机执行。

## 执行与审批

Codex 使用 `workspace-write` 沙箱、`on-request` 审批策略和用户审批者，默认不允许工具联网。
这允许 Codex 在选定项目中编辑文件；需要升级权限的执行会转发到 QQ，由绑定人决定。
项目白名单约束任务工作目录，读取范围仍由 Codex 的沙箱实现决定。

应用展示审批参数及已收到的文件变更详情。长内容分多页，查看全部页后才能 `/approve`。
审批有 10 分钟有效期，只批准单次请求，不设置“本会话全部同意”，不写入长期授权规则。
停止任务会拒绝未处理的请求。暂不支持的额外权限请求、MCP elicitation 和未知工具请求会被拒绝，不会自动放行。

`/stop` 在任务启动阶段也有效；如果正在等待 `thread/start`，完成握手后不会再提交提示词。
RC.2 在中断轮次后，按当前任务的命令编号列出并终止仍运行的终端，确认它们不再运行后才报告「已中断」。等待确认期间不接收新任务；确认失败则返回 `stop-unconfirmed` 并暂停执行入口，不清理其他任务的终端。

此停止逻辑内部使用 `thread/backgroundTerminals/list` 与 `thread/backgroundTerminals/terminate`，已在 Codex CLI 0.154.0 验证。它需要在握手中启用实验协议能力，但不会因此开放通用实验管理 API；后者仍要求显式配置 `experimentalApi`。宿主不支持终端控制时，停止会明确失败。该确认覆盖 Codex 跟踪的命令终端，不能保证停止命令自行分离或转交给外部服务的工作。
Codex 进程退出或请求超时后，服务停止接收新的执行任务，仍允许查询已有结果。修复本机配置并重启后再继续。

## 消息、状态与重启

- QQ 回复使用 `msg_id + msg_seq`；应用最多回复同一条私聊消息 4 次，超过有效期或额度后保留结果供查询。
- 不逐 token 刷屏。默认发送接收卡片、审批卡片和最终结果；发送 `/status` 或 `/result` 可使用新的回复窗口。
- 输出按 UTF-8 字节分页，保存最近 20 个任务，每个任务最多保留最后 100,000 个字符。完整工具记录仍由本地 Codex 会话管理。
- 状态默认位于 `~/.el-bot/qq-codex-state.json`，包含绑定人、项目会话、去重记录和任务结果；文件权限为 `0600`（支持 POSIX 权限的平台）。
- 状态文件使用临时文件替换和单实例锁。不要把状态放在公开目录或允许 Codex 随意写入的项目内。
- 消息执行前先保存去重记录；平台重发不会重复启动同一任务。超过 5 分钟的历史输入不会提交为新任务。
- 进程重启会将未结束任务标为中断，**不会自动重放提示词**。查看工作区后发送新任务即可恢复绑定的会话。
- 极端断电发生在记录与执行之间时，任务可能没有开始；不会为了补偿而自动重复执行。

正常使用 Ctrl+C / SIGTERM 退出会停止接收消息、中断 Codex 并释放锁。
异常崩溃留下 `.lock` 时，先读取其中 PID，确认该进程不再运行，再手动移除锁文件。

## WebSocket 与 Webhook

默认 `websocket` 通过 `/gateway` 取得网关地址，订阅 `GROUP_AND_C2C_EVENT`，只分派私聊文本。
实现包含心跳确认、退避重连、会话恢复和无效会话后的重新鉴权，不需要公网入站端口。

个人遥控自己的电脑，建议使用 WebSocket。电脑主动建立连接，Codex 在本机运行，无需额外部署公网回调服务。
在 QQ 后台「开发设置 → 事件订阅与回调」中也要选择 **WebSocket** 并应用切换。
仅修改本地 `transport` 不会切换平台的推送方式；网关鉴权成功也不能单独证明消息事件已送到本机。
如果机器人原本使用 Webhook，切换会改变现有服务的事件接收路径，应先确认旧服务的用途。

面向多用户、运行在常驻服务器上的机器人，可以选择 Webhook，便于复用 HTTPS 服务的部署与监控。
如果 Codex 仍在个人电脑上，Webhook 接入服务器还需要维护到本机的可靠连接，不能直接替代本地执行进程。
无论使用哪种方式，本机服务停止、电脑休眠或网络中断时，都无法继续处理遥控任务。

如果机器人后台要求使用 Webhook，修改配置：

```json
{
  "projects": { "el-bot": "/absolute/path/to/el-bot" },
  "transport": "webhook",
  "webhookPort": 8788
}
```

服务只监听 `127.0.0.1:8788/qq/events`。使用自己的 HTTPS 反向代理/隧道暴露这个路径，
在 QQ 后台填写对应 HTTPS 回调地址并订阅单聊事件。
应用校验 AppID、时间戳和原始请求体的 Ed25519 签名，支持平台回调挑战；无有效签名的请求不会触发任务。
状态保存后即完成入站处理，Codex 执行及 QQ 回复在后台继续，不等待长任务完成才返回回调确认。

## 包结构与验证

```text
QQ 官方 API / Gateway / Webhook
  → packages/qq-sdk
  → apps/qq-codex（绑定、命令、状态、审批）
  → packages/codex（app-server stdio）
  → 本机 Codex 与选定项目
```

```bash
pnpm build
pnpm typecheck
pnpm typecheck:packages
pnpm test
pnpm lint
pnpm docs:build
```

测试使用本地 HTTP/WebSocket 服务、签名请求和模拟 JSONL 子进程，覆盖凭据刷新、重连、消息去重、
鉴权、审批、停止、崩溃与持久化。真实 QQ 联调还需要你自己的机器人凭据、后台权限和测试 QQ。
单独通过 `--check` 只代表本机 Codex 可通信，不代表 QQ 权限已经开通。

### 真实 API 联调记录

2026-10-05 使用自有 QQ 官方机器人、QQ 桌面客户端与本机 Codex 完成了以下验证：

- 使用已有 AppSecret 获取 AccessToken，配置出口 IP 白名单后成功获取网关地址。
- WebSocket 鉴权及本人私聊绑定成功，QQ 客户端收到官方 API 发出的绑定回复。
- 从 QQ 下发任务，在独立测试目录实际创建、读取标记文件，并收到 `QQ_CODEX_E2E_OK`。
- 使用 `/result` 查询结果，并在同一 Codex 会话继续任务，收到 `QQ_CODEX_RESUME_OK`。
- 升级后在 QQ 桌面客户端实际收到任务状态 / 结果 Markdown 卡片，点击「查看结果」「刷新状态」成功返回对应卡片；「输入任务」只填入草稿，没有自动执行。
- 核对括号、下划线与 Windows 路径显示，使用字符实体避免 QQ 将反斜杠括号识别为公式。

此记录验证了 WebSocket 收发和本地执行链路。Webhook、公网部署和需要审批的真实操作未包含在这次联调中；
自动化测试中的模拟验证不能替代相应环境的验收。凭据、OpenID 和会话状态仅保存在本机，不纳入仓库。

## 社区项目参考

调研日期：2026-10-05。以下为仓库文档核对，未使用真实 QQ 账号验证；当前实现独立编写。

| 项目 | 接入路线 | 可借鉴内容 |
| --- | --- | --- |
| [qq-codex-bridge](https://github.com/983033995/qq-codex-bridge) | QQ 官方机器人 → 本地服务 → CDP → Codex Desktop | 桌面会话绑定、QQ 消息与媒体处理；仓库为 MIT 许可证 |
| [codex-qq-bot](https://github.com/gl813788-byte/codex-qq-bot) | QQ / OneBot → 本地 Codex CLI 助手 | 会话管理与控制面板；未确认许可证，不复制实现 |

协议参考：[Codex app-server](https://learn.chatgpt.com/docs/app-server)、
[QQ API 调用](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html)、
[事件订阅](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、
[单聊发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)、
[回调签名](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html)。

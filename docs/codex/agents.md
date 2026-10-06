---
title: 选择 Codex、CodeBuddy 或 dsh
description: 比较三个本机任务程序的接入方式，配置 ACP 实例，并在 QQ 验证任务、续聊、审批与停止。
head:
  - - link
    - rel: alternate
      type: text/markdown
      href: /ai/codex/agents.md
---

# 选择 Codex、CodeBuddy 或 dsh

el-bot 可以把 QQ 私聊任务交给本机的 **Codex、CodeBuddy 或 DeepSeek Harness（dsh）**。三者共用本人绑定、项目白名单、消息去重、单任务执行、审批卡片与结果查询。

`el-bot agent` 是 `el-bot codex` 的通用别名，两者读取同一套配置。旧配置没有 `agent` 字段时继续使用 Codex；程序选择写在配置中，`--agent` 只用于 `init`，检查和启动时无需重复传入。

## 能力对比

| 能力 | Codex | CodeBuddy / dsh |
| --- | --- | --- |
| 本机协议 | Codex app-server | ACP v1 stdio |
| 提交任务、按项目续聊、查询结果 | 支持 | 支持；恢复依赖本机版本声明的能力 |
| QQ 单次审批 | 支持 | 支持 `allow_once`；仅提供永久授权的请求会取消 |
| `/stop` | 中断轮次并确认任务关联的 Codex 终端结束 | 发送取消，等待当前 prompt 的协议响应 |
| `/steer`、专用 `/review` | 支持 | 暂不支持；审查可用 `/run 审查未提交改动` |
| 手动绑定 / 分叉会话 | 支持 `/thread use`、`/thread fork` | 暂不支持 |
| 模型、技能、插件、MCP 与版本 API 目录 | 按配置和本机能力提供 | 暂不提供对应管理入口 |
| Codex Desktop 项目、聊天与工具管理 | 需显式接入桌面宿主 | 暂不支持 |
| `--profile` 隔离本机程序账户 | 新 Codex profile 使用独立 `CODEX_HOME` | 只隔离 el-bot 数据；程序沿用自己的本机账户配置 |
| `check` 的账户与模型预检 | 按账户类型检查 | 标为 `SKIP`；握手成功不代表登录、模型或额度可用 |

ACP 适配不会提供 Codex 的操作系统沙箱。项目白名单限制会话工作目录，工具实际可访问的范围由本机程序的权限规则决定。停止确认也不保证结束自行分离的子进程或远程服务中的工作。

## 准备 CLI

需要 Node.js 22.18+、QQ 官方机器人的 AppID / AppSecret，以及所选程序的本机 CLI。先在对应程序中完成账户登录或模型提供方配置。

CodeBuddy / dsh 接入属于当前源码新增能力；安装旧版 npm 包后不能直接套用这些命令。可在 el-bot 源码目录构建：

```bash
pnpm install
pnpm build
pnpm cli agent --help
pnpm cli agent init --help
```

后面的 `el-bot agent` 示例，在源码中替换为 `pnpm cli agent` 即可。需要独立安装时，按[安装 CLI](/development/codex-remote#安装-cli)打包当前源码。安装后用 `el-bot --version`、`el-bot agent --help` 和 `el-bot agent init --help` 核对功能；源码版本号与 npm 是否已经发布分别确认。

## 接入 CodeBuddy

确认本机 `codebuddy` CLI 可用，并在 CodeBuddy 中完成登录。el-bot 固定以 `codebuddy --acp --permission-mode default` 启动 ACP 子进程。

```bash
codebuddy --version
el-bot agent --profile codebuddy init --agent codebuddy --project /absolute/path/to/my-project --name my-project
el-bot agent --profile codebuddy paths
el-bot agent --profile codebuddy check --all --json
el-bot agent --profile codebuddy start
```

`init` 在终端询问 QQ AppID / AppSecret，密钥隐藏输入。检查通过后启动服务，并在自己的 QQ 私聊发送终端显示的 `/pair ...`。QQ 平台设置与绑定步骤见[完整接入](/development/codex-remote#三步开始)。

## 接入 dsh

这里的 dsh 指 **DeepSeek Harness**。确认本机 `dsh` CLI 可用，并准备可工作的 `acp` profile 与模型提供方配置。el-bot 固定以 `dsh --profile acp` 启动 ACP 子进程。

```bash
dsh --version
el-bot agent --profile dsh init --agent dsh --project /absolute/path/to/my-project --name my-project
el-bot agent --profile dsh paths
el-bot agent --profile dsh check --all --json
el-bot agent --profile dsh start
```

`--profile dsh` 是 **el-bot 实例名称**；子进程的 `--profile acp` 是 **dsh 运行配置**，二者作用不同。模型提供方需要环境变量时，按下一节设置变量名白名单。

## 配置可执行文件与环境

CodeBuddy 的最小配置如下，dsh 将 `agent` 改为 `dsh`：

```json
{
  "agent": "codebuddy",
  "projects": { "my-project": "/absolute/path/to/my-project" },
  "defaultProject": "my-project",
  "messageFormat": "markdown"
}
```

| 字段 | 用途 |
| --- | --- |
| `agent` | `codex`、`codebuddy` 或 `dsh`，默认 `codex` |
| `agentExecutable` | CLI 名称或可执行文件的完整路径；GUI 环境找不到 PATH 中的 CLI 时使用 |
| `agentEnvAllowlist` | 允许子进程继承的环境变量名数组；填写名称，值由运行服务的本机环境提供 |
| `projects` / `defaultProject` | 项目工作目录白名单与默认项目 |
| `messageFormat` | `markdown`、`image` 或 `text`；[展示设置](/development/client-tool#图片展示与本机程序)三者通用 |

例如 dsh 使用环境变量鉴权时，在配置中添加：

```json
{
  "agent": "dsh",
  "agentExecutable": "/absolute/path/to/dsh",
  "agentEnvAllowlist": ["DEEPSEEK_API_KEY", "DSH_HOME"],
  "projects": { "my-project": "/absolute/path/to/my-project" }
}
```

`agentExecutable` 不接受 shell 命令或附加参数。子进程默认继承平台运行变量、语言和代理设置，提供方密钥需要显式加入白名单；`QQ_BOT_*` 始终剔除。不要把密钥值写入 JSON、命令参数或 Git。

CodeBuddy / dsh 配置不要混入 `codexHome`、`codexExecutable`、`codexEnvAllowlist`、`codexSocket`、Desktop 设置或启用 `management` / `experimentalApi`。这些配置属于 Codex，混用会拒绝启动。

## 实例与续聊

为不同程序创建独立 profile。路径仍沿用 `~/.el-bot/codex/<profile>/`，其中 `config.json`、`credentials.env`、`state.json` 分别保存配置、QQ 凭据与绑定 / 任务 / 会话状态。目录名称中的 `codex` 是兼容布局，不表示当前使用 Codex。

ACP profile 不创建或使用 Codex 账户目录。`paths` 为兼容仍可能显示 `codexHome`，不要将它写入 ACP 配置或据此登录 Codex。CodeBuddy / dsh 自身账户隔离须按相应程序的方式配置。

状态会固定到程序及可执行文件，切换程序应创建新 profile 或新的状态文件。已有会话、任务且没有程序标识的旧状态不能直接交给 ACP 接管；保留原状态，不要只修改旧 Codex 配置的 `agent`。

每个项目保存自己的会话。恢复时优先使用程序声明的 `session/resume`，否则按能力使用 `session/load`；不支持恢复会明确失败，不会静默新建或重放提示词。加载历史消息不会混入当前任务结果。需要从新会话开始时使用 `/new my-project`，历史任务与本人绑定仍保留；离线恢复见[实例隔离与恢复](/codex/instances#明确恢复-不丢历史)。

## 在 QQ 中验证

完成 `/pair` 后：

1. 发送 `/help`、`/projects`，选择目标项目。
2. 发送「请只回复 QQ_AGENT_READY，不使用工具、不修改文件」。收到结果后用 `/result` 再次查询。这一步会调用所选程序的模型。
3. 发送一个后续问题，确认同一项目可以续聊；切换项目时各自保留会话。
4. 日常使用 `/status` 查看进度、`/stop` 请求停止；需要新上下文时用 `/new`。

ACP 权限请求会转成 QQ 审批卡片。用 `/approval ID` 查看全部详情页后，选择 `/approve ID` 或 `/reject ID`。只批准当前一次请求；过期、取消中、其他会话或没有 `allow_once` 选项的请求会取消。

`/stop` 等待当前 prompt 返回后才确认任务结束。超时或连接断开时标记 `stop-unconfirmed`，阻止继续执行新任务，保留状态与结果查询；在本机核对程序和任务进程后重启服务。

## 诊断与验证范围

`check --all --json` 汇总本机协议、项目 / 可查询会话以及 QQ 鉴权与网关检查，不提交模型提示词、不建立 QQ 长连接、不发送消息。

ACP 的账户与模型项显示 `SKIP`；不支持会话列表时，相应元数据诊断也会跳过，实际续聊能力由下一次任务验证。若握手通过但任务失败，在对应程序中检查登录、提供方、模型、额度与网络。

| 现象 | 处理 |
| --- | --- |
| 找不到程序 / 无法建立 ACP 连接 | 检查 CLI 版本与启动模式，GUI 环境中配置 `agentExecutable` |
| dsh 无法使用提供方配置 | 检查 dsh 的 `acp` profile、运行环境与 `agentEnvAllowlist` |
| 状态程序身份不匹配 | 核对原程序与路径；新程序使用新 profile，保留旧状态 |
| 会话不能恢复 | 核对原账户、项目与程序版本；明确选择 `/new` 后再提交新任务 |
| `/review`、`/rpc` 或 `/desktop` 不可用 | 这些专用接口属于 Codex；CodeBuddy / dsh 使用普通任务入口 |

已用本机 CodeBuddy / dsh 验证 ACP 初始化握手，自动测试覆盖会话恢复、审批、取消与程序隔离；尚未完成两者的真实 QQ 模型任务验收。Codex 的真实 QQ 验收记录见[联调记录](/development/codex-remote#真实-api-联调记录)，不能直接作为 ACP 的端到端验证。

本机客户端也能打开 Codex、CodeBuddy、dsh 和 QQ。打开桌面应用与选择任务程序分别配置；这类按钮只在客户端所在电脑唤起已安装程序。详见[本机程序设置](/development/client-tool#图片展示与本机程序)。

协议参考：[ACP 初始化](https://agentclientprotocol.com/protocol/v1/initialization)、[CodeBuddy IDE / ACP 集成](https://www.codebuddy.cn/docs/cli/ide-integrations)、[dsh ACP 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)。

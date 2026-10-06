---
title: 用 AI 快速接入
description: 复制提示词，让本机 AI 助手接入 Codex、CodeBuddy 或 dsh，检查环境并引导 QQ 官方机器人绑定。
head:
  - - link
    - rel: alternate
      type: text/markdown
      href: /ai/codex/ai-setup.md
---

# 用 AI 快速接入

可以把下面的提示词交给能执行本机命令的 AI 助手，例如 Codex 或 Claude Code。
助手使用现有 CLI 完成环境检查、项目配置和连接诊断。任务程序沿用自己的账户或模型提供方配置。
QQ 平台登录、密钥填写和首次 `/pair` 绑定由你在自己的设备上完成。

::: info 版本与实例
本文随源码更新。先检查安装版本和 CLI 帮助；CodeBuddy / dsh 需要当前源码构建或包含 ACP 功能的安装包，见[程序选择](/codex/agents)与[安装说明](/development/codex-remote#安装-cli)。
新实例使用独立 `--profile`；Codex 另需独立登录，ACP profile 只隔离 el-bot 数据。AppID 校验与恢复见[实例隔离与恢复](/codex/instances)。无需 YunLeFun 账户。
:::

## 复制给你的 AI 助手

填写目标程序与真实项目路径。已有实例请说明正在使用的 profile 或自定义路径；切换程序使用新实例。

```text
请帮我把 QQ 官方机器人接入本机 AI 程序，实际完成环境检查、初始化和连接诊断。

目标程序：codex（可改为 codebuddy 或 dsh；dsh 指 DeepSeek Harness）
目标项目绝对路径：<替换为自己的项目目录>
项目名称：my-project
新实例名称：personal（不同程序使用不同名称；已有实例沿用原 profile 或路径）
可选的 el-bot 源码目录或本地 tgz：<有则填写>

先阅读当前版本的 docs/codex/ai-setup.md、docs/codex/agents.md、docs/codex/instances.md 和 docs/development/codex-remote.md。
源码不可用时，读取 https://docs.bot.elpsy.cn/llms.txt 中的 Markdown 链接；
在线文档未部署或与安装包版本不同，使用对应 Git revision 的文档，不猜测参数。

请按以下步骤实际操作，并在缺少用户登录或凭据时说明当前需要我完成什么：
1. 检查操作系统、Node.js（22.18+）、包管理器、项目是否存在，以及目标程序的 --version。
   Codex 检查 codex login status；CodeBuddy / dsh 检查对应 CLI 与 ACP 启动模式，dsh 需要可用的 acp profile。
2. 执行 el-bot --version、el-bot agent --help 和 el-bot agent init --help，确认目标程序的接入入口。
   默认 Codex 也可使用 el-bot codex；旧版缺少 ACP 时使用指定的本地包或当前源码构建，
   源码目录先 pnpm install、pnpm build，再用 pnpm cli agent；不要在我的目标项目克隆工具仓库。
   不把源码版本号或 npm next 标签当成新增功能已发布的证据。
3. 用 el-bot agent --profile personal paths 核对配置、凭据和状态路径。已有实例保留绑定、会话和其他项目，
   不重复 init，不覆盖或删除状态，不启动第二个使用同一状态的实例。切换程序使用新 profile，不复用原会话状态。
4. 未初始化时执行 el-bot agent --profile personal init --agent <目标程序> --project "目标项目绝对路径" --name my-project --no-prompt。
   让我在本机交互终端或私有编辑器填写凭据。不要索要、读取、打印或上传 AppSecret、Token、完整凭据文件和状态内容；
   不把密钥写入聊天、命令参数、项目文件或 Git。只报告路径和脱敏结果。
   Codex profile 使用独立账户目录：设置 paths 中的 CODEX_HOME 后让我自己执行 codex login，不复制已有登录文件。
   ACP 沿用程序自己的账户配置，不使用 paths 的 codexHome，也不添加 Codex Desktop、management 或其他 Codex 专用设置。
   GUI 找不到 CLI 时设置 agentExecutable；提供方需要环境变量时仅将变量名写入 agentEnvAllowlist，值由本机环境提供。
5. 执行 el-bot agent --profile personal check；凭据填写完成后执行 el-bot agent --profile personal check --all --json。
   读取所有 checks 的 status、summary 和 actions；退出码 1 不代表所有项目都失败。
   这些检查不启动模型任务、不建立 QQ 长连接、不发送 QQ 消息。ACP 的账户和模型检查会 SKIP，不能因此报告已登录或模型可用。
   按报告处理 IP 白名单、程序配置和项目会话；登录或凭据未完成就保留进度并提示我，不删除状态或自动执行 recover。
6. 引导我在 q.qq.com 启用 WebSocket、设置出口 IP 白名单，并让测试 QQ 能添加机器人。
   如果原来使用 Webhook，说明切换会影响旧服务，让我决定是否切换或使用另一机器人。
7. 本地与 QQ 必需检查通过后，在我可见的终端运行 el-bot agent --profile personal start，保持前台运行。
   让我自己把终端的 /pair 绑定码私聊发给机器人，不发送给其他人，不设置开机启动。
8. 给我 QQ 验收步骤：/help 或 /menu 打开快捷菜单、/projects 点选项目（也可 /project my-project）、/status，随后由我发送
   “请只回复 QQ_AGENT_READY，不使用工具、不修改文件”，最后用 /result 查询，再发送一个后续问题验证续聊。
   最后报告已执行命令、检查结果、配置路径和仍待我完成的步骤。

以上 el-bot agent 命令在源码模式替换为 pnpm cli agent；Codex 旧入口 el-bot codex / pnpm cli codex 仍可使用。
每一步使用相同的 --profile；已有默认实例不要擅自改为新 profile。自定义 --config、--credentials、--state 时，每一步使用同样的路径，参数放在 agent / codex 后。
如果检查发现归档或目录变化，解释 /diagnose、/new 项目 和停止服务后 recover --project 项目的区别，保留历史，不自动重试任务。
```

## 助手的执行顺序

| 阶段 | 助手可以完成 | 用户完成 |
| --- | --- | --- |
| 检查环境 | 检测版本、项目路径、CLI 帮助与所选协议入口 | 在对应程序中登录或配置提供方 |
| 初始化 | 使用 `init --no-prompt` 创建项目配置与凭据模板 | 在本机填写 AppID / AppSecret |
| 检查连接 | `check`、`check --all`；输出脱敏诊断 | QQ 平台设置与登录 |
| 绑定和验收 | 在可见终端启动，解释 QQ 命令和预期结果 | 私聊发送绑定码与测试提示词 |

`init --no-prompt` 没有读取到凭据时会生成空模板；这属于“初始化完成、QQ 凭据待填写”，不能报告已接通。
`check --all` 检查本机协议与 QQ AccessToken / 网关地址。Codex 还按账户类型预检模型；ACP 的账户、模型以及不可查询的会话项会跳过。网络、额度和模型权限仍需真实任务验证，只有 QQ 私聊收到结果并能 `/result` 查询，才能确认端到端接通。
测试提示词会调用所选程序的模型，可能产生账户用量；只有用户发送后才执行。

## 非交互初始化示例

以下创建独立 CodeBuddy 实例；dsh 替换 profile 名和 `--agent` 值。Codex 独立登录步骤见[实例文档](/codex/instances#创建独立实例)。

```bash
el-bot agent --help
el-bot agent --profile codebuddy paths
el-bot agent --profile codebuddy init --agent codebuddy --project /absolute/path/to/my-project --name my-project --no-prompt
el-bot agent --profile codebuddy check
```

凭据填写与平台设置完成后：

```bash
el-bot agent --profile codebuddy check --all --json
el-bot agent --profile codebuddy start
```

已有配置时跳过 `init`。使用 `--config` 指定新配置时，还需要显式选择对应的 `--credentials` 与 `--state`；
仅换配置不会创建独立状态。不要把状态文件放到目标项目中。

## AI 可读的文档入口

文档构建从当前 Markdown 源文件生成以下产物，内容随版本一起更新：

- [llms.txt](/llms.txt)：接入导航与各页 Markdown 链接。
- [llms-full.txt](/llms-full.txt)：AI 接入、完整协议/命令、迁移与发布文档的合集。
- <a href="/ai/codex/ai-setup.md">本页 Markdown</a>：可直接交给本机助手阅读。
- <a href="/ai/codex/agents.md">程序选择 Markdown</a>：Codex / CodeBuddy / dsh 能力对比与 ACP 配置。
- <a href="/ai/development/codex-remote.md">完整接入 Markdown</a>：配置、权限、命令与排错。

`llms.txt` 是[社区提出的 AI 文档格式](https://llmstxt.org/)，不会自动赋予助手账户权限或代替 QQ 平台授权。
文档与安装版本不一致时，让助手读取对应 Git revision 的原始 Markdown。

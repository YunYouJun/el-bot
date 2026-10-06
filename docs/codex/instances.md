---
title: 实例隔离与恢复
description: 用 profile 隔离 QQ 机器人配置与会话，区分 Codex 和 ACP 的账户布局，并诊断和恢复续聊。
---

# 实例隔离与恢复

无需 YunLeFun 账户或额外控制台。QQ 官方 AppID / AppSecret 用于机器人鉴权，所选程序的本机账户或提供方配置用于模型访问；首次 `/pair` 将遥控权限限定到自己的 QQ。已有本人绑定会在重启后保留。

## 创建独立实例

每个机器人、程序或环境使用一个名称，例如 `personal`、`codebuddy`、`dsh`。名称只允许小写字母、数字、下划线和短横线，最长 64 个字符。先按[安装说明](/development/codex-remote#安装-cli)准备 CLI。

以下创建 Codex 实例：

```bash
el-bot codex --profile personal init --project /absolute/path/to/my-project --name my-project
el-bot codex --profile personal paths
```

| 内容 | personal 实例的默认路径 |
| --- | --- |
| 配置 | `~/.el-bot/codex/personal/config.json` |
| QQ 凭据 | `~/.el-bot/codex/personal/credentials.env` |
| 绑定、任务和会话索引 | `~/.el-bot/codex/personal/state.json` |
| Codex 账户配置与会话 | `~/.el-bot/codex/personal/codex/` |

新 profile 使用独立 `CODEX_HOME`，需要在该目录登录 Codex。请使用 `paths` 显示的绝对路径；以下是 macOS / Linux 示例：

```bash
CODEX_HOME="$HOME/.el-bot/codex/personal/codex" codex login
el-bot codex --profile personal check --all
el-bot codex --profile personal check --all --json
el-bot codex --profile personal start
```

Windows PowerShell 先设置 `$env:CODEX_HOME` 为 `paths` 的 `codexHome`，再执行 `codex login`。不要复制或上传另一个实例的登录文件。
初始化、检查、恢复和启动都应传入相同的 `--profile`。首启后把终端显示的 `/pair` 绑定码私聊发给机器人，后续启动无需重复绑定。

profile 的配置、凭据和状态目录独立，Codex 子进程也不会默认继承宿主的 `OPENAI_API_KEY` 等提供方密钥。需要自定义服务环境变量时，在配置中用 `codexEnvAllowlist` 指定变量名，例如 `["OPENAI_API_KEY"]`，由运行服务的环境提供值。平台运行变量、语言和代理设置继续可用；`QQ_BOT_*` 始终不传给 Codex。
这是账户和文件布局隔离，同一系统用户仍可访问这些目录；它不是容器或操作系统权限边界。

### CodeBuddy / dsh 的实例

```bash
el-bot agent --profile codebuddy init --agent codebuddy --project /absolute/path/to/my-project
el-bot agent --profile codebuddy paths
el-bot agent --profile codebuddy check --all --json
```

dsh 使用独立的 `--profile dsh` 和 `init --agent dsh`。ACP profile 仍将 el-bot 配置、凭据、状态放在 `~/.el-bot/codex/<profile>/`，但不创建或使用 Codex 账户目录；`paths` 为兼容显示的 `codexHome` 对 ACP 无效。

| 隔离内容 | Codex profile | ACP profile |
| --- | --- | --- |
| el-bot 配置、QQ 凭据、绑定与任务 | 独立 | 独立 |
| 本机程序账户与会话目录 | 独立 `CODEX_HOME` | 沿用程序自己的配置，需另按程序方式隔离 |
| 提供方环境变量 | `codexEnvAllowlist`，也可使用通用字段 | `agentEnvAllowlist` |

切换程序创建新 profile，不把已有 Codex 会话交给 ACP。可执行文件、环境变量与权限差异见[程序接入指南](/codex/agents)。

## 自动校验机器人与环境

首次启动会将状态固定到 AppID、QQ 测试环境 `sandbox`、profile 名称及程序身份：Codex 记录账户目录，ACP 记录程序与可执行文件。之后身份不匹配会在连接前报错，保留原绑定和历史。

旧版状态没有 AppID 元数据。升级后首次启动使用当次本机凭据接管，先生成 `state.json.before-instance.json` 私有备份，再保存元数据；它无法推断旧状态原本属于哪个 AppID。升级前请用 `paths` 核对原文件并确认凭据属于原机器人，不要删除状态来绕过检查。

ACP 另会拒绝接管已有会话 / 任务却缺少程序标识的旧状态。改用 CodeBuddy / dsh 时，应创建新实例；旧状态继续留给原程序。

显式 `--credentials` 或 `--profile` 只读取指定实例的凭据文件，不接受环境变量覆盖，也不回退到当前目录 `.env`。AppID 和 AppSecret 必须来自同一个来源，缺少其中之一就报错。
默认模式继续按「完整进程环境 → 默认凭据文件 → 当前目录 `.env`」读取，任何来源只有半套凭据时都不会与另一个来源拼接。

未指定 profile 时，旧配置、凭据和状态路径继续有效，Codex 沿用本机目录，已有绑定无需迁移。仅更换 `--config` 不会自动隔离凭据和状态；建议新实例使用 profile。
如果要保留原 Codex 目录，也可以显式使用三组独立路径：`--config`、`--credentials`、`--state`。不要让多个进程共享状态文件。

## 归档检测与连接诊断

```bash
el-bot codex --profile personal check --all
```

Codex 检查会读取会话并分页查询归档列表，区分可续聊、已归档、丢失和项目路径变化。启动时提示不可续聊的项目，但保留 QQ 查询与恢复入口；每次续聊前再次检查，不会自动取消归档或重放任务。
在 QQ 中发送 `/diagnose [项目]`，可以只读查询对应项目的会话状态，不调用模型。连接断开时，会提示在本机检查和重启。
`check --all` 另外验证 QQ 鉴权和网关访问；Codex 按账户类型预检模型，ACP 的账户与模型项跳过。ACP 会话元数据只在程序提供查询能力时检查，实际恢复在续聊时验证。检查不启动模型任务或 QQ 长连接；最终是否接通仍需用户在 QQ 发送测试任务并收到结果。

检查会汇总各项结果：会话或本机程序失败不会遮住独立的 QQ 检查；AppID / 环境 / 程序身份不匹配则阻止连接。
`PASS` 表示预检通过，`FAIL` 表示需要处理，`SKIP` 表示前置条件不满足、能力不可用或该程序不提供此项预检。任一失败的退出码为 `1`。
`--json` 输出 `version`、`ok` 和 `checks`；每项包含 `id`、`status`、`summary`，失败时提供 `actions`。
修复命令保留本次 profile 和配置 / 凭据 / 状态路径，适合交给 AI 继续排错。报告不包含密钥、主人 ID、会话 ID 或原始服务端错误；本机路径仍应视为私人信息。
只有显式运行 `recover` 才改变续聊索引；诊断不会重置绑定、自动取消归档或重试任务。

## 明确恢复，不丢历史

失败卡片按原因提供「连接诊断」「新建会话」按钮。新建按钮绑定失败任务所属的项目，避免切换项目后误改当前项目。

- 服务在线：发送 `/new my-project`，清除该项目的续聊索引；省略项目时使用当前项目。
- 服务不可用：先停止进程，再在本机运行 `el-bot codex --profile personal recover --project my-project`。
- Codex 想手工绑定已有会话：核对原账户、目录和归档状态后，使用 `/thread use 会话ID`。归档会话须由用户明确取消归档后再绑定；ACP 暂不支持手工绑定。

本机 `recover` 会先备份原状态并检查实例身份和状态锁，只清除指定项目的续聊绑定。本人绑定、其他项目、任务结果、消息去重记录和原程序中的会话都保留；ACP 可用相同的 `el-bot agent --profile 名称 recover --project 项目`。
恢复命令不连接 QQ、不启动模型，也不自动重试失败任务；下一条用户任务才创建新会话。备份文件含私人会话信息，勿提交到 Git 或上传。

## 与 Desktop 连接的区别

本节仅适用于 Codex。CodeBuddy / dsh 不接受 Codex Desktop 配置。

`codexConnection: "desktop"` 使用桌面正在运行的后端，账户和会话目录由桌面决定，因此不支持 profile 的独立 Codex 目录。需要连接该后端时，使用独立 `--config`、`--credentials`、`--state` 隔离机器人数据，并遵循 [Desktop 接入](/codex/desktop)。
默认 stdio 的 profile 可以单独配置桌面宿主工具；宿主工具仍操作桌面自己的账户与数据，其权限不受 profile 的 Codex 目录隔离。

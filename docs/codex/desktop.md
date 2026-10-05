---
title: 从 QQ 管理 Codex Desktop
description: 接入桌面宿主项目、聊天、侧栏、工作树、插件和自动化，按本机版本发现 API 并确认管理写操作。
---

# 从 QQ 管理 Codex Desktop

::: warning RC 中的实验功能
Desktop 宿主和共享后端管理属于显式启用的实验功能，不计入基础 C2C 遥控的稳定性承诺。
首次接入以当前安装版本的 `desktop-check` 和真实只读列表为准；尚未完成宿主联调的配置不能仅凭自动化测试宣布可用。
:::

接入桌面适配器后，可以在 QQ 查看 Codex Desktop 的项目、聊天与工具目录，调用宿主提供的聊天、侧栏、工作树、插件和自动化工具。宿主目录会随安装版本变化；`/desktop tools` 是当前可用范围的依据。

## 两个接入层

| 接入层 | 用途 |
| --- | --- |
| app-server | 项目与会话协议、模型、Skills、MCP、插件、配置和事件 |
| Desktop 宿主 | 桌面项目、聊天、侧栏、工作树、插件和自动化等宿主工具 |

app-server 的目录与协议功能使用 `management.enabled`、`experimentalApi` 配置；Desktop 宿主使用 `desktop.server`、`pipePath`、`threadId` 配置。

`/projects` 继续表示 el-bot 配置中的可执行项目白名单。`/desktop projects` 调用宿主的 `list_projects`，显示桌面项目。浏览桌面项目不会自动将目录加入执行白名单。

app-server 的 `project/list` 与桌面宿主的 `list_projects` 属于不同接口。它们返回的项目是否一致，取决于 Desktop 使用的后端、版本和数据源。不得把会话中的 `cwd` 去重结果称为完整桌面项目列表。

## 本机准备

先完成[QQ 绑定和基础接入](/development/codex-remote)。桌面应用需要保持运行，并提供其随应用分发的 `codex-app-tools/server.mjs` 以及 `CODEX_APP_TOOLS_PIPE_PATH` 管道。选择一个已有桌面聊天，作为管理工具调用的专用上下文。

```bash
el-bot codex desktop-init \
  --thread-id <专用桌面聊天ID> \
  --pipe-path <运行中宿主提供的绝对管道路径>
el-bot codex desktop-check
el-bot codex start
```

`desktop-init` 保留已有项目、模型、凭据和绑定；已有 `desktop` 配置时拒绝覆盖。默认定位已安装的适配器，也可用 `--server /absolute/path/to/server.mjs` 指定。所有命令支持既有的 `--config`、`--credentials` 和 `--state` 参数。

`desktop-check` 只调用工具目录和项目列表，不创建聊天、不启动模型任务、不发送 QQ 消息。它同时验证宿主可达性和专用聊天的工具调用权限。

::: warning 宿主接入条件
桌面适配器依赖运行中的宿主管道，是随 Codex 应用分发的能力，尚无可承诺跨版本稳定性的外部 Desktop SDK。若当前运行环境没有提供管道路径，应停在基础 app-server 接入；程序不会扫描、猜测管道或伪造宿主身份。仅找到适配器文件不代表已成功连接 Desktop。
:::

## 共享 app-server

默认 `codexConnection: "stdio"` 创建自己的 app-server。要连接已有后端，可配置：

```json
{
  "codexConnection": "desktop",
  "codexSocket": "/absolute/path/to/app-server-control.sock",
  "experimentalApi": true,
  "management": {
    "enabled": true,
    "allowedMethods": []
  }
}
```

`desktop` 连接模式运行 `codex app-server proxy`；省略 `codexSocket` 使用 CLI 的默认控制套接字。它连接已经运行的后端，不会自行启动或重启 daemon。仅当 Desktop 也连接该后端时，两者共享正在加载的会话；不要把同一账户等同于同一运行进程。

服务退出只终止自己的代理进程，不停止共享 daemon。标准任务继续使用当前项目、单任务准入和原有执行审批。用 `/threads` 浏览当前项目会话，`/thread use ID` 绑定已有会话，再直接发送任务续聊。

## QQ 命令

| 命令 | 功能 |
| --- | --- |
| `/desktop projects` | 桌面宿主项目列表 |
| `/desktop chats` | 桌面聊天、固定项和侧栏信息 |
| `/desktop tools [页码]` | 当前宿主工具目录 |
| `/desktop schema 工具 [页码]` | 工具说明和输入 schema |
| `/desktop call 工具 JSON` | 校验参数后调用宿主工具；写操作先生成待确认请求 |
| `/api [方法前缀] [页码]` | 当前 CLI 版本生成的 app-server 方法目录 |
| `/api schema 方法 [页码]` | 方法参数定义 |
| `/api type 类型名 [页码]` | 查看参数中 `$ref` 引用的类型 |
| `/rpc 方法 JSON` | 调用该版本提供的协议方法 |
| `/models`、`/skills`、`/plugins`、`/mcp` | 浏览模型、技能、插件和 MCP 状态 |
| `/threads [游标]` | 当前执行项目的会话列表 |
| `/thread use ID` | 绑定当前白名单项目的已有会话 |
| `/thread fork` | 复制当前会话历史，绑定新会话；不启动模型任务 |
| `/review [目标 JSON]` | 代码审查，默认审查未提交改动；沿用任务审批和结果机制 |
| `/steer 提示词` | 向当前执行中的任务补充要求 |
| `/events [页码]` | 最近 50 条脱敏 app-server 通知 |
| `/inspect ID [页码]` | 查看待确认管理操作全部详情 |
| `/confirm ID`、`/cancel ID` | 执行一次管理操作或取消 |
| `/manage-result ID [页码]` | 查询最近管理结果 |

这些目录命令与参数 schema 来自实际安装版本，不维护一个宣称永远完整的静态 API 清单。本机 CLI 也可以独立生成协议目录：

```bash
el-bot codex api --experimental
el-bot codex api --experimental --method project/list
```

后一条同时输出引用类型，可用于查阅复杂参数。生成 schema 不运行模型；需要与运行后端匹配的 CLI 版本。`experimentalApi: true` 只开启协议协商，不会安装插件、授予宿主权限或保证实验功能可用。官方把部分插件管理 API 标为开发中，生产使用需要自行评估当前版本。

## 管理操作示例

先浏览工具和参数，再发出具体调用：

```text
/desktop projects
/desktop chats
/desktop schema set_thread_title
/desktop call set_thread_title {"threadId":"目标聊天ID","title":"新标题"}
/inspect 返回的请求ID
/confirm 返回的请求ID
```

聊天归档、固定、侧栏移动、工作树操作、插件管理和自动化使用相同流程。具体工具名及参数以 `/desktop tools` 和 `/desktop schema` 为准；没有出现在目录中的功能不会被伪装成可调用接口。

对于 app-server，例如归档当前项目的一条会话：

```text
/api schema thread/archive
/rpc thread/archive {"threadId":"当前项目会话ID"}
/inspect 返回的请求ID
/confirm 返回的请求ID
```

## 权限与执行边界

所有命令先经过本人绑定、消息去重和持久化检查。已知只读查询直接执行；其他操作全部先展示详情，只有成功送达全部详情页后，才接受同一个请求 ID 的确认。请求 10 分钟过期，不跨进程恢复。失败、超时、重复按钮和断线不会自动重放写操作。

管理写操作与标准任务互斥；待确认时不能启动另一条标准任务。管理结果最多缓存最近 20 次，每次最多 100000 个字符，单条 QQ 消息按字节分页；进程退出后不保留这些管理结果。原有标准任务结果仍按既有状态机制保存。

`/rpc` 对已提供的线程 ID 读取并核验工作目录，对文件路径进行绝对路径与符号链接校验；会话浏览限当前项目。文件创建、删除、复制等路径必须落在执行项目白名单内。桌面工具的路径参数同样校验；无本机路径的聊天、侧栏等管理工具仍由宿主执行自己的访问检查。

模型任务的 `thread/start`、`thread/resume`、`thread/fork`、`turn/start`、`turn/steer`、`review/start` 不通过通用 `/rpc` 旁路启动；使用 `/run`、`/thread use`、`/thread fork`、`/new`、`/review` 和 `/steer`，保持单任务管理。实时音频会话和服务端任务队列暂未接入该任务机制，`thread/realtime/start`、`thread/queue/start` 不接受通用调用。账户登录、退出、配置写入、进程执行及其他特殊接口需在本机 `management.allowedMethods` 中明确许可，许可后仍逐次确认。不要为方便而批量打开特殊权限。

审查可指定目标，例如 `/review {"type":"baseBranch","branch":"main"}`、`/review {"type":"commit","sha":"提交ID"}` 或 `/review {"type":"custom","instructions":"检查鉴权边界"}`。运行中的审查同样支持 `/status`、`/stop` 和 `/result`。

工具调用始终携带配置的真实桌面聊天 ID，并由随应用提供的 MCP 适配器转交宿主。不绕过宿主的审批、账户访问或插件权限。QQ 显示的结果隐藏已识别的凭据、环境变量和本机路径；应避免让工具生成或回传私密资料。

## 验证范围

自动化测试使用本地协议和 MCP fixture 验证目录发现、schema 校验、聊天元数据、凭据隔离、审批送达、单次执行、项目路径与符号链接边界。基础 QQ 链路的真实联调记录仍见[接入文档](/development/codex-remote#真实-api-联调记录)。这些测试不代表已完成真实 Desktop 宿主联调；本机接入必须以 `desktop-check` 成功及实际只读列表为准。

协议参考：[OpenAI Docs：Codex App Server](https://learn.chatgpt.com/docs/app-server)。

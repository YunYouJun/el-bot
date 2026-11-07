# 小云

小云是 el-bot 的完整助理形态：同一套会话同时出现在 QQ、Mac 和 iPhone / iPad 里。你可以在私聊或群里问它问题，也可以在客户端接着同一个话题继续做任务。

本页描述仓库中的参考实现。你可以用自己的账号和实例复现，会话与任务都在你自己的机器上执行，模型请求按所选的 provider 发送。QQ 侧不需要公网 IP、端口映射或内网穿透；选择 DeepSeek 时可以国内直连。

## 不只是「QQ 遥控 AI」

遥控是任务入口，小云是持续在场的助理。

| 入口 | 能做什么 |
| --- | --- |
| QQ 私聊 | 派任务、逐次审批、查询结果、继续上一次会话 |
| QQ 群聊 | 接收群消息、按群维护会话、查看引用与附件、主人手动接管 |
| macOS / iOS | 原生会话列表、模型切换、人物卡、群聊记录与本机手机能力 |
| DSH Web | 在 App 内打开完整工作区，与桌面共用同一会话 |
| 企业微信 | 同一套 el-bot 也能接入智能机器人或桥接 Grok Bot 自动问答 |
| 网络与模型 | QQ 机器人主动出站连接，不需要公网 IP 或内网穿透；模型可选 DeepSeek 国内直连 |

## 什么时候直接用 Codex

小云不替代 Codex 客户端。一直在电脑前工作时，直接打开 Codex 通常更顺。

| 场景 | 更合适的选择 |
| --- | --- |
| 在电脑前连续编码、需要完整 IDE 与终端 | Codex 客户端 |
| 需要 Codex Desktop 的项目、聊天和工具管理 | Codex 客户端 |
| 需要 `/steer`、专用 `/review`、手动分叉会话 | Codex 客户端 |
| 人不在电脑前，想异步派任务并接收结果 | 小云 |
| 想在手机上完成审批、继续同一会话 | 小云 |
| 想在 QQ 群里使用助理或查看群聊记录 | 小云 |
| 想自托管，并让整条链路使用国内可直连的模型 | 小云 + DeepSeek Harness |

如果你已经能随时打开 Codex 客户端，并且它的通知和远程能力够用，就不需要多一层小云。

## 连接 DeepSeek Harness

DeepSeek Harness（dsh）通过 ACP stdio 接入。小云不读取或改写 DSH 的会话文件，只调用它公开的会话、模型与上下文接口。

```bash
dsh --version
el-bot agent --profile dsh init --agent dsh \
  --project /absolute/path/to/project --name my-project
el-bot agent --profile dsh check --all
el-bot agent --profile dsh start
```

`--profile dsh` 是 el-bot 的实例名；子进程固定使用 `dsh --profile acp`。需要环境变量鉴权时，把变量名加入 `agentEnvAllowlist`，例如 `DEEPSEEK_API_KEY`、`DSH_HOME`；密钥值留在本机环境，不写进 JSON 或 Git。

接入后可以继续会话、逐次审批和停止任务，也能使用模型切换、上下文压力、人物卡与 DSH Web。与 Codex 相比，ACP 路径暂不提供 `/steer`、专用 `/review`、手动分叉、Desktop 管理和操作系统沙箱；`check` 也不会代为验证 DSH 的登录、模型或额度。

完整配置、环境变量和验证步骤见[接入 dsh](/codex/agents#接入-dsh)。

## 主要能力

- **跨端会话**：QQ、Mac、iPhone 与 Web 使用同一个会话 ID，历史和模型选择在服务端统一保存。
- **任务与审批**：需要更高权限时在 QQ 或客户端查看请求，逐次批准或拒绝。
- **人物卡**：切换人设、预览历史版本、导入与回滚，原生端与 Web 共用同一份人物卡库。
- **上下文可见**：会话顶部显示上下文占用，信息页可查看压缩策略并跳转到 DSH 管理界面。
- **群聊边界**：仅主人私聊拥有工具、管理和审批入口；群聊成员不会因为自称「主人」获得权限。
- **手机能力**：经本机 iCTRL 运行器打开白名单 App，再把结果带回小云。

## 与 el-bot 的关系

```text
QQ / 企业微信 / macOS / iOS / Web
                ↓
        小云：助理与会话层
                ↓
  el-bot：机器人、CLI、插件与部署
                ↓
  Codex / CodeBuddy / DeepSeek Harness
```

**el-bot** 是框架和工具箱：QQ / 企微机器人、`el-bot agent` CLI、插件体系、部署与发布流程，适合自己搭建和改造。

**小云** 是这套框架的一个完整实践：固定的助理人设、跨端会话、人物卡、群聊和客户端体验。名字里的「小云 Bot」只指具体的 QQ 机器人账号，不用来称呼整个产品。

## 和 Grok Bot 的区别

Grok Bot 的官方例程擅长把一次单聊问题交给 Webhook 任务，再把最终答案回传；小云更关注持续会话：多轮上下文、工具调用、群聊隔离和多端接力。

两者也可以组合：企业微信入口用 Grok Bot 的官方 Webhook，QQ、客户端和 DSH Web 继续走小云。

## 开始使用

- **已有的小云实例**：在 iPhone / iPad 上配对后打开「小云」标签，或直接在 QQ 私聊里开始。
- **在自己的机器上复现**：[桌面与移动客户端](/development/client-tool) 、[iOS 会话与网页](/development/ios-companion)。
- **从框架开始**：[选择 Codex / CodeBuddy / dsh](/codex/agents) 、[QQ 遥控接入](/development/codex-remote)。
- **扩展入口**：[人物卡](/development/personas) 、[手机助手](/development/ios-device-assistant) 、[企业微信](/guide/wecom)。

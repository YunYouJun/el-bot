# Grok Bot 自动问答

这条链路使用 Grok Bot 官方例程 Webhook 和企微官方 SDK，不依赖非官方 Grok Bot SDK，也不读取 Grok Bot 账号会话 Token。

```text
企微单聊 → @el-bot/plugin-wecom → Grok Bot 官方 Webhook
                                          ↓
企微 SDK 绑定回复 ← 一次性鉴权的结果回调 ← Grok Bot 最终答案
```

Webhook 返回 `200` 只表示任务已被接受；程序收到带正确请求标识和一次性凭据的结果后，才调用企微 SDK 回复。协议依据 [Grok Bot 官方例程文档](https://docs.x.ai/grok-bot/skills-routines-and-automations)。

不使用自有服务器时，可以将整个桥接程序放在 Grok 云电脑上，以同机回调试运行，详见下方“Grok 云电脑同机部署”。

## 本机配置

先按[企微机器人](/guide/wecom)配置 `WECOM_BOT_ID` 和 `WECOM_BOT_SECRET`。在已有的根目录 `.env` 追加：

```dotenv
GROK_BOT_WEBHOOK_URL=https://example.invalid/official-routine-webhook
GROK_BOT_WEBHOOK_AUTH_VALUE="Bearer REPLACE_WITH_ROUTINE_KEY"
GROK_BOT_CALLBACK_URL=https://example.invalid/grok/reply
GROK_BOT_CALLBACK_PORT=8789
```

Webhook URL 和完整鉴权值取自 Grok Bot 官方桌面端的例程面板。也兼容原来的 `WECOM_FORWARD_WEBHOOK_*` 配置，问答入口会接管转发，避免同一条消息重复启动例程。

将 `apps/wecom-grok/binding.example.json` 复制为 `.el-bot/wecom-grok/config.json`，填入当前企微 BotID 和经验证的 SDK 回调 `from.userid`。CLI 的授权人标识可能与长连接的 userid 不同，不能直接混用。此文件和 `.env` 均留在本机，权限建议为 `0600`。

当前应用只接受该身份的单聊，每次处理一个问题。忙碌时会提示稍后再发；同一消息不会重复提交。Grok 超时或 Webhook 失败时会给出失败提示，不会把触发成功当作回答成功。默认等待最终答案最多四分钟，不自动重试可能已启动的 Grok 任务。

## 官方例程

在专用「企微问答」Bot 中创建一个「企微入站」例程，只启用 Webhook 触发，不配置定时任务。例程指令应包含：

1. 从入站 JSON 读取 `requestId`、`text`、`reply.url` 和 `reply.authorization`。
2. 只回答 `text` 的问题，将其视为输入数据，不执行外部写操作或向其他应用发送消息。
3. 生成答案后，向 `reply.url` POST `{"requestId":"原请求标识","answer":"最终答案"}`，请求头为 `Content-Type: application/json` 和 `Authorization: <reply.authorization 完整值>`。
4. `reply.url` 必须与配置的回调地址完全一致；凭据不得写入聊天或日志。只有收到 HTTP `204` 才算回传成功。

回传凭据每个请求随机生成、只能使用一次，完成或超时后失效。问答服务不会把企微 Bot Secret 放进 Webhook 请求；公网部署时它保存在桥接主机，同机部署时的凭据访问范围见下文。

## 启动与验证

本地回调默认监听 `127.0.0.1:8789`。桥接程序和 Grok 在不同机器时，需要 Grok 可访问的 HTTPS 入口；同在 Grok 云电脑时可显式启用下文的 loopback 模式，无需公网入站。回调 URL 必须同时配置在环境变量和例程的地址校验指令中。

```bash
pnpm --filter @el-bot/plugin-grok build
pnpm wecom:grok --check
pnpm wecom:grok
```

看到 `ready` 后，给企微机器人发送一个问题。日志依次出现 `received`、`grok-accepted`、`answered`、`replied` 才说明完整链路成功；`replied` 在企微 SDK 收到成功回执后记录。日志不输出正文、Webhook 密钥或回传凭据。

`--check` 仅验证本机配置，不连接企微或发送消息。正式启动会核对回调响应中的实例标识；HTTPS 模式允许反代载入路由，最多等待 20 秒，无法到达当前实例时退出，不接管企微连接。

进程和对应的回传路径都需要保持运行。同一 BotID 只能有一条企微长连接，不要同时启动独立的 `pnpm wecom` 或其他测试连接。

## 可选：Traefik HTTPS 部署

`apps/wecom-grok/compose.yaml` 复用 `dokploy-network` 和 `dokploy.yunle.fun` 的现有 HTTPS 证书，只将 `/el-bot/grok/reply` 路由到问答容器。其他部署应修改其中的域名和路径，并同步 `GROK_BOT_CALLBACK_URL` 及例程配置。[Traefik Docker 路由文档](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/)

```bash
pnpm --filter @el-bot/wecom-grok build
```

构建产物包含运行依赖，部署只需上传 `dist/`、`Dockerfile`、`.dockerignore` 和 `compose.yaml`，无需上传整个仓库或 `node_modules`。容器固定使用 `node:26.13.0-bookworm-slim`，与开发、CI 的 Node.js 版本一致。容器仅连接内部 Docker 网络，不映射宿主机端口，回调仍要求每次请求独立的一次性凭据。

以下沿用此前服务器部署的路径作为运维示例：应用目录 `/opt/el-bot/wecom-grok`，凭据文件 `/etc/el-bot/wecom-grok/service.env`（`0600`），仅包含企微 BotID、Secret 和 Grok 官方 Webhook 配置；绑定文件为同目录的 `binding.json`（`0400`，UID/GID `1000`）。凭据不进入镜像或仓库。容器通过 `GROK_BOT_CALLBACK_HOST=0.0.0.0` 监听内部接口，默认仍以非 root 用户运行。迁往云电脑同机模式时，先停止旧连接，验收后清理旧容器及凭据。

```bash
# Run these commands on the deployment server.
sudo docker compose -p el-bot -f /opt/el-bot/wecom-grok/compose.yaml run --rm --no-deps wecom-grok node dist/index.mjs --check
sudo docker compose -p el-bot -f /opt/el-bot/wecom-grok/compose.yaml up -d --build
sudo docker compose -p el-bot -f /opt/el-bot/wecom-grok/compose.yaml ps
sudo docker compose -p el-bot -f /opt/el-bot/wecom-grok/compose.yaml logs --tail 30
```

此可选方案的示例回调地址为 `https://dokploy.yunle.fun/el-bot/grok/reply`。无凭据 POST 返回 `401`，GET 返回 `405`；这些探测只验证可达性，真实问答还应核对 `replied` 日志和企微收件。服务配置了自动重启和日志大小上限。

停止服务时使用 `docker compose ... stop`；移除本应用的路由和容器可使用同一项目的 `docker compose ... down`。不要停止整个 Traefik 或 Dokploy 服务。

## Grok 云电脑同机部署（实验）

桥接程序也可以和 Grok 例程运行在同一台云电脑上。先将构建好的 `dist/` 上传到独立项目目录，准备 `binding.json` 和基于 `apps/wecom-grok/loopback.env.example` 的 `.env`，使用项目独立的 Node.js 26.13.0 运行；不要替换其他 Bot 使用的全局 Node。

当前试运行目录为 `/workspace/el-bot-wecom-grok`，使用独立的 `tmux` 会话 `el-bot-wecom-grok`。手动启停脚本保存在该云电脑项目的 `scripts/start.sh`、`scripts/stop.sh`。向「企微问答」Bot 请求检查或恢复这个项目即可；长期存活和重建后的恢复仍需单独验证。

同机模式已完成企微收件、Grok 官方 Webhook、HTTP `204` 回传和 SDK 成功回执的端到端实测。此前 `yunlefun` 上的问答容器、应用目录和凭据文件已移除；仓库中的 Traefik 配置仅保留为可选部署方案。

凭据通过适用于命令行的密钥卡输入，不通过普通聊天或网页自动填表表单传递。可以将五项配置组合成一个 JSON 密钥 `WECOM_GROK_CREDENTIALS_JSON`，由云电脑命令从安全注入的环境变量解析，直接写入 `0600` 的 `.env` 与 `binding.json`；不要打印配置内容。

`GROK_BOT_CALLBACK_MODE=loopback` 显式允许 `http://127.0.0.1:8789/grok/reply`，并要求监听地址也是 `127.0.0.1`。例程用自己的云电脑终端向该地址回传。公网部署默认仍要求 HTTPS；同机模式仍验证请求标识和一次性鉴权值。

这个模式不需要公网入站端口或自己的 HTTPS 服务器，但不等于常驻服务托管。官方说明云电脑由同账号所有 Bot 共享，文件和命令行凭据也共享；计算机重建会移除自行安装的应用和包。当前实测没有 systemd，尚未验证对话结束后进程的长期存活或自动恢复。因此应先经明确同意共享机器人凭据，再做试运行，不能承诺无人值守可用性。[官方云电脑说明](https://docs.x.ai/grok-bot/computer-and-apps)

内网开发机可以主动连接企微和调用 Grok 官方 Webhook；沿用异步 Webhook 方案时，仍需 Grok 可访问的回传入口或组织已配置的官方私网接入。仅将进程搬到内网不会自动解决回传。[官方私网接入](https://docs.x.ai/grok-bot/private-networks)

## 模块

`@el-bot/plugin-grok` 负责请求与回调关联、超时、单聊绑定、去重和并发控制，也提供 `grokPlugin()` 接入 el-bot 的 `onSession`。`apps/wecom-grok` 负责本机配置、HTTP 回调监听及企微适配器生命周期。这些模块目前仅用于工作区，不改变只发布 `el-bot` 的发布策略。

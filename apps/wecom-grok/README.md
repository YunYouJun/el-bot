# 企微与 Grok Bot 自动问答

企微官方 SDK 收取单聊文本，调用 Grok Bot 官方 Webhook 例程；收到一次性鉴权的结果回调后，用原企微消息绑定的 SDK 回复发送最终答案。

从仓库根目录执行 `pnpm wecom:grok`。完整配置、例程指令、HTTPS 回调及验收步骤见[自动问答文档](../../docs/guide/grok.md)。不需要 Grok Bot 账号 Token 或非官方 SDK。

`pnpm --filter @el-bot/wecom-grok build` 生成包含依赖的独立产物。Grok 云电脑同机试运行使用 `loopback.env.example`，仅监听 `127.0.0.1`，无需自有 HTTPS 服务器；云电脑凭据由同账号所有 Bot 共享，需明确同意后部署，且不能保证休眠或重建后的自动恢复。

可选的服务器部署仍可通过本目录 `Dockerfile` 和 `compose.yaml` 复用 Traefik HTTPS 入口，凭据从服务器 `/etc/el-bot/wecom-grok/` 注入，不写入镜像。同一 BotID 只运行一个实例。

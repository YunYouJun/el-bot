# 企微与 Grok Bot 自动问答

企微官方 SDK 收取单聊文本，调用 Grok Bot 官方 Webhook 例程；收到一次性鉴权的结果回调后，用原企微消息绑定的 SDK 回复发送最终答案。

从仓库根目录执行 `pnpm wecom:grok`。完整配置、例程指令、HTTPS 回调及验收步骤见[自动问答文档](../../docs/guide/grok.md)。不需要 Grok Bot 账号 Token 或非官方 SDK。

服务器部署使用 `pnpm --filter @el-bot/wecom-grok build` 生成独立产物，再通过本目录的 `Dockerfile` 和 `compose.yaml` 运行。现有配置复用 Dokploy 的 Traefik HTTPS 入口，凭据从服务器 `/etc/el-bot/wecom-grok/` 注入，不写入镜像。服务器实例运行期间，不要在本机启动相同 BotID 的连接。

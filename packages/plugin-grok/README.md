# @el-bot/plugin-grok

通过 Grok Bot 官方 Webhook 例程和带一次性鉴权的结果回调接入 el-bot。`GrokWebhookResponder.ask()` 在收到有效答案后才完成；Webhook 的 HTTP 200 不会被当作回答。

`createGrokMessageHandler()` 绑定一个已验证的单聊，限制同一时刻一个问题，去重并调用当前消息的 `reply()`。`grokPlugin()` 将此处理器注册到 el-bot 的 `onSession`；可运行的企微应用位于 `apps/wecom-grok`。

配置和验收见[自动问答文档](../../docs/guide/grok.md)。本包目前用于工作区，未纳入 npm 发布。

# 扩展功能

请参见 [el-bot-template/package.json](https://github.com/ElpsyCN/el-bot-template/blob/master/package.json) `scripts` 字段。

## 全局安装

你也可以通过全局安装 el-bot 的方式以使用 el-bot 的命令行。

```sh
npm install -g el-bot
# yarn global add el-bot
```

```sh
# 安装 mirai
el install mirai

# 启动 mirai
el start mirai

# 启动机器人
el bot
```

## Webhook

::: danger

此部分现已集成至 el-bot 本身。

想要使用该功能，请确保您已放通服务器的对应端口。

:::

譬如当我们推送自己的机器人代码到 GitHub 上时，服务器将监听 GitHub 仓库消息，并拉取代码重启机器人。

### 配置

你需要将你的配置放在 git 仓库中，并设置 Webhooks。

> `https://github.com/用户名/仓库/settings/hooks`

- `Payload URL`: 填写你的服务器地址加端口号加 `/webhook`（默认 7777）
  > 例如：`http://1.2.3.4:7777/webhook`
- `Content type`: application/json

收到推送后，将会自动拉取新的配置并重启机器人。

你可以通过以下配置决定是否启用它。

```js
// el/index.js
module.exports = {
  webhook: {
    enable: true,
    path: "/webhook",
    port: 7777,
    secret: "el-psy-congroo",
  },
};
```

### 自定义

你可以在插件中通过 `ctx.webhook.githubHandler` 来获得 githubHandler 并进一步对其扩展。

> [github-webhook-handler](https://github.com/rvagg/github-webhook-handler)

#### 监听

通过 `ctx.webhook.on` 监听对应类型的消息。

使用其他程序发送 POST 或 GET 请求。

```json
POST http://你服务器的IP地址:7777
Content-Type: application/json
{ "type": "is-teacher-here", "isHere": 1 }
```

或

```bash
GET http://你的服务器IP地址:7777?type=is-teacher-here&isHere=1
```

监听该请求，并进行响应。

```js
module.exports = (ctx) => {
  const mirai = ctx.mirai;
  ctx.webhook.on("is-teacher-here", (data) => {
    const status = data.isHere ? "在" : "不在";
    mirai.api.sendGroupMessage(status, 群号);
  });
};
```

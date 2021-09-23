# 使用说明

el-bot 使用了 [mirai-ts](https://github.com/YunYouJun/mirai-ts)。

因此你在编写插件时，可以通过 `ctx.mirai.api` 的方式直接使用 mirai-ts 的 API 进行编写，同时不需要处理登录、加载插件等问题。

mirai-ts 也提供了许多字符匹配、彩色日志等辅助小工具。

> [Mirai-api-http 事件类型一览](https://github.com/project-mirai/mirai-api-http/blob/master/docs/api/EventType.md)  
> [Mirai-api-http 消息类型一览](https://github.com/project-mirai/mirai-api-http/blob/master/docs/api/MessageType.md)

具体例子见下方。

::: tip
如果你觉得某个功能非常有用受众很广，可以考虑直接为 [el-bot](https://github.com/ElpsyCN/el-bot) 提 PR。

我们也建立了一个仓库 [el-bot-plugins](https://github.com/ElpsyCN/el-bot-plugins) 专门收集有趣的插件（对部分群体有用但不是必须的）。
:::

插件主要分这几种类型：

- `default`: 内置插件 `../plugins/rss`
- `official`: 官方插件 `@el-bot/plugin-niubi`
- `community`: 社区插件 `el-bot-plugin-xxx`（如果您放在个人仓库中并自行发布为 npm 包，请遵循该命名规范）
- `custom`: 自定义插件 `./xxx/xxx`

## 插件列表

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el plugins</chat-message>
  <chat-message :id="712727945" nickname="小云">默认插件:<br/>- answer@0.1.0: 自动应答<br/>- blacklist@0.0.1: 黑名单<br/>- forward@0.0.2: 消息转发<br/>- limit@0.1.0: 限制消息频率<br/>- memo@0.0.1: 备忘录<br/>- nbnhhsh@0.0.2: 能不能好好说话？<br/>- qrcode@0.0.2: 二维码生成器<br/>- rss@0.0.2: 订阅 RSS 信息<br/>- report@0.0.1: 消息报告<br/>- search@0.0.5: 引擎搜索<br/>- search-image@0.1.0: 以图搜图<br/>- teach@0.1.0: 问答学习（教小云做事）<br/>- workflow@0.0.1: 工作流 <br/>官方插件:<br/>- niubi@0.1.2: 夸人牛逼<br/>- setu@0.0.12: 发点色图 <br/>无社区插件<br/>自定义插件:<br/>- ./bot/plugins/test@未知: 未知<br/>- ./bot/plugins/cbd@0.0.1: 老师来了吗？
  </chat-message>
</chat-panel>

## 如何编写

我将示范如何新建一个名为 `test` 的自定义插件。

> 你也可以使用 typescript 编写你的插件。

新建 `plugins/custom` 文件夹（其实你也可以随便放，路径写对就行），新建 `test.js` 文件。

> **你的文件名将是你的插件名。**

或者新建 `/plugins/custom/test` 文件夹，新建 `index.js` 文件。（推荐，方便管理单个含有较多内容的插件）

默认传入机器人上下文 ctx。

- ctx 是机器人的实例本身
- 通过 `ctx.el.config` 获取机器人相关的配置（即你写在配置文件中的配置）
- 通过 `ctx.mirai` 获取 mirai 实例（即 mirai-ts 的实例）

插件默认导出一个函数，你无需操心它的加载问题，只需后续在配置文件中写上该插件的名字，将会自动加载。

> [async 和 await:让异步编程更简单](https://developer.mozilla.org/zh-CN/docs/learn/JavaScript/%E5%BC%82%E6%AD%A5/Async_await)

test.js

```js
// 使用 JSDoc 可以获取 el-bot 及 mirai-ts 的代码提示
const { default: Bot } = require("el-bot");

/**
 * 这里因为后续用到了异步编程关键字 await，如果你用不着，此处无需添加 async 关键字。
 * 而应该使用
 * module.exports = function(ctx) {
 * @param {Bot} ctx
 */
module.exports = async function (ctx) {
  const mirai = ctx.mirai;

  // 对收到的消息进行处理
  // message 本质相当于同时绑定了 FriendMessage GroupMessage TempMessage
  // 你也可以单独对某一类消息进行监听
  mirai.on("message", (msg) => {
    console.log("on message");
    console.log(msg);
  });

  // 调用 mirai-ts 封装的 mirai-api-http 发送指令
  console.log("send command help");
  const data = await mirai.api.command.send("help", []);
  console.log("帮助信息:" + data);

  // 处理各种事件类型
  // 事件订阅说明（名称均与 mirai-api-http 中时间名一致）
  // https://github.com/RedBeanN/node-mirai/blob/master/event.md
  console.log("on other event");
  // https://github.com/project-mirai/mirai-api-http/blob/master/EventType.md#群消息撤回
  mirai.on("GroupRecallEvent", ({ operator }) => {
    const text = `${operator.memberName} 撤回了一条消息，并拜托你不要再发色图了。`;
    console.log(text);
    mirai.api.sendGroupMessage(text, operator.group.id);
  });
};
```

test.ts

```ts
export default function (ctx) {
  const mirai = ctx.mirai;
  mirai.on("message", (msg) => {
    console.log("on message");
    console.log(msg);
  });
}
```

### 辅助函数

- `isListening(sender, listen)`: 传入 [配置讲解](https://docs.bot.elpsy.cn/config.html#%E7%9B%91%E5%90%AC%E4%B8%8E%E7%9B%AE%E6%A0%87) 处 `listen` 的格式，可以快速判断是否在监听。
- `sendMessageByConfig(messageChain, target)`: 传入 配置讲解处 `target` 的格式，可以快速发送给多个指定对象。

```js
const canForward = ctx.status.isListening(msg.sender, item.listen);
if (canForward) {
  ctx.sender.sendMessageByConfig(msg.messageChain, item.target);
}
```

### 插件信息

> 标准的插件格式请参照 [el-bot-plugins](https://github.com/ElpsyCN/el-bot-plugins) 说明。（如果你只是自行使用，大可无视。）

如果你想将插件提交到 [官方插件](https://github.com/ElpsyCN/el-bot-plugins) 中，`package.json` 与 `README.md` 是必不可少的。
这更方便别人知道如何使用它。

#### package.json

`el-bot.db` 设置为 `true`，代表需要依赖数据库。

```js
{
  "name": "blacklist",
  "private": "true",
  "version": "0.0.1",
  "description": "黑名单",
  "el-bot": {
    "db": true
  },
  "author": {
    "name": "YunYouJun",
    "url": "https://www.yunyoujun.cn",
    "email": "me@yunyoujun.cn"
  }
}
```

## 加载插件

### 通过配置加载

编写完，你还需要在你的自定义配置文件 `el/index.yml` 中加载它。

> 记得重启。

```yaml
plugins:
  # default:
  #   - answer
  #   - cli
  #   - forward
  #   - rss
  custom:
    - test
```

mirai-ts 实现了一个事件队列，对应的监听事件将会推入对应事件的列表，并在收到对应类型的消息时执行。

自定义插件将会在默认插件之后进入事件队列，

任何插件的加载顺序取决于你的配置顺序。

### 自行加载

你也可以在你的代码中自行加载它，此时它将不会出现在插件列表中。

```js
import { Bot } from "el-bot";
const bot = new Bot();
bot.use(yourPlugin);
// yourPlugin 应当是一个默认导出的函数或带有 "install" 属性的对象
```

如果你希望它出现在插件列表中，你可以使用 `bot.plugin(name: string, plugin: Plugin, ...options: any[])` 来注册它。

```js
bot.plugin("奇怪的插件", fn, options);
```

### 默认插件

即随 el-bot 默认加载的插件列表。

你可以覆盖 `plugins.default` 来只加载你想加载的默认插件。

### 官方插件

[el-bot-plugins](https://github.com/ElpsyCN/el-bot-plugins) 是 el-bot 的官方插件集中地，它提供了许多有趣的插件。

该部分插件将由我们进行审核，并统一发布至 npm 中 `@el-bot` 的命名空间下。（如：`@el-bot/plugin-niubi`）

插件的使用方式，见各插件的 `README.md`。

同时也欢迎你为其提交插件，来给更多人使用。

譬如加载 `niubi` 插件：

```bash
npm install @el-bot/plugin-niubi
# yarn add @el-bot/plugin-niubi
```

```yaml
plugins:
  official:
    - niubi
```

### 社区插件

社区插件即您自行编写并发布的插件。

如果您希望被更多人检索到，请遵循 `el-bot-plugin-xxx` 的命名规范。

```bash
npm install el-bot-plugin-xxx
```

### 自定义插件

自定义插件即您自行编写，且暂不打算发布的插件。

引入方式是您相对主目录的相对路径。

```yml
plugins:
  custom:
    - ./xxx/yyy
```

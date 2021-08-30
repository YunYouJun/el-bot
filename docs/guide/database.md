# 数据系统

> 其实就是数据库，叫数据系统当然是为了对仗。

默认使用 [MongoDB](https://www.mongodb.com/) 数据库，搭配 [mongoose](https://github.com/Automattic/mongoose)。

> 0.7.0 之后的版本使用 Mongoose，此前的版本仍为原生的 MongoDB。

理由如下：

- MongoDB 是最为流行的数据库之一。（~~MySQL: 你说什么？~~）
- MongoDB 有官方支持的 Node.js 库，且数据形式便是 JSON，与 JavaScript 有天生的亲和性。
- MongoDB 官方奉行数据库即服务，允许所有用户免费创建 512MB 以内的数据库。（~~这才是重点吧！~~）
  - 这可以免除额外搭建或迁移数据库的时间成本。
  - 此前我也考虑过 LeanCloud，但其对请求次数有限制。
- SQLite / LokiJS 更适合无须联网的小型程序，轻量但功能有限，迁移不便，而机器人本身必然需要网络与服务器支持，直接使用 MongoDB 云数据库仍旧不影响机器人本身的轻量而更为方便，可以远程连接并实现线上线下数据统一，也更便于日后扩展。

我也考虑过将数据库作为插件实现，但统一一个默认类型的数据库可以避免一些处理上的混乱，也避免浪费一些额外的精力。

> 譬如 A 插件使用 MongoDB，B 插件使用 MySQL，想要同时使用 A 插件和 B 插件，还需要依赖两个数据库显然是不恰当的，不如从开始便限制默认使用一个类型的数据库。

## 使用

添加环境变量，因为这是敏感信息，你最好不要直接书写在你的文件中。

```bash
# .env
BOT_DB_URI=mongodb+srv://你的用户名:你的密码@你的地址/el-bot
```

配置数据库配置项

- `enable`: 是否启用
- `uri`: 你的 MongoDB 链接（包括数据库名称），注意是 uri（因为我看官方示例都是用这个）
- `analytics`: 是否开启统计（当前只有简单的统计用户触发次数与上一次的触发时间）

```js
// el/index.js
module.exports = {
  // ...
  db: {
    enable: true,
    uri: process.env.BOT_DB_URI,
    analytics: true,
  },
};
```

- `ctx.db`: `mongoose.connection`

用法与 Mongoose 一致，更多请参见 [Mongoose 文档](https://mongoosejs.com/docs/guide.html)。

[user.schema.ts](https://github.com/YunYouJun/el-bot/blob/dev/src/db/schemas/user.schema.ts)

```js
import { User } from "../schemas/user.schema.ts";
export function getUsers() {
  const users = User.find();
  return users;
}
```

- [The Official MongoDB Node.js Driver](https://github.com/mongodb/node-mongodb-native)
- [Mongoose Docs](https://mongoosejs.com/)

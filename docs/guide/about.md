# 关于我们

## mirai & mirai-console & mirai-api-http & mirai-ts & el-bot 之间的关系

- [mirai](https://github.com/mamoe/mirai) 是一切的基础，使用 kotlin 编写，可跨平台（需要有 Java 环境），提供 QQ 协议的机器人库。
- [mirai-console](https://github.com/mamoe/mirai-console) 是 mirai 控制台的服务端，用于启动 mirai，并加载插件。
- [mirai-api-http](https://github.com/project-mirai/mirai-api-http) 是 mirai-console 的一个插件，用于提供 http api，以供任意语言扩展。

以上三者相当于开发环境，你可以使用 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader) 或 [miraiOK](https://github.com/LXY1226/miraiOK) 或 [mirua](https://github.com/zkonge/mirua) 或 `java -jar` 等其他各式各样的方法来启动它，相关内容与本项目无关。

> 推荐使用官方启动器 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader) 自行启动 [mirai](https://github.com/mamoe/mirai)（v1.0 以上） 与 [mirai-api-http](https://github.com/mamoe/mirai-api-http) 插件（v1.9.0 以上）。

因此，你应当有自行启动 mirai 的能力。

::: warning
在使用 el-bot 前，你应当先确定 mirai-api-http 已成功加载。一个简单的确认方法是访问 `localhost:4859/about` 查看是否有信息返回。
:::

::: tip
端口号可能由于你的配置而有所不同。mirai-api-http 的默认端口为 `8080`。
以避免冲突（一些程序也会喜欢默认使用 `8080` 端口），el-bot-template 中默认将 mirai-api-http 的端口配置为 `4859`，这取自于命运石之门世界线变动率小数点后不为零的四位数。
:::

---

[![npm](https://img.shields.io/npm/v/mirai-ts?logo=npm&label=mirai-ts&color=blue)](https://www.npmjs.com/package/mirai-ts)
[![npm](https://img.shields.io/npm/v/el-bot?logo=npm&label=el-bot)](https://www.npmjs.com/package/el-bot)

- [mirai-ts](https://github.com/YunYouJun/mirai-ts) 是用 TypeScript 编写，并编译成 JavaScript 来调用 mirai-api-http 的开发工具，即 SDK，包裹了所有 mirai-api-http 支持的请求，并提供了相应注释，可以在代码编辑器中（如 VS Code）中进行代码提示。
- [el-bot](https://github.com/YunYouJun/el-bot) 是我基于 mirai-ts 编写的一个跨平台（需要 [Node.js](https://nodejs.org/en/) 环境），可配置、可自定义插件的机器人框架。
- [el-bot-template](https://github.com/ElpsyCN/el-bot-template) 是使用 el-bot 的一个简单示例模版。

## 与 [koishi](https://github.com/koishijs/koishi) 的区别

开坑时，我确实不知道 koishi 这一框架，且由于~~白嫖~~心理，最初开发便没有使用 coolq 的打算。

koishi 基于 coolq 的 CQHTTP ，而 el-bot 基于 mirai 的 [mirai-api-http](https://github.com/project-mirai/mirai-api-http) 。

此后因为晨风作者被捕一事，CoolQ 作者也宣布停止运营。
所以 koishi 现在本质使用的是 [go-cqhttp](https://github.com/Mrs4s/go-cqhttp) / [cqhttp-mirai](https://github.com/yyuueexxiinngg/cqhttp-mirai) 等与 coolq API 兼容的解决方案。

> 详情见 [koishi#平台支持](https://github.com/koishijs/koishi#%E5%B9%B3%E5%8F%B0%E6%94%AF%E6%8C%81)

el-bot 则自始自终没有打算兼容 coolq 且没有 coolq 的历史包袱，所以均直接使用 mirai-api-http 的原生 API，基于的 [mirai-ts](https://github.com/YunYouJun/mirai-ts) 所有 API 均与官方 URL 命名保持一致。

当前 koishi 相比 el-bot 的生态功能要完善许多，而 el-bot 则没有兼容包袱，所以无需额外安装 cqhttp-mirai 或 go-cqhttp 或 [mirai-native](https://github.com/iTXTech/mirai-native)，SDK 直接与 mirai-api-http 进行交互，新特性的支持也可能更快一些。

koishi 的自定义程度很高，有一定的学习成本，而我本身开发 el-bot 希望能作为辅助工具更多一些，也可以通过 yml 配置各功能，大部分依赖使用的是 npm 社区已有的一些轮子。（~~自己又可以偷懒，熟悉的人又可以直接上手，不熟悉的同学学习一下以后别的项目也可以用，岂不是一举两得。~~）

譬如：

- koishi 提供了 mongodb 与 mysql 的两者数据库插件，并对其进行了一层包裹，需要简单的学习，因此可以实现数据插入删除的兼容。而 el-bot 默认内置了 mongodb 作为数据库（可决定是否启用），并直接暴露 [MongoClient](https://github.com/mongodb/node-mongodb-native) 的对象以供用户操作，同时统一使用 mongodb 以避免多数据库造成的困惑。
- koishi 自己实现了 schedule 插件，el-bot 使用 [node-schedule](https://github.com/node-schedule/node-schedule) 实现。
- koishi 自己实现了一套 cli，el-bot 则基于 [commander.js](https://github.com/tj/commander.js) 实现。
- ...

我能想到的大致区别就是这个吧，（~~至少我是这么认为的~~），还请看官自行取舍。

## 机关

本组织的名字取自「[命运石之门](https://zh.moegirl.org/命运石之门)」中男主[冈部伦太郎](https://zh.moegirl.org/zh-hans/冈部伦太郎)离别时的常用厨二病用语「El Psy Congroo」。
没什么特别意义，是冈部伦太郎的自造词。由希腊语和拉丁语组成，大意为强化思路。

[未来道具研究所](http://futuregadget-lab.com/)也是作品中登场的一个架空组织，由冈部伦太郎、椎名真由理和桥田至三人创立的以发明道具为目的的研究所。实际上主要在做一些有趣但可能没什么用的东西。

譬如：

- 比特粒子炮，电视遥控器与玩具射线枪结合制成，实际只能（威风凛凛地）转台。
- 竹蜻蜓照相机，摄像头会随着竹蜻蜓而高速旋转，导致看拍出来的视频的时候会让人看到头晕。

> [未来道具](https://zh.moegirl.org/%E6%9C%AA%E6%9D%A5%E9%81%93%E5%85%B7)

所以本质该组织也主要用来做一些可能有趣但没什么用（能有用当然最好）的东西。

## 设计

### 色彩

主题色取自 CSS3 [自带色彩](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value) steelblue (`#4682b4`)。

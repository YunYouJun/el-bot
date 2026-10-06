# plugins

在 `el.config.ts` 中设置 `bot.autoloadPlugins: true` 和 `bot.pluginDir: 'plugins'`。
每个插件默认导出 `defineBotPlugin({ pkg, setup(bot) {} })`，例如 `test/index.ts`。

在 `setup()` 中使用 `bot.command()` 注册用户命令，自动提供帮助并回复回调结果。
好友私聊发送 `test`，群聊先 @机器人再发送 `test`；发送 `help test` 查看帮助。

支持独立 JS/TS 文件和带 `index` 入口的目录。缺失目录、导入错误或初始化失败会记录诊断，
其余插件继续加载。普通消息使用框架 hooks；直接绑定 SDK 事件需要自行清理监听器。

带配置的工厂自动加载时会收到 `{}`。需要指定配置时，在 `bot.plugins` 中调用工厂，
并关闭自动加载或将该插件移出扫描目录，避免重复注册。

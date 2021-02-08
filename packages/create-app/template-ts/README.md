# template-ts

el-bot 的 TypeScript 模版

## Start

在 [el.config.ts](./el.config.ts) 中配置你的机器人

在 [plugins](./plugins) 目录中配置你的插件

```sh
yarn
yarn start
```

## Link MCL

如果你使用 [mcl](https://github.com/iTXTech/mirai-console-loader) 启动你的 mirai，你可以将其放置于当前目录下的 mcl 文件夹或链接至此处。

（因为 mirai-api-http 1.x 尚未支持绝对路径发送图片/音频文件。）

如：

```sh
ln -s /Users/yunyou/github/org/elpsycn/xiao-yun/mcl ./mcl
```

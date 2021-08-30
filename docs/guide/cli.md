# 终端命令

> 这里的终端并非指传统的终端命令行。而是你和机器人文本信息的命令交互。  
> 本质是将终端命令从控制台移到了 QQ。

基于 [commander.js](https://github.com/tj/commander.js/) 实现，因此你也可以遵循 commander 文档来自定义它。

> el-bot@version >= 0.5.0

```sh
el <command> [options]
```

> 你可以直接向机器人发送命令来调用
> （终端）代表仅在终端可用

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el -h</chat-message>
  <chat-message :id="712727945" nickname="小云">Usage: el &lt;command&gt; [options]<br/><br/>命令：<br/>  el echo &lt;message&gt;  回声<br/>  el sleep           休眠<br/>  el restart         重启<br/><br/>Options:<br/>  --help, -h     显示帮助信息                                             [布尔]<br/>  --version, -v  显示版本号                                               [布尔]<br/>  --about, -a    关于
</chat-message>
</chat-panel>

## Options

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el -a</chat-message>
  <chat-message :id="712727945" nickname="小云">GitHub: https://github.com/elpsycn/el-bot</chat-message>
</chat-panel>

- `--version`, `-v`: 显示版本号
- `--help`, `-h`: 显示帮助信息
- `--about`,`-a`: 关于

## Commands

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el echo 早</chat-message>
  <chat-message :id="712727945" nickname="小云">早</chat-message>
</chat-panel>

- `echo` \<`message`\>: 回声
- `plugins`: 显示当前加载的插件列表（包括版本及描述）
  - `-l <type>`: 列出对应类型的插件列表，如 `el plugins -l official`: 列出已加载的官方插件
    <!-- - `jobs`: 显示可执行的自定义任务 -->
    <!-- - `sleep` : 睡眠，此时将只监听终端命令 -->
- `restart` : 重启

## 自定义终端

一个简单的示例

> 更多属性/参数请参见 [commander.js](https://github.com/tj/commander.js/) 文档

::: tip
本质上 el-bot 基于 commander 修改了其原型链，使得原本在终端输出的内容，直接通过机器人返回。并添加了一些默认的指令。
:::

```js
module.exports = (ctx) => {
  const { cli } = ctx;

  cli
    .command("test")
    .description("一个测试指令")
    .option("-l, --list")
    .action((options) => {
      if (options.list) {
        ctx.reply("列表？");
      } else {
        ctx.reply("没有输入选项");
      }
    });
};
```

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el test -l</chat-message>
  <chat-message :id="712727945" nickname="小云">列表？</chat-message>
</chat-panel>

## 自定义任务

> 开发中...

你可以预定义一些脚本，让其可以通过机器人指令执行。

> 这些脚本，只有你设置了 `master` 和 `admin` 中的 QQ 有权限执行。见配置讲解。

譬如我想要通过机器人指令重启服务器上的 Minecraft 服务器：

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el run start:mc</chat-message>
</chat-panel>

- `name`: 指令名
- `desc`: 简要描述
- `do`: 指令文本数组

默认上一条指令执行完，才会执行下一条指令。

```yaml
cli:
  jobs:
    - name: stop:mc
      desc: 停止 MC 服务器
      do:
        - pkill -P `cat mc.pid`
        - rm mc.pid
    - name: start:mc
      desc: 启动 MC 服务器
      do:
        - cd /opt/mc && nohup java -Xms1024M -Xmx2048M -jar server.jar nogui & echo $! > mc.pid
    - name: restart:mc
      desc: 重启 MC 服务器
      do:
        - el run stop:mc
        - el run start:mc
```

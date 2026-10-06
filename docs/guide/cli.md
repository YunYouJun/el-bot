# CLI 与机器人命令

## 本机 CLI

在本机终端中使用统一的 `el-bot` 命令，`el` 是别名：

```bash
el-bot --help
el-bot --version
el-bot codex init --project /absolute/path/to/my-project --name my-project
el-bot codex check --all
el-bot codex start
el-bot codex paths
el-bot codex preferences --json
el-bot codex preferences --message-format image --image-theme dark
el-bot codex preferences --message-format text
el-bot codex --profile personal paths
el-bot codex recover --project my-project
el-bot codex api --experimental
el-bot codex desktop-check
el-bot codex render --card result --theme dark --output ./result.png
el-bot codex render --card help --page 1 --part 2 --output ./help.png
el-bot dev /absolute/path/to/bot
```

`codex` / `agent` 连接 QQ 官方机器人与配置选定的本机程序；`dev` 启动自定义机器人框架。
路径参数放在 `codex` / `agent` 后，例如 `el-bot codex check --all --config /path/to/config.json`。
`el-bot codex` 不带子命令会启动服务；`el-bot` 不带参数保留从当前目录启动旧框架的行为。
查看帮助时使用显式 `--help`，避免意外启动服务。

当前源码增加 `agent` 别名与 ACP 接入。为 CodeBuddy / dsh 创建独立实例，例如：

```bash
el-bot agent --profile codebuddy init --agent codebuddy --project /absolute/path/to/my-project
el-bot agent --profile codebuddy check --all
el-bot agent --profile codebuddy start
```

`--agent` 只用于初始化，后续读取配置。`api`、Desktop 管理与专用会话操作只适用于 Codex；能力差异见[程序选择](/codex/agents)。安装版本与源码功能须核对，见[完整接入](/development/codex-remote#安装-cli)。
AI 助手可以使用 `init --no-prompt` 和只读 `check`，见 [AI 快速接入](/codex/ai-setup)。
新实例使用 `--profile` 隔离，归档检测与恢复见[实例隔离与恢复](/codex/instances)。

## QQ 中的遥控命令

绑定后，在 QQ 私聊中直接发送任务，或使用 `/project`、`/status`、`/result`、`/stop`。
审批使用 `/approval ID`、`/approve ID` 和 `/reject ID`；完整列表见 [QQ 命令](/development/codex-remote#qq-命令)。

API 目录、桌面项目与聊天管理见 [Codex Desktop](/codex/desktop)。管理操作使用独立的 `/inspect`、`/confirm` 和 `/cancel`，完整查看后只执行一次。

`codex render` 生成本地 PNG 卡片预览；设置图片模式后默认直接上传到 QQ，无需自建公网图片入口，见[图片卡片](/development/codex-remote#图片卡片与本地预览)。

当前开发构建的 `codex preferences` / `agent preferences` 可以查看和保存图片／Markdown／纯文本模式以及图片主题，只修改展示字段；运行中的机器人需要手动重启生效。也可在[本机客户端](/development/client-tool)中设置，并用本机按钮打开 Codex、CodeBuddy、dsh 或 QQ。旧版 CLI 缺少此入口时需使用对应的新构建。

## 插件用户命令

当前开发构建的通用框架在 NapCat 私聊中支持直接发送 `帮助`、`help 命令名`；群聊需在开头 @机器人或使用「机器人名 命令」。
已加载的 `answerPlugin` 提供 `answer` 命令，展示应答配置的帮助信息。

插件通过 `bot.command().description().usage().example().action()` 注册命令；回调返回文本或 NapCat 消息链时自动回复，也可用本次调用的 `context.reply()` 手动回复。
`bot.executeCommand()` 支持内部调用，`bot.getCommandHelp()` 获取帮助文本。设计、示例和验收边界见[面向用户的指令系统](/development/user-commands)。npm `1.0.0-rc.2` 尚未提供这些新增能力。

## 旧框架的 QQ 文本终端

以下 `el echo`、`el plugins` 等是已有框架 CLI 插件的聊天命令，与本机 `el-bot codex` 子命令分别使用。

> 这里的终端并非指传统的终端命令行。而是你和机器人文本信息的命令交互。  
> 本质是将终端命令从控制台移到了 QQ。

基于 [commander.js](https://github.com/tj/commander.js/) 实现，因此你也可以遵循 commander 文档来自定义它。

> el-bot@version >= 0.5.0

```bash
el <command> [options]
```

> 你可以直接向机器人发送命令来调用
> （终端）代表仅在终端可用

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el -h</chat-message>
  <chat-message :id="712727945" nickname="小云">Usage: el &lt;command&gt; [options]<br/><br/>命令：<br/>  el echo &lt;message&gt;  回声<br/>  el sleep           休眠<br/>  el restart         重启<br/><br/>Options:<br/>  --help, -h     显示帮助信息                                             [布尔]<br/>  --version, -v  显示版本号                                               [布尔]<br/>  --about, -a    关于
</chat-message>
</chat-panel>

### Options

<chat-panel title="聊天记录">
  <chat-message :id="910426929" nickname="云游君">el -a</chat-message>
  <chat-message :id="712727945" nickname="小云">GitHub: https://github.com/elpsycn/el-bot</chat-message>
</chat-panel>

- `--version`, `-v`: 显示版本号
- `--help`, `-h`: 显示帮助信息
- `--about`,`-a`: 关于

### Commands

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

# 辅助工具 utils

一些开发时的辅助函数

> v0.7.0-alpha.2 新增，尚未稳定

## 内部模式

你可以使用它来控制是否进入插件的内部模式。

所谓的内部模式，即当你简单的编写回复逻辑时，机器人不会对当前的群或好友进行判断。
这就会导致你在 A 群发送搜图，在 B 群发送图片，机器人会在 B 群返回搜图的结果。

使用内部模式后，即你在 A 群发送搜图，机器人只在 A 群存在搜图模式，与 B 群互不影响。

示例如下：

```js
import { utils } from "el-bot";
const innerMode = new utils.InnerMode();

export default async function() {
  mirai.on("message", (msg) => {
    // 传入当前的消息
    innerMode.setMsg(msg);

    // 进入搜图模式
    if (msg.plain === "搜图") {
      // 进入内部
      innerMode.enter();
      msg.reply("我准备好了！");
    }

    // 如果当前为内部模式
    if (innerMode.getStatus()) {
      // 做搜图操作
      fakeSearchImage();

      // 退出搜图模式
      innerMode.exit();
    }
  });
}
```

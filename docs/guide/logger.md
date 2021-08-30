# 日志系统

日志系统使用 [winston](https://github.com/winstonjs/winston) 实现。

```js
const { default: Bot } = require("el-bot");
/*
 * @param {Bot} ctx
 */
module.exports = (ctx) => {
  ctx.logger.success("整挺好！");
};
```

```bash
# 输出消息
[el-bot] [success] 整挺好！
# [SUCCESS] 为绿色
```

## 类型

- success: 成功信息
- warning: 警告信息
- error: 错误信息
- info: 提示信息
- debug: Debug 信息

## Todo

日志分级显示

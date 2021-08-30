# 状态 status

你他娘的就是劳资的 Master 吗？

status 命名空间下提供了几个辅助函数。

## isListening 是否监听

如果你的配置遵循了 [监听与目标](/guide/config.html#监听与目标)，那么你可以调用它来快速判断是否处于监听状态。

譬如：

```yml
test:
  listen: master
```

```js
export function(ctx, options) {
  const { mirai, status } = ctx.mirai;
  miria.on('message', (msg) => {
    if (status.isListening(msg.sender.id, options.listen)) {
      msg.reply('你他娘的就是劳资的 Master 吗？');
    }
  })
}
```

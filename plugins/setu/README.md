# 色图 setu

- 作者：[@YunYouJun](https://github.com/YunYouJun)
- 简介：发点色图

例如：

```md
云游君: 来点色图

Bot: [假装我是一张真正的色图]
```

- `url`: API 地址 或本地 JSON 数据的文件所在路径
- `proxy`: 图片链接代理（可能因为种种原因，你的 API 获取的图片链接需要代理）
- `match` 见[配置讲解](https://docs.bot.elpsy.cn/config.html)。
- `reply`: 默认的回复文本消息

> 不需要自定义时，不需要配置，默认使用 `https://el-bot-api.vercel.app/api/setu`。

另一个 [色图 API](https://api.lolicon.app/#/setu)：https://api.lolicon.app/setu/

```yaml
setu:
  url: https://el-bot-api.vercel.app/api/setu
  # proxy: https://images.weserv.nl/?url=
  match:
    - is: 不够色
    - includes:
        - 来点
        - 色图
  reply: 让我找找
```

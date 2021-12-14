# 牛逼 niubi

- 作者：[@YunYouJun](https://github.com/YunYouJun)
- 简介：夸人牛逼
- 触发条件：艾特人且文本中包含 `nb`，新人进群时

例如：

```md
云游君: @Niubi nb

Bot: 世界上没有定理，只有 Niubi 允许其正确的命题。

云游君: 来点群主笑话

Bot: 世界上没有定理，只有 群主 允许其正确的命题。
```

## 描述

数据来源自 Jeff 笑话、高斯笑话。

## 配置

- `url`: API 地址 或本地 JSON 数据的文件所在路径
- `match` 见[配置讲解](https://docs.bot.elpsy.cn/config.html)。

```yaml
niubi:
  url: https://el-bot-api.vercel.app/api/words/niubi
  match:
    - re:
        pattern: 来点(\S*)笑话
    - is: nb
```

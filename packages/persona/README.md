# @el-bot/persona

可移植的 Markdown 人物卡与本地版本库，支持文件、HTTPS 原文和 Git 指定文件导入。存储、选中版本和提示词组装与具体 AI 程序解耦。

```ts
import { PersonaLibrary, personaPrompt } from '@el-bot/persona'

const library = new PersonaLibrary('/absolute/path/to/config.json.personas')
const card = await library.import({ kind: 'file', path: '/absolute/path/to/card.md' })
await library.select(card.metadata.id, card.hash)
const prompt = personaPrompt('帮我检查这个项目', await library.active())
```

导入和更新不会自动启用；`select(null)` 停用，`preview(id, hash)` 读取历史快照。调用方选择实例目录，并在选中版本变化时创建新会话。详见[人物卡指南](../../docs/development/personas.md)。

程序源码遵循 AGPL-3.0。`examples/xiaoyun.md` 来自 YunYouJun/yun，单独遵循文中声明的 CC BY-NC-SA 4.0 许可；`examples/dafeiyu.md` 来自 huaizhuanghub/dsh-persona-dafeiyu，单独遵循 MIT 许可（全文见 `examples/dafeiyu.LICENSE`）。

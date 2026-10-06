import type { ImageCard } from './types'

export const cardExamples: { id: string, title: string, description: string, card: ImageCard }[] = [
  {
    id: 'result',
    title: '任务结果',
    description: '标题、强调、列表与引用，让长回复更容易阅读。',
    card: {
      title: '任务已完成 (1/1)',
      tone: 'success',
      details: {
        fields: [{ label: '项目', value: 'el-bot' }, { label: '任务', value: 'c36de31a' }],
        section: '结果',
        bodyFormat: 'markdown',
        body: '## 每一种内容，都有自己的样式\n\n**关键结论**清楚可见，*补充说明*轻轻强调，~~过期信息~~仍可追溯。命令与路径用 `等宽字体` 显示。\n\n- 中文、English 与 👩‍💻 可以自然换行\n- **粗体**和*斜体*也能一起出现在列表中\n\n> 查看图片中的摘要，使用图片外的指令继续操作。',
        footnote: '/result c36de31a 页码 · /help 帮助',
      },
    },
  },
  {
    id: 'code',
    title: '代码高亮',
    description: 'TypeScript、JSON 与 Shell，按语言标记使用对应配色。',
    card: {
      title: '任务已完成 (1/1)',
      tone: 'success',
      details: {
        fields: [{ label: '项目', value: 'el-bot' }],
        section: '代码示例',
        bodyFormat: 'markdown',
        body: '```ts\n// 中文注释与语法高亮\nconst message: string = "Hello, el-bot"\nconst retries = 3\nif (retries > 0) {\n  console.log(message)\n}\n```\n\n```json\n{ "enabled": true, "theme": "dark" }\n```\n\n```bash\npnpm cli codex render --card result\n```',
        footnote: '/help 查看命令',
      },
    },
  },
  {
    id: 'table',
    title: '表格与长文本',
    description: '表头与正文分层，长内容在单元格内换行。',
    card: {
      title: '任务状态 (1/1)',
      tone: 'primary',
      details: {
        fields: [{ label: '项目', value: 'el-bot' }],
        section: '检查结果',
        bodyFormat: 'markdown',
        body: '| 项目 | 结果 |\n| --- | --- |\n| Markdown | **加粗**、*斜体*、~~删除线~~ |\n| 代码 | `ts` / `json` / `bash` |\n| 混合文本 | 中文与 English 自然换行；👩‍💻 保持完整 |\n| 长路径 | `apps/qq-codex/src/card-renderer/markdown.ts` |\n\n---\n\n[文档链接](https://docs.bot.elpsy.cn/)显示为文字，图片显示说明：![示例截图](https://example.com/preview.png)。',
        footnote: '/status 刷新状态',
      },
    },
  },
  {
    id: 'help',
    title: '命令帮助',
    description: '命令、参数、说明分开呈现，保留清楚的阅读顺序。',
    card: {
      title: 'el-bot · 命令帮助',
      tone: 'primary',
      details: {
        section: '任务与结果',
        body: '',
        footnote: '',
        help: {
          intro: '在 QQ 中查看任务进度，或取回已经完成的结果。',
          commands: [
            { command: '/run', parameters: '提示词', description: '向当前项目提交一个任务。' },
            { command: '/status', description: '查看项目、运行中的任务和最近结果。' },
            { command: '/result', parameters: '任务编号 [页码]', description: '取回完整结果，长回复可继续翻页。' },
          ],
          notes: ['命令可以直接作为文字发送。', '使用 /cancel 取消正在执行的任务。'],
          footer: '/help 分类 页码',
        },
      },
    },
  },
]

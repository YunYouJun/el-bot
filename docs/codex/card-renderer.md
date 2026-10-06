---
title: 图片卡片示例
description: 预览任务结果、语法高亮、表格和帮助卡片的浅色与深色样式。
---

<script setup lang="ts">
import CardRendererDemo from '../.vitepress/components/card-renderer/CardRendererDemo.vue'
</script>

# 图片卡片示例

选择一种内容，切换浅色或深色，看看回复在图片里如何呈现。展开源码可以对照 Markdown 与渲染效果。

<CardRendererDemo />

示例与机器人截图使用同一份 HTML/CSS 模板。这里展示浏览器实时排版，机器人通过 Playwright 将卡片截为 PNG；实际字体随运行主机的已安装字体或指定字体文件变化。

卡片按云乐坊 Card 的顶部纯色强调样式呈现，使用晴空蓝顶边和中性内容表面。任务状态在标题旁以小标记显示；标题、正文和辅助信息保持清晰的字号层级。

## 在本机生成 PNG

图片模式首次使用前，安装当前 CLI 对应的 Chromium：

```bash
el-bot codex browser-install
el-bot codex render --card result --theme dark --text-file ./result.md --output ./result.png
```

预览命令只生成本地图片。启用和字体配置见 [图片卡片与本地预览](/development/codex-remote#图片卡片与本地预览)，实现与复用方式见 [Markdown 图片渲染模块](/development/card-renderer)。

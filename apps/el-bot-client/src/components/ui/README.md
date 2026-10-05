# 云乐坊机器人组件

本目录从 [YunLeFun/design](https://github.com/YunLeFun/design) 的 `ylf-agent` Registry 同步。
组件与 `agent.ts` 的权威源码位于 design 仓库的 `packages/vue/components/`，请先在那里修改并验证，再同步到客户端。
MIT 许可保存在 `LICENSE`，`source.json` 记录来源与源码哈希。

```sh
# 在 design 仓库中构建生成物
pnpm registry:build

# 在 el-bot 仓库中同步或检查，参数为 design 的本机目录
node scripts/sync-design-agent.mjs /path/to/design
node scripts/sync-design-agent.mjs /path/to/design --check
```

基础样式和已发布通用控件由 `@yunlefun/ui`、`@yunlefun/vue` 提供；本目录仅保存尚未发布的机器人扩展。

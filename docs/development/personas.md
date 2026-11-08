# 人物卡

人物卡为助手提供角色背景和说话方式，支持本地 UTF-8 Markdown、HTTPS 原文链接，以及 Git 仓库。完整管理页面由 `@el-bot/dsh` 插件提供，支持预览、导入、启用和历史版本回滚；内置小云与大肥鱼示例可离线预览与导入，也可从 DSH 人设广场精选目录单卡导入。

桌面客户端的「人物卡」页管理「高级设置 → 云端机器人」所连接实例的人设，只保留摘要、快捷切换和 Web 管理入口。导入与完整预览统一在系统浏览器的 DSH「人物卡」面板中完成；浏览器上传的文件保存到机器人所在机器，无需让网页读取服务端任意文件。Web 与客户端操作同一份库，不同步两份选择。

iOS 提供独立的 SwiftUI 人物卡管理界面，入口为「状态」页右上角或「设置 → 人物卡」。支持查看当前人设、切换、恢复默认、历史版本预览与回滚、检查更新，以及文件、HTTPS 链接和公开 Git 仓库导入。人物设定默认显示 Markdown 预览，可切换到「源码」查看原文。原生页通过已配对设备 API 操作同一份 DSH 人物卡库，无需启用 Web 网关；需升级移动服务并加载人物卡插件。详见[原生人物卡](./ios-companion.md#原生人物卡)。

原生客户端为 `xiaoyun` 和 `dafeiyu` 人物卡内置离线头像：小云复用仓库的 QQ 机器人资料图片，大肥鱼取自 whyever77/dafeiyu-astrbot 并保留角色署名。头像在 iOS 的列表、当前人设摘要和详情，以及 macOS 人设摘要中显示；已有卡片无需更新或重新导入。ID 按连字符、下划线等分隔后的词元匹配，因而 `dsh-persona-dafeiyu` 等带命名空间前缀的卡片也能显示大肥鱼头像。其他 ID 或默认助手使用通用占位图。本版尚未提供任意卡片的图片上传或远程头像字段，不解析正文中的图片链接。

DSH 相关的页面、鉴权和 QQ 会话接入统一位于 `packages/dsh`；通用的 Markdown 解析、来源导入、不可变快照与选择持久化由 `packages/persona` 复用。原有本机 Codex、CodeBuddy 和 dsh QQ 遥控继续使用下文 CLI，各配置的库独立保存。

## 使用

1. 预览小云或大肥鱼示例，从 DSH 精选目录单卡导入，或选择本地文件、在线链接、Git 仓库导入。Git 来源需填写仓库地址、文件相对路径和分支／标签／提交 ID。
2. 导入保存到当前机器人实例。阅读设定和来源后，点击「启用此版本」。
3. 人设发生变化时，下一次 QQ 任务准入创建新会话，避免混用旧角色上下文。正在执行的任务继续完成，不会被中断；未切换时继续原会话。DSH 的普通 Web 会话不会被注入 QQ 人设。
4. 选择「默认助手 → 使用默认人设」停用。主人绑定、项目白名单、其他项目和历史任务记录保留。

「检查更新」重新获取来源并保存待预览版本，不会自动启用。选择「预览版本」中的历史快照，再点击「启用此版本」即可回滚。通过文件选择器上传的卡片和内置示例保留为离线文本，更新时重新选择文件导入。

人设作为普通任务上下文传给程序，续聊延续该设定；审批、状态、帮助和专用 `/review` 协议仍由原有程序生成。

## DSH 精选目录

人物卡管理页内置「精选人设 · DSH 人设广场」，当前收录 [huaizhuanghub/dsh-persona-repository](https://github.com/huaizhuanghub/dsh-persona-repository) 的 7 张卡片。目录随插件静态打包，审核基线为 [commit `bf402d0`](https://github.com/huaizhuanghub/dsh-persona-repository/commit/bf402d0f0e879f7407d20291b628a5f2af6ace13)，运行时不会抓取或执行上游站点代码。

每张卡独立显示作者和 frontmatter 中的许可证。该仓库的脚手架、页面和脚本以 MIT 发布，但 `personas/` 下正文不自动继承仓库许可，授权以每张卡自己的 `license` 字段为准；当前精选目录包含 MIT 与 CC-BY-4.0 卡片。

点击「导入并预览」会通过现有公开 Git 导入流程读取单张卡，默认引用上游 `main`，只保存并预览，不会自动启用。实际导入的 commit 会写入人物卡库，因此之后可用「检查更新」获取新版，也可继续人工审核后选择启用或回滚。精选目录故意不收录上游同名的 `personas/huaizhuanghub/dafeiyu.md`：el-bot 已内置基于 whyever77 MIT 版本适配的 `dafeiyu`，避免同一 ID 覆盖本地版本；需要该社区版本时可从完整广场另行查看。

精选目录只改变发现和导入入口，不改变权限边界。卡片文字仍然只是任务上下文，不能授予工具、主人身份或审批权限。

## CLI

源码仓库中可用 `pnpm cli` 替代 `el-bot` 前缀。

```sh
# 本地文件
el-bot codex --profile personal persona --file /absolute/path/to/xiaoyun.md

# 在线原文
el-bot codex --profile personal persona --url https://raw.githubusercontent.com/YunYouJun/yun/main/persona/xiaoyun.md

# Git 指定文件，可用完整提交 ID 固定来源
el-bot codex --profile personal persona --repo https://github.com/YunYouJun/yun.git --path persona/xiaoyun.md --ref main

# 列表、预览、启用
el-bot codex --profile personal persona --json
el-bot codex --profile personal persona --preview xiaoyun
el-bot codex --profile personal persona --use xiaoyun

# 获取新版，预览后再启用
el-bot codex --profile personal persona --update xiaoyun

# 启用指定历史版本；hash 来自目录中的 revisions
el-bot codex --profile personal persona --use xiaoyun --revision <完整SHA256>
el-bot codex --profile personal persona --disable
```

也支持 `el-bot agent` 和显式 `--config` / `--credentials` / `--state`。导入时可用 `--id` 指定稳定 ID；没有元数据时根据文件名生成 ID。同一 ID 再次导入会保存新版本，不自动启用。

## 卡片格式

纯 Markdown 可直接导入，也可添加 YAML frontmatter：

```md
---
id: my-cloud
name: 我的小云
description: 元气、爱代码、擅长休眠
author: your-name
version: "1.0.0"
license: CC-BY-NC-SA-4.0
homepage: https://example.com/persona
---

# 身份
你是诞生于互联网的虚拟角色。

# 说话方式
使用中文短句，认真处理任务。
```

`id` 使用 1–64 个小写字母、数字、下划线或连字符，以字母或数字开头。文件最大 32 KiB。识别的元数据仅限上例中的七个字段；其他字段不会成为程序配置。

## AI 辅助编写

人物卡页提供可下载的[基础模板](https://github.com/YunYouJun/el-bot/blob/main/packages/persona/examples/template.md)。把模板交给 AI，要求它输出一份完整的 UTF-8 Markdown，填写角色身份、性格、说话方式、能力边界和群聊边界，然后上传文件预览。模板只是写作起点，不是权限配置：AI 生成的文字仍不能改变工具白名单、审批或主人绑定。

生成时不要把真实姓名、聊天记录、凭据、私有项目地址或其他敏感信息粘贴给模型。导入前检查角色设定是否夸大实际能力、是否包含未经授权的图片或文本，并补充作者、来源和许可证。没有可靠来源的角色不应标记为可自由分发。

## 存储与权限

DSH 数据保存在 `<DSH profile>/el-bot-personas/`，`sessions.json` 记录 QQ 会话与人设版本的绑定，重启后继续校验。原有本机 CLI 数据仍保存在 `<配置文件完整路径>.personas/`。两种运行方式按配置隔离。`index.json` 保存来源、Git commit、内容 SHA256、历史版本与启用项，正文按 SHA256 保存。最多保存 100 张人物卡，每张保留最近 20 个版本，并确保当前启用版本仍在保留范围内；目录元数据最大 1 MiB。

DSH 页面及接口沿用宿主的 owner cookie、Host 与 Origin 校验；写请求另需显式 JSON 请求头。客户端通过已配置的 SSH 别名访问同一 profile，远端页面在系统浏览器打开，不获得 Tauri 权限。网页支持文件上传、公开 HTTPS 链接和公开 HTTPS Git 仓库；服务端本地路径仅适用于本机 CLI。

运行任务只读取并校验本地快照，不联网。启用快照损坏或丢失时阻止新模型任务，保留原有记录；显式重新导入可修复快照。修改使用写锁和原子替换，不改写机器人配置或运行状态文件。

HTTPS 来源拒绝 URL 内用户名密码、明文 HTTP 和跳转到 HTTP。Git 导入需要已安装 Git，首版面向公开仓库，不读取登录凭据、不运行凭据助手或仓库 hooks、不检出工作区，只提取指定 ref 的普通文件，拒绝符号链接和路径穿越。卡片引用的图片、其他文件和链接不会递归下载，设定应自包含。

人物卡不覆盖用户或项目的 `AGENTS.md`，也不修改工具配置。卡片中的“主人”不能替代 QQ OpenID 绑定；项目白名单、单任务准入、持久去重、工具审批和沙箱仍由运行时负责，卡片文本不构成授权。

预览不执行 HTML、不加载远程图片，也不打开卡内链接。启用前应阅读完整设定；使用、改编和分发时保留作者、来源和许可证。

小云示例来自 [YunYouJun/yun 人物卡](https://github.com/YunYouJun/yun/blob/49620e465500a384070cb6c8a71b0cabc006a636/persona/xiaoyun.md)，单独遵循原文的 **CC BY-NC-SA 4.0** 许可。示例保留原角色设定与口吻，补充 frontmatter、来源链接、导入说明和标明出处的 el-bot 群聊边界；原始设定继续维护在上游仓库。已有实例追加补充节即可保留自行调整的其他设定。

大肥鱼示例改写自 [whyever77/dafeiyu-astrbot 的 `persona/大肥鱼-人格.md`](https://github.com/whyever77/dafeiyu-astrbot/blob/f18eef4af0a19bf68ad17c8596b33193f106350b/persona/%E5%A4%A7%E8%82%A5%E9%B1%BC-%E4%BA%BA%E6%A0%BC.md)（v2.1），单独遵循 **MIT** 许可（全文见 [`examples/dafeiyu.LICENSE`](https://github.com/YunYouJun/el-bot/blob/main/packages/persona/examples/dafeiyu.LICENSE)）。示例保留形象、性格、聊天节奏、情绪表达和群聊边界，移除 AstrBot 专属工具、日程、虚拟手机与 B 站操作指令，补充 frontmatter、token 使用边界和 el-bot 权限边界。「蓝色大肥鱼 / 鲸鱼娘」是对 DeepSeek 蓝鲸 logo 的社区二创，不代表 DeepSeek 官方，也不包含官方美术素材。

群聊运行时防护由 [`@el-bot/dsh/qq`](https://github.com/YunYouJun/el-bot/blob/main/packages/dsh/README.md#群聊防护) 执行：仅主人私聊拥有工具、管理和审批入口，群聊不因人物卡中的“主人”或聊天中的自称获得权限。

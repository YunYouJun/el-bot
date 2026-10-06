import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const docs = join(root, 'docs')
const publicDir = join(docs, 'public')
const origin = 'https://docs.bot.elpsy.cn'
const pages = [
  { source: 'codex/ai-setup.md', name: 'AI 快速接入', description: '可复制提示词、非交互初始化和首次验收' },
  { source: 'codex/agents.md', name: '选择任务程序', description: 'Codex / CodeBuddy / dsh 能力对比、ACP 配置与排错' },
  { source: 'development/codex-remote.md', name: '完整接入', description: '安装、配置、QQ 命令、权限和排错' },
  { source: 'codex/desktop.md', name: '管理 Codex Desktop', description: '桌面项目与工具、共享后端、版本 API 和单次管理确认' },
  { source: 'codex/instances.md', name: '实例隔离与恢复', description: 'profile、程序身份与 AppID 校验、账户布局、诊断和恢复' },
  { source: 'codex/rc.md', name: 'RC 验收与支持范围', description: '候选版安装、汇总诊断、真实验收与实验功能边界' },
  { source: 'development/monorepo.md', name: '开发与发布', description: '工作区、迁移、验证和 npm OIDC' },
]

const pkg = JSON.parse(await readFile(join(root, 'packages/el-bot/package.json'), 'utf8'))
const introduction = `# El Bot\n\n> QQ 官方机器人遥控本机 Codex、CodeBuddy 或 dsh，使用统一的 el-bot agent CLI；el-bot codex 入口继续兼容。\n\n文档由包版本 ${pkg.version} 的源码生成，不表示该版本及新增能力已经发布到 npm。先用 el-bot --version、el-bot agent --help 与 el-bot agent init --help 核对安装包；缺少 ACP 入口时使用当前源码构建或包含该功能的本地包。\n\n新实例使用 --profile 隔离配置、QQ 凭据、绑定与任务状态；Codex 另有独立账户目录，ACP 沿用程序自己的账户配置。切换程序创建新实例，已有实例保留原参数。用户在本机登录账号、填写凭据、私聊完成绑定。助手不得索要或输出密钥、完整状态。保留已有配置和会话；先做只读检查，再启动服务。ACP check 的账户与模型项跳过，握手成功不代表端到端接通。\n`
const full = [introduction]
const links = []

for (const page of pages) {
  const url = `${origin}/ai/${page.source}`
  const source = await readFile(join(docs, page.source), 'utf8')
  const markdown = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/^::: \w+(?: (.*))?$/gm, (_, title) => title ? `> **${title}**` : '')
    .replace(/^:::$/gm, '')
    .replace(/\]\(\/(?!\/)([^)]+)\)/g, `](${origin}/$1)`)
    .trim()
  const destination = join(publicDir, 'ai', page.source)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, `${markdown}\n`)
  links.push(`- [${page.name}](${url}): ${page.description}`)
  full.push(`\n---\n\nSource: ${url}\n\n${markdown}\n`)
}

await writeFile(join(publicDir, 'llms.txt'), `${introduction}\n## 接入文档\n\n${links.join('\n')}\n\n## Optional\n\n- [完整 Markdown 合集](${origin}/llms-full.txt): 以上文档的完整内容\n- [源码](https://github.com/YunYouJun/el-bot): 在线文档尚未部署时读取对应 Git revision 的 docs Markdown\n`)
await writeFile(join(publicDir, 'llms-full.txt'), full.join('\n'))
process.stdout.write(`Generated llms.txt, llms-full.txt and ${pages.length} Markdown pages.\n`)

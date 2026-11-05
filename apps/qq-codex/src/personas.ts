import type { PersonaImport, PersonaPreview, PersonaResult } from '@el-bot/persona'
import type { Command } from 'commander'
import type { CliPaths } from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { PersonaLibrary } from '@el-bot/persona'

export const personaDirectory = (configPath: string) => `${configPath}.personas`

interface PersonaOptions {
  file?: string
  url?: string
  repo?: string
  path?: string
  ref?: string
  id?: string
  preview?: string
  use?: string
  disable?: boolean
  update?: string
  revision?: string
  stdin?: boolean
  json?: boolean
}

/** Local-only management. No source, card text, or selection is accepted from QQ. */
export function registerPersonaCommand(program: Command, paths: (command: Command) => CliPaths) {
  program.command('persona')
    .description('导入、预览或切换当前实例的人物卡；下一条任务按新设定创建会话')
    .option('--file <path>', '从本地 UTF-8 Markdown 文件导入')
    .option('--url <url>', '从 HTTPS Markdown 原文链接导入')
    .option('--repo <url>', '从公开 HTTPS Git 仓库或本地仓库导入')
    .option('--path <path>', 'Git 仓库内人物卡的相对路径')
    .option('--ref <ref>', 'Git 分支、标签或提交 ID；默认 HEAD')
    .option('--id <id>', '导入时指定稳定的人物卡 id')
    .option('--preview <id>', '预览已导入人物卡')
    .option('--use <id>', '启用人物卡，不中断正在执行的任务')
    .option('--disable', '停用人设，下一条任务创建默认会话')
    .option('--update <id>', '重新获取来源，预览新版本；需另行启用')
    .option('--revision <hash>', '预览或启用指定历史版本，用于回滚')
    .option('--stdin', '从标准输入读取人物卡导入 JSON')
    .option('--json', '输出结构化人物卡目录和预览')
    .action(async (opts: PersonaOptions, command: Command) => {
      try {
        const actions = [opts.file, opts.url, opts.repo, opts.preview, opts.use, opts.disable, opts.update, opts.stdin].filter(Boolean)
        if (actions.length > 1 || (opts.revision && !opts.preview && !opts.use) || ((opts.path || opts.ref) && !opts.repo) || (opts.repo && !opts.path) || (opts.id && !opts.file && !opts.url && !opts.repo && !opts.stdin))
          throw new Error('每次选择一个人物卡操作；Git 导入需要 --repo 与 --path，--revision 仅用于预览或启用。')
        const library = new PersonaLibrary(personaDirectory(paths(command).config))
        let preview: PersonaPreview | undefined
        let input: PersonaImport | undefined
        if (opts.stdin) {
          let text = ''
          process.stdin.setEncoding('utf8')
          for await (const chunk of process.stdin) {
            text += chunk.toString('utf8')
            if (Buffer.byteLength(text) > 128 * 1024)
              throw new Error('人物卡导入请求过大。')
          }
          try {
            input = JSON.parse(text)
          }
          catch { throw new Error('人物卡导入请求不是有效 JSON。') }
          if (!input || typeof input !== 'object')
            throw new Error('人物卡导入请求无效。')
        }
        else if (opts.file) {
          input = { kind: 'file', path: opts.file }
        }
        else if (opts.url) {
          input = { kind: 'url', url: opts.url }
        }
        else if (opts.repo) {
          input = { kind: 'git', repository: opts.repo, path: opts.path!, ref: opts.ref }
        }
        if (input) {
          const card = await library.import(input, opts.id)
          preview = await library.preview(card.metadata.id, card.hash)
        }
        else if (opts.update) {
          const card = await library.update(opts.update)
          preview = await library.preview(card.metadata.id, card.hash)
        }
        else if (opts.preview) {
          preview = await library.preview(opts.preview, opts.revision)
        }
        else if (opts.use) {
          await library.select(opts.use, opts.revision)
        }
        else if (opts.disable) {
          await library.select(null)
        }
        const result: PersonaResult = { library: await library.list(), ...(preview ? { preview } : {}) }
        process.stdout.write(`${JSON.stringify({ ok: true, result }, null, opts.json ? undefined : 2)}\n`)
      }
      catch (error) {
        process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '人物卡操作失败。' })}\n`)
        process.exitCode = 1
      }
    })
}

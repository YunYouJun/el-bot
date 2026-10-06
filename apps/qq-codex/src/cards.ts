import type { QQKeyboard } from 'qq-sdk/official'
import type { CardButton, CardDetails, CommandButton, PendingApproval, ReplyCard, Task } from './types'
import { Buffer } from 'node:buffer'
import { BUTTON_STYLES, DOCUMENTATION_LINKS, HELP_BUTTON, HELP_COMMANDS_PER_IMAGE, HELP_PAGES, helpBody, TASK_STATUS_ICONS, TASK_STATUS_LABELS } from './constants'
import { failureText } from './failures'
import { pages } from './text'

export function escapeMarkdown(text: string): string {
  // QQ interprets backslash-parentheses as math. Entities preserve literal punctuation instead.
  return text.replace(/[&\\`*_{}[\]()#+\-.!|~<>$:/="']/g, character => `&#${character.codePointAt(0)};`)
}

function quote(text: string): string {
  return text.split('\n').map(line => `> ${escapeMarkdown(line)}`).join('\n')
}

/** Paginate original text by its escaped Markdown cost, keeping page boundaries stable across fallbacks. */
export function cardPages(text: string): string[] {
  return pages(text, 900, character => Buffer.byteLength(escapeMarkdown(character)) + (character === '\n' ? 2 : 0))
}

function keyboard(buttons: CardButton[]): QQKeyboard {
  const rendered = buttons.slice(0, 9).map((button, index) => ({
    id: String(index),
    render_data: { label: Array.from(button.label).slice(0, 10).join(''), style: BUTTON_STYLES[button.tone ?? 'secondary'], ...('url' in button ? { visited_label: button.label } : {}) },
    action: {
      ...('url' in button
        ? { type: 0 as const, data: button.url }
        : { type: 2 as const, data: button.command, enter: button.enter ?? true, ...(button.confirmation ? { modal: { content: button.confirmation, confirm_text: '确认', cancel_text: '取消' } } : {}) }),
      // C2C OpenIDs do not match the client's specify_user_ids. The controller checks ownership.
      permission: { type: 2 as const },
      unsupport_tips: 'url' in button ? '请打开消息中的文档链接。' : '请使用消息中的文字指令。',
    },
  }))
  const rows = []
  for (let index = 0; index < rendered.length; index += 3)
    rows.push({ buttons: rendered.slice(index, index + 3) })
  return { content: { rows } }
}

function card(title: string, details: CardDetails, buttons: CardButton[], _owner: string): ReplyCard {
  const fields = details.fields ?? []
  const links = details.links ?? []
  const text = [title, ...fields.map(field => `${field.label}：${field.value}`), details.section, details.body, ...links.map(link => `${link.label}：${link.url}`), details.footnote].filter(Boolean).join('\n')
  const markdown = [
    `## ${escapeMarkdown(title)}`,
    ...fields.map(field => `**${escapeMarkdown(field.label)}**：${escapeMarkdown(field.value)}`),
    ...(details.section ? [`**${escapeMarkdown(details.section)}**`] : []),
    quote(details.body),
    ...(links.length ? [links.map(link => `[${escapeMarkdown(link.label)}](${link.url})`).join(' · ')] : []),
    '***',
    escapeMarkdown(details.footnote),
  ].join('\n\n')
  return {
    text,
    visual: { title, details, tone: title.startsWith('✅') ? 'success' : title.startsWith('🔴') ? 'danger' : title.startsWith('🟡') ? 'warning' : title.startsWith('⏹') ? 'muted' : 'primary' },
    payload: {
      markdown: { content: markdown },
      keyboard: keyboard(buttons),
    },
  }
}

function navigation(command: string, page: number, total: number): CommandButton[] {
  return [
    ...(page > 1 ? [{ label: '上一页', command: `${command} ${page - 1}` }] : []),
    ...(page < total ? [{ label: '下一页', command: `${command} ${page + 1}`, tone: 'primary' as const }] : []),
  ]
}

function taskButtons(task: Task | undefined, primary: 'status' | 'result' | 'input' = 'result'): CommandButton[] {
  return [
    { label: '刷新状态', command: '/status', tone: primary === 'status' ? 'primary' : 'secondary' },
    ...(task ? [{ label: '查看结果', command: `/result ${task.id}`, tone: primary === 'result' ? 'primary' as const : 'secondary' as const }] : []),
    ...(task && (task.status === 'starting' || task.status === 'running')
      ? [{ label: '停止任务', command: `/stop ${task.id}`, tone: 'danger' as const, confirmation: '停止这一个 Codex 任务？' }]
      : [{ label: '输入任务', command: '/run ', enter: false, tone: primary === 'input' ? 'primary' as const : 'secondary' as const }]),
    HELP_BUTTON,
    ...(task?.failure && ['session-archived', 'session-missing', 'project-changed', 'context'].includes(task.failure)
      ? [{ label: '新建会话', command: `/new ${task.project}`, confirmation: '仅重置此任务项目的续聊绑定，保留历史。下一条任务新建会话，不自动重试。' }]
      : []),
    ...(task?.failure ? [{ label: '连接诊断', command: `/diagnose ${task.project}` }] : []),
  ]
}

/** A discoverable menu also works without rich rendering or an active Codex connection. */
export function helpCard(project: string, page: number, owner: string, notice?: string, options: { image?: boolean, part?: number } = {}): ReplyCard | undefined {
  if (!Number.isInteger(page) || page < 1 || page > HELP_PAGES.length)
    return undefined
  const details = HELP_PAGES[page - 1]
  const part = options.part ?? 1
  const total = options.image ? Math.ceil(details.commands.length / HELP_COMMANDS_PER_IMAGE) : 1
  if (!Number.isInteger(part) || part < 1 || part > total)
    return undefined
  const commands = options.image ? details.commands.slice((part - 1) * HELP_COMMANDS_PER_IMAGE, part * HELP_COMMANDS_PER_IMAGE) : details.commands
  const intro = [notice, details.intro].filter(Boolean).join('\n') || undefined
  const helpNavigation: CommandButton[] = options.image
    ? [
        ...(part > 1 ? [{ label: '上一页', command: `/help ${page} ${part - 1}` }] : page > 1 ? [{ label: '上一分类', command: `/help ${page - 1} ${Math.ceil(HELP_PAGES[page - 2].commands.length / HELP_COMMANDS_PER_IMAGE)}` }] : []),
        ...(part < total ? [{ label: '下一页', command: `/help ${page} ${part + 1}`, tone: 'primary' as const }] : page < HELP_PAGES.length ? [{ label: '下一分类', command: `/help ${page + 1}`, tone: 'primary' as const }] : []),
      ]
    : navigation('/help', page, HELP_PAGES.length)
  const navigationText = helpNavigation.map(button => `${button.label}：${button.command}`).join(' · ')
  return card(options.image ? `🧭 Codex 帮助 · 分类 ${page}/${HELP_PAGES.length}` : `🧭 Codex 快捷命令 (${page}/${HELP_PAGES.length})`, {
    fields: [{ label: '当前项目', value: project }],
    section: options.image ? `${details.title} · ${part}/${total}` : details.title,
    body: helpBody({ commands, intro, notes: details.notes }),
    footnote: options.image ? [`/help ${page} ${part} · /help 分类 页码`, navigationText, '使用图片外的按钮，或发送文字指令。'].filter(Boolean).join('\n') : '/help 页码 · /menu、/?、帮助、菜单也可打开帮助',
    links: DOCUMENTATION_LINKS,
    ...(options.image ? { help: { commands, intro, notes: details.notes, footer: `[参数] 可以省略，其余参数需填写\n${navigationText || '/help 返回帮助首页'}` } } : {}),
  }, page >= 4
    ? [
        ...helpNavigation,
        { label: 'API 目录', command: '/api', tone: 'primary' },
        { label: '桌面项目', command: '/desktop projects' },
        { label: '桌面聊天', command: '/desktop chats' },
        { label: '桌面工具', command: '/desktop tools' },
        { label: '项目会话', command: '/threads' },
        HELP_BUTTON,
      ]
    : [
        ...helpNavigation,
        { label: '输入任务', command: '/run ', enter: false, tone: 'primary' },
        { label: '任务状态', command: '/status' },
        { label: '最近结果', command: '/result' },
        { label: '选择项目', command: '/projects' },
        { label: '新建会话', command: '/new', confirmation: '下次任务创建新会话？当前项目的历史结果会保留。' },
        ...(page === 1 ? [{ label: '审批帮助', command: '/help 3' }] : []),
        ...DOCUMENTATION_LINKS.slice(0, 2),
      ], owner)
}

/** Keep project names visible and buttons bounded even for many long allowlisted names. */
export function projectsCard(projects: string[], current: string, page: number, owner: string): ReplyCard | undefined {
  const total = Math.ceil(projects.length / 4)
  if (!Number.isInteger(page) || page < 1 || page > total)
    return undefined
  const visible = projects.slice((page - 1) * 4, page * 4)
  return card(`📁 选择项目 (${page}/${total})`, {
    fields: [{ label: '当前项目', value: current }],
    body: visible.map(name => `${name === current ? '→ ' : ''}${name}`).join('\n'),
    footnote: '/projects 页码 · /project 名称 切换\n任务运行时不可切换。各项目保留自己的会话。',
  }, [
    ...navigation('/projects', page, total),
    ...visible.map(name => ({ label: name, command: `/project ${name}`, tone: name === current ? 'primary' as const : 'secondary' as const })),
    HELP_BUTTON,
  ], owner)
}

/** Show task admission without waiting for Codex startup. */
export function acceptedCard(task: Task, owner: string): ReplyCard {
  return card('⏳ 任务已接收', {
    fields: [{ label: '项目', value: task.project }, { label: '任务', value: task.id }],
    body: 'Codex 正在启动。需要审批时会发送详情。',
    footnote: `/status 查询 · /stop ${task.id} 停止 · /help 帮助`,
  }, taskButtons(task, 'status'), owner)
}

/** Render a bounded status page and buttons for pending requests visible on that page. */
export function statusCard(project: string, task: Task | undefined, pending: PendingApproval[], page: number, owner: string, management?: string): ReplyCard | undefined {
  const text = [management, pending.map(item => `${item.kind === 'input' ? '待回答' : '待审批'} ${item.token}：/approval ${item.token}`).join('\n')].filter(Boolean).join('\n') || (task?.failure ? failureText(task.failure) : '暂无待处理请求。')
  const parts = cardPages(text)
  if (!Number.isInteger(page) || page < 1 || page > parts.length)
    return undefined
  const body = parts[page - 1]
  const buttons: CommandButton[] = pending.filter(item => body.includes(item.token)).slice(0, 3).map(item => ({ label: item.kind === 'input' ? '查看问题' : '查看审批', command: `/approval ${item.token}`, tone: 'primary' }))
  return card(`${task ? TASK_STATUS_ICONS[task.status] : '💬'} 任务状态 (${page}/${parts.length})`, {
    fields: [{ label: '当前项目', value: project }, ...(task ? [{ label: '任务', value: task.id }, { label: '任务项目', value: task.project }, { label: '状态', value: TASK_STATUS_LABELS[task.status] }] : [])],
    body,
    footnote: '/status 页码 · /help 帮助 · 此卡片为发送时的状态',
  }, [...navigation('/status', page, parts.length), ...taskButtons(task, task?.status === 'running' || task?.status === 'starting' ? 'status' : 'result'), ...buttons], owner)
}

/** Render an unchanged result page, including explicit pagination commands. */
export function resultCard(task: Task, page: number, owner: string): ReplyCard | undefined {
  const parts = cardPages(task.output || '暂无文本结果。')
  if (!Number.isInteger(page) || page < 1 || page > parts.length)
    return undefined
  return card(`${TASK_STATUS_ICONS[task.status]} 任务${TASK_STATUS_LABELS[task.status]} (${page}/${parts.length})`, {
    fields: [{ label: '项目', value: task.project }, { label: '任务', value: task.id }],
    section: '结果',
    body: parts[page - 1],
    bodyFormat: 'markdown',
    footnote: `/result ${task.id} 页码 · /help 帮助`,
  }, [...navigation(`/result ${task.id}`, page, parts.length), ...taskButtons(task, task.status === 'running' || task.status === 'starting' ? 'status' : 'input')], owner)
}

/** Offer approval only when this delivered page would complete the full review. The controller rechecks it. */
export function approvalCard(approval: PendingApproval, page: number, owner: string): ReplyCard {
  const reviewed = approval.pages.every((_, index) => index + 1 === page || approval.viewed.has(index + 1))
  const buttons: CommandButton[] = [
    ...navigation(`/approval ${approval.token}`, page, approval.pages.length),
    ...(approval.kind === 'approval' && reviewed
      ? [{ label: '批准本次', command: `/approve ${approval.token}`, tone: 'primary' as const, confirmation: '已核对全部详情，批准本次请求？' }]
      : []),
    ...(approval.kind === 'input' ? [{ label: '填写回答', command: `/answer ${approval.token} `, enter: false, tone: 'primary' as const }] : []),
    { label: '拒绝请求', command: `/reject ${approval.token}`, tone: 'danger' },
    { label: '刷新状态', command: '/status' },
    HELP_BUTTON,
  ]
  const command = approval.kind === 'input' ? `/answer ${approval.token} {"问题ID":"回答"}` : `/approve ${approval.token} 或 /reject ${approval.token}`
  const rendered = card(`🟡 ${approval.kind === 'input' ? '待回答' : '待审批'} ${approval.token} (${page}/${approval.pages.length})`, {
    fields: [{ label: '范围', value: '仅本次请求' }, { label: '查看进度', value: `(${new Set([...approval.viewed, page]).size}/${approval.pages.length})` }],
    section: approval.kind === 'input' ? '问题详情' : '审批详情',
    body: approval.pages[page - 1],
    footnote: `/approval ${approval.token} 页码\n${command}\n/help 帮助`,
  }, buttons, owner)
  rendered.imageAllowed = false
  return rendered
}

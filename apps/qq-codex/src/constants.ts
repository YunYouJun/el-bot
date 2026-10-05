import type { CommandButton, FailureCode, FailureMessage, HelpPage, LinkButton, TaskStatus } from './types'

/** Public destinations contain no account, task or local-project metadata. */
export const DOCUMENTATION_LINKS: LinkButton[] = [
  { label: '文档站点', url: 'https://docs.bot.elpsy.cn/' },
  { label: '使用帮助', url: 'https://docs.bot.elpsy.cn/development/codex-remote#qq-%E5%91%BD%E4%BB%A4' },
  { label: 'AI 接入指南', url: 'https://docs.bot.elpsy.cn/codex/ai-setup' },
]

export const HELP_COMMANDS = new Set(['/help', '/menu', '/?', '/帮助', '/菜单', '帮助', '菜单'])

export const HELP_COMMANDS_PER_IMAGE = 4

/** Use one catalog for the image, Markdown and plain-text versions. */
export function helpBody(page: Pick<HelpPage, 'commands' | 'intro' | 'notes'>): string {
  return [
    page.intro,
    ...page.commands.map(entry => `${[entry.command, ...entry.relatedCommands ?? []].join('、')}${entry.parameters ? ` ${entry.parameters}` : ''}：${entry.description}`),
    ...page.notes,
  ].filter(Boolean).join('\n')
}

export const HELP_PAGES: HelpPage[] = ([
  {
    title: '任务与结果',
    intro: '直接发送文字，在当前项目提交任务并继续会话。',
    commands: [
      { command: '/run', parameters: '提示词', description: '提交任务；提示词以 / 开头时也可使用。' },
      { command: '/review', parameters: '[目标JSON]', description: '审查代码，默认检查未提交改动。' },
      { command: '/steer', parameters: '提示词', description: '向正在执行的任务补充要求。' },
      { command: '/status', parameters: '[页码]', description: '查看任务状态，以及待审批、待回答请求。' },
      { command: '/result', parameters: '[任务ID] [页码]', description: '查看结果；省略任务 ID 时查看最近任务。' },
      { command: '/stop', parameters: '[任务ID]', description: '请求停止任务，再用 /status 确认状态。' },
      { command: '/help', parameters: '[分类] [页码]', description: '查看帮助；/menu、/?、帮助、菜单也可使用。' },
    ],
    notes: ['同一时间只能运行一个任务。输入任务按钮会填入草稿，补齐后发送。'],
  },
  {
    title: '项目与会话',
    commands: [
      { command: '/projects', parameters: '[页码]', description: '查看允许的项目，点选按钮切换。' },
      { command: '/project', parameters: '名称', description: '切换项目；各项目保留自己的会话。' },
      { command: '/diagnose', parameters: '[项目]', description: '只读检查会话是否归档、丢失或路径变化。' },
      { command: '/new', parameters: '[项目]', description: '下一条任务新建会话，保留历史结果；省略项目时使用当前项目。' },
      { command: '/thread use', parameters: 'ID', description: '绑定当前项目已有会话。' },
      { command: '/thread fork', description: '复制当前会话历史，并绑定新会话。' },
    ],
    notes: ['任务运行时不可切换项目或会话，请等待完成或先 /stop。', '服务断开时，在本机运行 check --all；停止服务后可用 recover --project 项目恢复。'],
  },
  {
    title: '审批与回答',
    commands: [
      { command: '/approval', parameters: 'ID [页码]', description: '查看完整审批或问题详情。' },
      { command: '/approve', parameters: 'ID', description: '批准本次请求；需先查看全部详情页。' },
      { command: '/reject', parameters: 'ID', description: '拒绝本次请求。' },
      { command: '/answer', parameters: 'ID {"问题ID":"回答"}', description: '一次回答全部问题。' },
    ],
    notes: ['可从 /status 找到待处理编号；过期或已处理的请求不可再次操作。', '帮助菜单不会执行审批，具体操作只出现在对应请求卡片中。'],
  },
  {
    title: 'API 与能力管理',
    commands: [
      { command: '/threads', parameters: '[游标]', description: '查看当前项目的 Codex 会话。' },
      { command: '/thread use', parameters: '会话ID', description: '绑定已有会话。' },
      { command: '/models', relatedCommands: ['/skills', '/plugins', '/mcp'], description: '分别浏览模型、技能、插件和 MCP 服务。' },
      { command: '/api', parameters: '[方法前缀] [页码]', description: '查看本机版本的协议目录。' },
      { command: '/api schema', parameters: '方法 [页码]', description: '查看接口参数 schema。' },
      { command: '/rpc', parameters: '方法 JSON', description: '调用协议接口。' },
      { command: '/events', parameters: '[页码]', description: '查看最近的脱敏事件。' },
      { command: '/manage-result', parameters: 'ID [页码]', description: '查询管理结果。' },
    ],
    notes: ['管理写操作先 /inspect ID 查看全部详情，再 /confirm ID；/cancel ID 取消。'],
  },
  {
    title: 'Codex Desktop 管理',
    commands: [
      { command: '/desktop projects', description: '读取桌面宿主项目列表。' },
      { command: '/desktop chats', description: '读取桌面聊天与侧栏。' },
      { command: '/desktop tools', parameters: '[页码]', description: '列出当前宿主实际提供的工具。' },
      { command: '/desktop schema', parameters: '工具 [页码]', description: '查看工具说明与参数。' },
      { command: '/desktop call', parameters: '工具 JSON', description: '调用桌面工具。' },
    ],
    notes: ['可管理聊天、侧栏、工作树、插件和自动化，具体范围以工具目录为准。', '写操作需查看详情并确认，宿主权限仍然生效。', '需在本机配置桌面适配器并通过 desktop-check。'],
  },
] satisfies Omit<HelpPage, 'body'>[]).map(page => ({ ...page, body: helpBody(page) }))

export const HELP_BUTTON: CommandButton = { label: '帮助菜单', command: '/help' }

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  starting: '启动中',
  running: '执行中',
  completed: '已完成',
  interrupted: '已中断',
  failed: '失败',
}

/** Status symbols remain distinguishable alongside labels when colors are unavailable. */
export const TASK_STATUS_ICONS: Record<TaskStatus, string> = {
  starting: '⏳',
  running: '🔵',
  completed: '✅',
  interrupted: '⏹️',
  failed: '🔴',
}

/** Official QQ styles: blue outline, gray outline, white background with red text. */
export const BUTTON_STYLES: Record<NonNullable<CommandButton['tone']>, 0 | 1 | 3> = {
  primary: 1,
  secondary: 0,
  danger: 3,
}

/** Trusted, actionable diagnostics instead of unfiltered upstream error messages. */
export const FAILURE_MESSAGES: Record<FailureCode, FailureMessage> = {
  'authentication': { summary: 'Codex 登录已失效，无法访问模型。', hint: '在运行服务的电脑执行 codex login，完成登录后重启 el-bot codex start，再发送新任务。' },
  'model': { summary: '当前模型不受该 Codex 账户支持。', hint: '运行 el-bot codex check；将遥控配置的 model 设置为账户支持的模型，再重启服务。' },
  'session-archived': { summary: '当前 Codex 会话已归档，不能继续执行。', hint: '发送 /new，下一条任务创建新会话；原会话和历史结果保留。' },
  'session-missing': { summary: '原 Codex 会话不存在或无法读取。', hint: '确认使用原机器与 Codex 账户；需要新会话时发送 /new，再提交任务。' },
  'project-changed': { summary: '项目路径已变化，无法沿用旧会话。', hint: '核对本机项目配置，再发送 /new 创建新会话。' },
  'quota': { summary: 'Codex 账户的模型使用额度已用尽。', hint: '检查账户额度与重置时间，恢复后再发送新任务。' },
  'rate-limit': { summary: '模型请求暂时受到限流。', hint: '稍后重新提交任务；历史输出可用 /result 查询。' },
  'context': { summary: 'Codex 会话上下文或本次会话预算已达到上限。', hint: '保留必要背景后发送 /new，再用较短的提示提交任务。' },
  'network': { summary: 'Codex 与模型服务的连接失败。', hint: '检查本机网络、代理及模型服务状态，恢复后再发送新任务。' },
  'timeout': { summary: '本机 Codex 请求超时，服务已停止接收新任务。', hint: '检查本机 Codex 状态并重启 el-bot codex start，再继续。' },
  'connection': { summary: '本机 Codex 连接已断开。', hint: '检查 Codex 可执行文件与本机进程，重启 el-bot codex start。' },
  'stop-unconfirmed': { summary: '无法确认当前任务的终端命令已终止，服务已停止接收新任务。', hint: '在本机检查并结束该任务的命令进程，核对 Codex 终端控制接口支持后重启服务。不要将本次状态视为命令已停止。' },
  'unknown': { summary: 'Codex 任务未完成，暂未识别具体原因。', hint: '在本机运行 el-bot codex check --all，核对登录、模型和项目配置后再提交。' },
}

// Only explicit format/capability rejections are safe to retry.
export const FORMAT_REJECTIONS = new Set([22006, 50059, 304061, 40034008, 40034011, 40034029, 40034106, 40034108, 40034109, 40034124, 40034127, 40054007, 40054018])

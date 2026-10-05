import type { ExampleScenario } from './types'

export const scenarios: ExampleScenario[] = [
  {
    id: 'task',
    title: '下达任务',
    description: '选择允许的本地项目，像聊天一样描述任务。Codex 在你的电脑上工作，完成后把结果发回 QQ。',
    messages: [
      { role: 'user', text: '/project my-project' },
      { role: 'bot', text: '已切换到 my-project。' },
      { role: 'user', text: '检查 README 的安装步骤，修正文档里的过期命令。' },
      { role: 'bot', title: '⏳ 任务已接收', fields: [{ label: '项目', value: 'my-project' }, { label: '任务', value: 'e5f6a7b8' }], text: 'Codex 正在启动。需要审批时会发送详情。', footnote: '/status 查询 · /stop e5f6a7b8 停止', actions: [{ label: '刷新状态', tone: 'primary' }, { label: '查看结果' }, { label: '停止任务', tone: 'danger' }] },
      { role: 'bot', title: '✅ 任务已完成 (1/1)', fields: [{ label: '项目', value: 'my-project' }, { label: '任务', value: 'e5f6a7b8' }], section: '结果', text: '已更新安装步骤，并核对 CLI 帮助。', footnote: '/result e5f6a7b8 页码', actions: [{ label: '刷新状态' }, { label: '查看结果' }, { label: '输入任务', tone: 'primary' }] },
    ],
  },
  {
    id: 'approval',
    title: '处理审批',
    description: '需要升级权限时，在 QQ 查看具体请求并决定。长内容必须查看全部页，只批准当前这一条请求。',
    messages: [
      { role: 'bot', title: '🟡 待审批 a1b2c3d4 (1/1)', fields: [{ label: '范围', value: '仅本次请求' }, { label: '查看进度', value: '(1/1)' }], section: '审批详情', text: '命令：pnpm install\n原因：需要联网下载项目依赖', footnote: '/approve a1b2c3d4 或 /reject a1b2c3d4', actions: [{ label: '批准本次', tone: 'primary' }, { label: '拒绝请求', tone: 'danger' }, { label: '刷新状态' }] },
      { role: 'user', text: '/approve a1b2c3d4' },
      { role: 'bot', text: '已处理该请求。' },
      { role: 'user', text: '/status' },
      { role: 'bot', title: '🔵 任务状态 (1/1)', fields: [{ label: '当前项目', value: 'my-project' }, { label: '任务', value: 'e5f6a7b8' }, { label: '任务项目', value: 'my-project' }, { label: '状态', value: '执行中' }], text: '暂无待处理请求。', footnote: '/status 页码 · 此卡片为发送时的状态', actions: [{ label: '刷新状态', tone: 'primary' }, { label: '查看结果' }, { label: '停止任务', tone: 'danger' }] },
    ],
  },
  {
    id: 'continue',
    title: '继续会话',
    description: '每个项目保留自己的会话。可以查询上次结果、继续安排工作，或使用 /new 从新会话开始。',
    messages: [
      { role: 'user', text: '/result e5f6a7b8' },
      { role: 'bot', title: '✅ 任务已完成 (1/2)', fields: [{ label: '项目', value: 'my-project' }, { label: '任务', value: 'e5f6a7b8' }], section: '结果', text: '已更新安装步骤，并核对 CLI 帮助。', footnote: '/result e5f6a7b8 页码', actions: [{ label: '下一页', tone: 'primary' }, { label: '刷新状态' }, { label: '查看结果' }, { label: '输入任务', tone: 'primary' }] },
      { role: 'user', text: '继续补充 Windows 用户的安装说明。' },
      { role: 'bot', title: '⏳ 任务已接收', fields: [{ label: '项目', value: 'my-project' }, { label: '任务', value: 'c9d0e1f2' }], text: 'Codex 正在启动。需要审批时会发送详情。', footnote: '/status 查询 · /stop c9d0e1f2 停止', actions: [{ label: '刷新状态', tone: 'primary' }, { label: '查看结果' }, { label: '停止任务', tone: 'danger' }] },
    ],
  },
]

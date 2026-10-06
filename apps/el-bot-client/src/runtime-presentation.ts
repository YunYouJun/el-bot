import type { YlfAgentState } from './components/ui/agent'
import type { RuntimeStatus } from './types'

interface Indicator { state: YlfAgentState, label: string }
const phases: Record<RuntimeStatus['phase'], Indicator> = {
  stopped: { state: 'offline', label: '已停止' },
  starting: { state: 'connecting', label: '正在启动' },
  running: { state: 'working', label: '运行中' },
  stopping: { state: 'connecting', label: '正在停止' },
  unmanaged: { state: 'unknown', label: '暂不可管理' },
}
const transports: Record<RuntimeStatus['qq'], Indicator> = {
  connected: { state: 'ready', label: '已连接' },
  connecting: { state: 'connecting', label: '连接中' },
  disconnected: { state: 'offline', label: '未连接' },
  webhook: { state: 'waiting', label: '回调已监听' },
}
const tasks: Record<string, Indicator> = {
  starting: { state: 'connecting', label: '正在启动' },
  running: { state: 'working', label: '执行中' },
  completed: { state: 'ready', label: '已完成' },
  interrupted: { state: 'offline', label: '已中断' },
  failed: { state: 'error', label: '失败' },
}

export function runtimeIndicator(status?: RuntimeStatus): Indicator {
  if (!status)
    return { state: 'unknown', label: '等待连接' }
  return phases[status.phase]
}

export function connectionIndicator(status: RuntimeStatus | undefined, service: 'qq' | 'codex'): Indicator {
  if (!status || status.phase === 'unmanaged')
    return { state: 'unknown', label: '未验证' }
  if (service === 'codex' && status.codex === 'connected')
    return { state: 'ready', label: status.agent && status.agent !== 'codex' ? '已连接' : '已就绪' }
  return transports[status[service]]
}

export function taskIndicator(status?: RuntimeStatus): Indicator {
  if (!status || status.phase === 'unmanaged')
    return { state: 'unknown', label: '未验证' }
  if (status.task)
    return tasks[status.task.status] ?? { state: 'unknown', label: status.task.status }
  if (status.busy)
    return { state: 'working', label: '管理操作进行中' }
  return { state: 'offline', label: '空闲' }
}

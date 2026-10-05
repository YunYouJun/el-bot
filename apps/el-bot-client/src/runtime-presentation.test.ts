import type { RuntimeStatus } from './types'
import { describe, expect, it } from 'vitest'
import { connectionIndicator, runtimeIndicator, taskIndicator } from './runtime-presentation'

const running: RuntimeStatus = { phase: 'running', qq: 'connected', codex: 'connected', busy: false }

describe('client status presentation', () => {
  it('keeps every service and task unverified when the instance cannot be managed', () => {
    const status = { ...running, phase: 'unmanaged' as const, task: { id: 'old-task', status: 'completed' } }
    expect(runtimeIndicator(status)).toEqual({ state: 'unknown', label: '暂不可管理' })
    expect(connectionIndicator(status, 'qq')).toEqual({ state: 'unknown', label: '未验证' })
    expect(connectionIndicator(status, 'codex')).toEqual({ state: 'unknown', label: '未验证' })
    expect(taskIndicator(status)).toEqual({ state: 'unknown', label: '未验证' })
  })

  it('distinguishes process state, listening callbacks and model readiness', () => {
    const status = { ...running, qq: 'webhook' as const, codex: 'disconnected' as const }
    expect(runtimeIndicator(status).label).toBe('运行中')
    expect(connectionIndicator(status, 'qq')).toEqual({ state: 'waiting', label: '回调已监听' })
    expect(connectionIndicator(status, 'codex')).toEqual({ state: 'offline', label: '未连接' })
  })

  it('retains unfamiliar backend task statuses rather than treating them as success', () => {
    expect(taskIndicator({ ...running, busy: true, task: { id: 'task-1', status: 'awaiting_approval' } })).toEqual({ state: 'unknown', label: 'awaiting_approval' })
    expect(taskIndicator({ ...running, busy: true })).toEqual({ state: 'working', label: '管理操作进行中' })
    expect(taskIndicator(undefined)).toEqual({ state: 'unknown', label: '未验证' })
  })
})

import type { PushReceipt, PushSender } from './apns'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { DeviceStore } from './auth'
import { ReminderNotifications } from './notifications'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture(sender?: PushSender) {
  const directory = await mkdtemp(join(tmpdir(), 'yun-notifications-'))
  directories.push(directory)
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const { code } = await devices.createPairing()
  const { device } = await devices.exchange(code, 'iPhone')
  const send = vi.fn<PushSender>(sender ?? (async row => ({ status: 'accepted', id: row.id })))
  const file = join(directory, 'notifications.json')
  const notifications = new ReminderNotifications(file, devices, send, 'https://bot.test')
  await notifications.load()
  await notifications.register(device.id, { token: 'ab'.repeat(32), environment: 'sandbox' })
  return { notifications, devices, device, send, file }
}
async function reminder(notifications: ReminderNotifications, id = 'reminder') {
  await notifications.event('owner-session', { type: 'user/message', data: { id, source: { kind: 'schedule' } } })
  await notifications.event('owner-session', { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '该去看牙了' }] } } })
  await notifications.event('owner-session', { type: 'turn/end', data: {} })
}

it('pushes a completed scheduled response once and persists receipts across restarts', async () => {
  const { notifications, devices, device, send, file } = await fixture()
  await reminder(notifications)
  expect(send).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'owner-session', origin: 'https://bot.test', text: '该去看牙了', environment: 'sandbox' }))
  expect(notifications.status(device.id)).toMatchObject({ configured: true, registered: true, lastReceipt: { status: 'accepted' } })
  const restored = new ReminderNotifications(file, devices, send)
  await restored.load()
  await reminder(restored)
  expect(send).toHaveBeenCalledOnce()
  expect(await readFile(file, 'utf8')).not.toContain('该去看牙了')
  expect((await stat(file)).mode & 0o777).toBe(0o600)
  expect(JSON.stringify(notifications.status(device.id))).not.toContain('ab'.repeat(32))
})

it('does not turn ordinary chat, spoofed reminder text, or a revoked device into pushes', async () => {
  const { notifications, device, devices, send } = await fixture()
  await notifications.event('owner-session', { type: 'user/message', data: { id: 'human', source: { kind: 'user' } } })
  await notifications.event('owner-session', { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '[SCHEDULE REMINDER BATCH]' }] } } })
  await notifications.event('owner-session', { type: 'turn/end', data: {} })
  expect(send).not.toHaveBeenCalled()
  await devices.revoke(device.id)
  await reminder(notifications)
  expect(send).not.toHaveBeenCalled()
  await expect(notifications.register(device.id, { token: 'ab'.repeat(32), environment: 'sandbox' })).rejects.toThrow('unauthorized')
})

it('keeps uncertain outcomes without resending and removes invalid APNs registrations', async () => {
  const { notifications, device, send } = await fixture(async row => ({ status: 'unknown', id: row.id, code: 'timeout' }))
  await reminder(notifications)
  await reminder(notifications)
  expect(send).toHaveBeenCalledOnce()
  expect(notifications.status(device.id).lastReceipt?.status).toBe('unknown')
  send.mockImplementationOnce(async row => ({ status: 'rejected', id: row.id, code: 'Unregistered' }))
  await reminder(notifications, 'second-reminder')
  expect(notifications.status(device.id)).toMatchObject({ registered: false, lastReceipt: { status: 'rejected', code: 'Unregistered' } })
})

it('claims before sending and refuses invalid registrations', async () => {
  let persisted: PushReceipt | undefined
  const { notifications, device, send, file } = await fixture()
  send.mockImplementationOnce(async () => {
    const state = JSON.parse(await readFile(file, 'utf8'))
    persisted = state.receipts[0]
    throw new Error('disconnected')
  })
  await reminder(notifications)
  expect(persisted?.status).toBe('unknown')
  expect(notifications.status(device.id).lastReceipt?.status).toBe('unknown')
  await expect(notifications.register(device.id, { token: 'https://attacker.test', environment: 'sandbox' })).rejects.toThrow('invalid_push_registration')
  await expect(notifications.register(device.id, { token: 'ab'.repeat(32), environment: 'unknown' })).rejects.toThrow('invalid_push_registration')
})

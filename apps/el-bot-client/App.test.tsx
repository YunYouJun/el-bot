import { expect, open, test } from 'nsh/test'
import { cloudAddress, initialState, isClientState } from './src/client'

test('desktop navigation uses the controller and follows its snapshots', async () => {
  const state = initialState('en')
  state.programs = [{ name: 'codex', title: 'Codex', action: 'Open Codex' }]
  const app = await open('./App.tsx', { platform: 'macos', host: { handlers: { 'client.snapshot': state, 'client.event': null } } })
  expect(app.shows('Open cloud DSH')).toBe(true)
  expect(app.shows('Open Codex')).toBe(true)
  await app.press('id:nav-settings')
  expect(app.host.calls()).toEqual([
    { name: 'client.snapshot', data: null },
    { name: 'client.event', data: { action: 'navigate', value: 'settings' } },
  ])
  await app.host.send('client.state', { ...state, page: 'settings' })
  expect(app.shows('Credentials file path')).toBe(true)
  expect(app.shows('Load reply settings')).toBe(true)
})

test('interruption requires the explicit confirmation action', async () => {
  const state = { ...initialState('en'), busy: true, localExpanded: true, phaseKey: 'running', confirmation: 'stop' }
  const app = await open('./App.tsx', { platform: 'macos', host: { handlers: { 'client.snapshot': state, 'client.event': null } } })
  expect(app.shows('A task is still running')).toBe(true)
  await app.press('id:confirm-interrupt')
  expect(app.host.calls()).toEqual([
    { name: 'client.snapshot', data: null },
    { name: 'client.event', data: { action: 'confirmInterrupt', value: 'stop' } },
  ])
})

for (const platform of ['ios', 'android'] as const) {
  test(`${platform} shows cloud access without desktop controls even in a native host`, async () => {
    const app = await open('./App.tsx', {
      platform,
      width: 390,
      height: 844,
      host: { handlers: { 'unrelated.native.api': null } },
    })
    await app.press('id:nav-settings')
    expect(app.shows('Cloud DSH address')).toBe(true)
    expect(app.shows('Node executable')).toBe(false)
    expect(app.shows('Credentials file path')).toBe(false)
    expect(app.host.calls()).toEqual([])
  })
}

test('untrusted connection addresses and malformed snapshots are rejected', () => {
  expect(cloudAddress('https://cloud.example/login')).toBe('https://cloud.example/login')
  for (const value of ['http://example.com', 'file:///private', 'https://user:secret@example.com', 'https://example.com/?token=secret']) {
    let rejected = false
    try {
      cloudAddress(value)
    }
    catch { rejected = true }
    expect(rejected).toBe(true)
  }
  expect(isClientState(initialState())).toBe(true)
  expect(isClientState({ ...initialState(), programs: [{ name: 'shell' }] })).toBe(false)
  expect(isClientState(null)).toBe(false)
})

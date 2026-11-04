import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const cleanup: (() => Promise<void> | void)[] = []
const cliPath = fileURLToPath(new URL('cli.ts', import.meta.url))

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'wecom-cli-'))
  cleanup.push(() => rm(cwd, { recursive: true, force: true }))
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('WECOM_')))
  return exec(process.execPath, ['--import', import.meta.resolve('tsx'), cliPath, ...args], {
    cwd,
    env: { ...inherited, CONSOLA_LEVEL: '3', ...env },
    timeout: 5000,
  })
}

async function groupServer() {
  const requests: unknown[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push(JSON.parse(body))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address')
  return { requests, url: `http://127.0.0.1:${address.port}/send?key=private-test-key` }
}

describe('wecom CLI', () => {
  it('checks smart-bot credentials without connecting or requiring a webhook', async () => {
    const result = await runCli(['--check'], {
      WECOM_BOT_ID: 'private-bot-id',
      WECOM_BOT_SECRET: 'private-bot-secret',
      WECOM_WS_URL: 'ws://127.0.0.1:1',
    })
    expect(`${result.stdout}${result.stderr}`).toContain('smart (智能机器人 · 长连接)')
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/private-bot-id|private-bot-secret/)
  })

  it('does not send a message when checking a group webhook configuration', async () => {
    const server = await groupServer()
    const result = await runCli(['--type', 'webhook', '--check', '--message', 'do not send'], {
      WECOM_GROUP_WEBHOOK_URL: server.url,
    })
    expect(`${result.stdout}${result.stderr}`).toContain('webhook (群 Webhook 机器人)')
    expect(server.requests).toHaveLength(0)
    expect(`${result.stdout}${result.stderr}`).not.toContain('private-test-key')
  })

  it('selects a group bot explicitly and sends a Markdown notification', async () => {
    const server = await groupServer()
    const result = await runCli(['--type', 'webhook', '--message', '**hello**', '--format', 'markdown'], {
      WECOM_BOT_TYPE: 'smart',
      WECOM_GROUP_WEBHOOK_URL: server.url,
    })
    expect(server.requests).toEqual([{ msgtype: 'markdown', markdown: { content: '**hello**' } }])
    expect(`${result.stdout}${result.stderr}`).toContain('message sent')
    expect(`${result.stdout}${result.stderr}`).not.toContain('private-test-key')
  })

  it('requires an explicit message before sending a group notification', async () => {
    const server = await groupServer()
    await expect(runCli(['--type', 'webhook'], { WECOM_GROUP_WEBHOOK_URL: server.url })).rejects.toMatchObject({
      stderr: expect.stringContaining('Use --message <content> or --check'),
    })
    expect(server.requests).toHaveLength(0)
  })

  it('shows both bot types without needing credentials', async () => {
    const result = await runCli(['--help'])
    expect(`${result.stdout}${result.stderr}`).toContain('smart|webhook')
    expect(`${result.stdout}${result.stderr}`).toContain('WECOM_GROUP_WEBHOOK_URL')
  })
})

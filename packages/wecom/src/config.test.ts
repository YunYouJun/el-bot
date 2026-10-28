import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadWecomConfig } from './config'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wecom-config-'))
  dirs.push(dir)
  return dir
}

const fileConfig = {
  botId: 'file-bot',
  secret: 'file-secret',
  webhookUrl: 'https://example.invalid/hook',
  webhookAuthHeader: 'X-Grok-Routine-Key',
  webhookAuthValue: 'file-key',
}

describe('loadWecomConfig', () => {
  it('reads a local json file', async () => {
    const cwd = await tempDir()
    await writeFile(path.join(cwd, 'wecom.config.json'), JSON.stringify(fileConfig))
    await expect(loadWecomConfig({ env: {}, cwd })).resolves.toEqual({
      botId: 'file-bot',
      secret: 'file-secret',
      wsUrl: 'wss://openws.work.weixin.qq.com',
      webhookUrl: 'https://example.invalid/hook',
      webhookAuthHeader: 'X-Grok-Routine-Key',
      webhookAuthValue: 'file-key',
      heartbeatIntervalMs: 30_000,
    })
  })

  it('lets environment variables override the file', async () => {
    const cwd = await tempDir()
    await writeFile(path.join(cwd, 'wecom.config.json'), JSON.stringify(fileConfig))
    const config = await loadWecomConfig({
      cwd,
      env: {
        WECOM_BOT_SECRET: 'env-secret',
        WECOM_WEBHOOK_URL: 'https://example.invalid/from-env',
        WECOM_WEBHOOK_AUTH_HEADER: 'Authorization',
        WECOM_WEBHOOK_AUTH_VALUE: 'Bearer REPLACE_WITH_ROUTINE_KEY',
      },
    })
    expect(config.secret).toBe('env-secret')
    expect(config.botId).toBe('file-bot')
    expect(config.webhookUrl).toBe('https://example.invalid/from-env')
    expect(config.webhookAuthHeader).toBe('Authorization')
    expect(config.webhookAuthValue).toBe('Bearer REPLACE_WITH_ROUTINE_KEY')
  })

  it('names the missing environment variables', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({ env: {}, cwd })).rejects.toThrow(
      'Missing WeCom config: botId (WECOM_BOT_ID), secret (WECOM_BOT_SECRET), webhookUrl (WECOM_WEBHOOK_URL), webhookAuthValue (WECOM_WEBHOOK_AUTH_VALUE)',
    )
  })

  it('rejects a heartbeat that is too small', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({
      cwd,
      env: {
        WECOM_BOT_ID: 'your-bot-id',
        WECOM_BOT_SECRET: 'your-bot-secret',
        WECOM_WEBHOOK_URL: 'https://example.invalid/hook',
        WECOM_WEBHOOK_AUTH_VALUE: 'Bearer REPLACE_WITH_ROUTINE_KEY',
        WECOM_HEARTBEAT_MS: '50',
      },
    })).rejects.toThrow('WECOM_HEARTBEAT_MS must be an integer >= 1000')
  })
})

describe('placeholder config', () => {
  it('ships examples without live credentials', async () => {
    const root = new URL('..', import.meta.url)
    const envExample = await readFile(new URL('.env.example', root), 'utf8')
    const jsonExample = await readFile(new URL('wecom.config.example.json', root), 'utf8')
    expect(envExample).toContain('WECOM_BOT_ID=your-bot-id')
    expect(envExample).toContain('WECOM_BOT_SECRET=your-bot-secret')
    expect(envExample).toContain('WECOM_WEBHOOK_AUTH_VALUE=Bearer REPLACE_WITH_ROUTINE_KEY')
    expect(jsonExample).toContain('REPLACE_WITH_ROUTINE_KEY')
    expect(jsonExample).not.toMatch(/sk-[A-Za-z0-9]/)
    expect(`${envExample}\n${jsonExample}`).not.toMatch(/corpsecret|ww[0-9a-f]{6,}/i)
  })
})

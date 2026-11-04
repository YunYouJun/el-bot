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
  it('accepts smart-bot credentials without any webhook', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({
      cwd,
      env: { WECOM_BOT_ID: 'bot', WECOM_BOT_SECRET: 'secret' },
    })).resolves.toMatchObject({ botType: 'smart', botId: 'bot', secret: 'secret' })
  })

  it('accepts a group webhook bot without smart-bot credentials', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({
      cwd,
      env: { WECOM_BOT_TYPE: 'webhook', WECOM_GROUP_WEBHOOK_URL: 'https://example.invalid/send?key=placeholder' },
    })).resolves.toEqual({ botType: 'webhook', groupWebhookUrl: 'https://example.invalid/send?key=placeholder' })
  })

  it('reads a local json file', async () => {
    const cwd = await tempDir()
    await writeFile(path.join(cwd, 'wecom.config.json'), JSON.stringify(fileConfig))
    await expect(loadWecomConfig({ env: {}, cwd })).resolves.toEqual({
      botType: 'smart',
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
    expect(config).toMatchObject({
      botType: 'smart',
      secret: 'env-secret',
      botId: 'file-bot',
      webhookUrl: 'https://example.invalid/from-env',
      webhookAuthHeader: 'Authorization',
      webhookAuthValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
    })
  })

  it('names the missing environment variables', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({ env: {}, cwd })).rejects.toThrow(
      'Missing WeCom config: botId (WECOM_BOT_ID), secret (WECOM_BOT_SECRET)',
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

  it('selects the bot type from JSON and lets explicit selection override the environment', async () => {
    const cwd = await tempDir()
    await writeFile(path.join(cwd, 'wecom.config.json'), JSON.stringify({
      botType: 'webhook',
      groupWebhookUrl: 'https://example.invalid/group',
      botId: 'file-bot',
      secret: 'file-secret',
    }))
    await expect(loadWecomConfig({ cwd, env: {} })).resolves.toMatchObject({ botType: 'webhook' })
    await expect(loadWecomConfig({ cwd, env: { WECOM_BOT_TYPE: 'smart' } })).resolves.toMatchObject({ botType: 'smart' })
    await expect(loadWecomConfig({ cwd, env: { WECOM_BOT_TYPE: 'smart' }, botType: 'webhook' })).resolves.toMatchObject({ botType: 'webhook' })
  })

  it('requires a dedicated group URL and never uses an external forwarding URL for notifications', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({
      cwd,
      env: { WECOM_BOT_TYPE: 'webhook', WECOM_WEBHOOK_URL: 'https://example.invalid/grok' },
    })).rejects.toThrow('groupWebhookUrl (WECOM_GROUP_WEBHOOK_URL)')
  })

  it('ignores group-webhook settings in smart-bot mode', async () => {
    const cwd = await tempDir()
    const config = await loadWecomConfig({
      cwd,
      env: { WECOM_BOT_ID: 'bot', WECOM_BOT_SECRET: 'secret', WECOM_GROUP_WEBHOOK_URL: 'invalid-unused-url' },
    })
    expect(config).toMatchObject({ botType: 'smart' })
    expect(config).not.toHaveProperty('groupWebhookUrl')
    expect(config).toHaveProperty('webhookUrl', undefined)
  })

  it('supports explicit forwarding names and keeps legacy environment variables ahead of JSON', async () => {
    const cwd = await tempDir()
    await writeFile(path.join(cwd, 'wecom.config.json'), JSON.stringify({
      ...fileConfig,
      forwardWebhookUrl: 'https://example.invalid/file-forward',
      forwardWebhookAuthValue: 'file-forward-key',
    }))
    const env = { WECOM_WEBHOOK_URL: 'https://example.invalid/legacy-env', WECOM_WEBHOOK_AUTH_VALUE: 'env-key' }
    await expect(loadWecomConfig({ cwd, env })).resolves.toMatchObject({
      webhookUrl: env.WECOM_WEBHOOK_URL,
      webhookAuthValue: 'env-key',
    })
    await expect(loadWecomConfig({ cwd, env: { ...env, WECOM_FORWARD_WEBHOOK_URL: 'https://example.invalid/new-env' } })).resolves.toMatchObject({
      webhookUrl: 'https://example.invalid/new-env',
    })
  })

  it('still requires authentication when external forwarding is configured', async () => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({
      cwd,
      env: { WECOM_BOT_ID: 'bot', WECOM_BOT_SECRET: 'secret', WECOM_FORWARD_WEBHOOK_URL: 'https://example.invalid/forward' },
    })).rejects.toThrow('WECOM_FORWARD_WEBHOOK_AUTH_VALUE')
  })

  it.each([
    { WECOM_BOT_TYPE: 'unknown' },
    { WECOM_BOT_TYPE: 'webhook', WECOM_GROUP_WEBHOOK_URL: 'not-a-url' },
    { WECOM_BOT_TYPE: 'webhook', WECOM_GROUP_WEBHOOK_URL: 'file:///tmp/webhook' },
    { WECOM_BOT_ID: 'bot', WECOM_BOT_SECRET: 'secret', WECOM_WS_URL: 'https://example.invalid' },
  ])('rejects invalid type or transport settings: %j', async (env) => {
    const cwd = await tempDir()
    await expect(loadWecomConfig({ cwd, env })).rejects.toThrow()
  })
})

describe('placeholder config', () => {
  it('ships examples without live credentials', async () => {
    const root = new URL('..', import.meta.url)
    const envExample = await readFile(new URL('.env.example', root), 'utf8')
    const jsonExample = await readFile(new URL('wecom.config.example.json', root), 'utf8')
    expect(envExample).toContain('WECOM_BOT_ID=your-bot-id')
    expect(envExample).toContain('WECOM_BOT_SECRET=your-bot-secret')
    expect(envExample).toContain('WECOM_BOT_TYPE=smart')
    expect(envExample).toContain('# WECOM_FORWARD_WEBHOOK_AUTH_VALUE=Bearer REPLACE_WITH_ROUTINE_KEY')
    expect(JSON.parse(jsonExample)).toMatchObject({ botType: 'smart' })
    expect(JSON.parse(jsonExample)).not.toHaveProperty('webhookUrl')
    const webhookExample = JSON.parse(await readFile(new URL('wecom.webhook.config.example.json', root), 'utf8'))
    await expect(loadWecomConfig({ cwd: await tempDir(), env: { WECOM_BOT_TYPE: webhookExample.botType, WECOM_GROUP_WEBHOOK_URL: webhookExample.groupWebhookUrl } })).resolves.toEqual(webhookExample)
    expect(jsonExample).not.toMatch(/sk-[A-Za-z0-9]/)
    expect(`${envExample}\n${jsonExample}`).not.toMatch(/corpsecret|ww[0-9a-f]{6,}/i)
  })
})

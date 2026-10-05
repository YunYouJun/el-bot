import { describe, expect, it } from 'vitest'
import { codexEnvironment } from './environment'

describe('codex child environment', () => {
  it('keeps platform settings and explicitly allowed provider credentials in isolated instances', () => {
    const source = { PATH: '/bin', HOME: '/home', HTTPS_PROXY: 'http://localhost:1234', CODEX_HOME: '/ambient', OPENAI_API_KEY: 'private', CUSTOM_TOKEN: 'custom', QQ_BOT_SECRET: 'bot-secret' }
    expect(codexEnvironment(source, { codexHome: '/isolated' })).toEqual({ PATH: '/bin', HOME: '/home', HTTPS_PROXY: 'http://localhost:1234', CODEX_HOME: '/isolated' })
    expect(codexEnvironment(source, { codexHome: '/isolated', envAllowlist: ['CUSTOM_TOKEN', 'QQ_BOT_SECRET'] })).toMatchObject({ CUSTOM_TOKEN: 'custom' })
    expect(codexEnvironment(source, { codexHome: '/isolated', envAllowlist: ['CUSTOM_TOKEN', 'QQ_BOT_SECRET'] })).not.toHaveProperty('QQ_BOT_SECRET')
    expect(codexEnvironment(source, {})).toMatchObject({ OPENAI_API_KEY: 'private' })
  })
})

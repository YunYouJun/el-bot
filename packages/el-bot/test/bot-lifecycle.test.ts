import type { NapcatMessage } from '../core/composition-api'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bot } from '../core/bot'
import { unsetCurrentInstance } from '../core/composition-api/lifecycle'
import answerPlugin from '../plugins/answer/index'

vi.mock('../node/server', () => ({ createServer: () => ({ close: vi.fn() }) }))
vi.mock('../core/utils/misc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/utils/misc')>()
  return { ...actual, statement: vi.fn() }
})

afterEach(() => {
  unsetCurrentInstance()
})

describe('bot command lifecycle', () => {
  it('reloads answer commands and hooks across stop/start without duplicate replies', async () => {
    const options = { list: [{ receivedText: ['ping'], reply: 'pong', help: '旧帮助' }] }
    const bot = new Bot({ bot: { name: '小云', autoloadPlugins: false, plugins: [answerPlugin(options)] } })
    vi.spyOn(bot.napcat, 'connect').mockResolvedValue()
    vi.spyOn(bot.napcat, 'disconnect').mockResolvedValue()
    vi.spyOn(bot.napcat, 'get_version_info').mockResolvedValue({
      app_name: 'NapCat.Onebot',
      app_version: '1',
      protocol_version: 'v11',
    })
    vi.spyOn(bot.napcat, 'get_login_info').mockResolvedValue({ user_id: 100, nickname: '小云' })
    // Starting a fake client should not install process-wide signal handlers.
    vi.spyOn(process, 'on').mockReturnValue(process)
    const reply = vi.spyOn(bot, 'reply').mockResolvedValue(undefined)
    bot.command('手动').action(() => '保留')
    const incoming = (content: string): NapcatMessage => ({
      message_type: 'private',
      self_id: 100,
      sender: { user_id: 200 },
      message_id: 1,
      raw_message: content,
      message: [{ type: 'text', data: { text: content } }],
    } as NapcatMessage)

    await bot.start()
    bot.napcat.emit('message', incoming('answer'))
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
    expect(reply).toHaveBeenLastCalledWith(expect.anything(), '回答列表：\n- 旧帮助')
    await bot.stop()
    reply.mockClear()
    bot.napcat.emit('message', incoming('answer'))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(reply).not.toHaveBeenCalled()

    options.list[0].help = '新帮助'
    await bot.start()
    expect(await bot.executeCommand('手动')).toEqual({ matched: true, result: '保留' })
    bot.napcat.emit('message', incoming('answer'))
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
    expect(reply).toHaveBeenLastCalledWith(expect.anything(), '回答列表：\n- 新帮助')
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(reply).toHaveBeenCalledTimes(1)
    reply.mockClear()
    bot.napcat.emit('message', incoming('ping'))
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
    expect(reply).toHaveBeenLastCalledWith(expect.anything(), 'pong')
    await bot.stop()
  })
})

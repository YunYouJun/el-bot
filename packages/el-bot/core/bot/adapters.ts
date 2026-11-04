import type { BotAdapter, MessageContext, MessageTarget } from '../adapter'

/** Own connection lifecycles and route sends by an explicit adapter identity. */
export class AdapterRegistry {
  private readonly adapters = new Map<string, BotAdapter>()
  private readonly running = new Set<BotAdapter>()
  private starting?: Promise<void>
  private stopping?: Promise<void>
  private generation = 0

  get size() {
    return this.adapters.size
  }

  register(adapter: BotAdapter) {
    if (this.starting || this.stopping || this.running.size)
      throw new Error('Register platform adapters before starting the bot')
    if (this.adapters.has(adapter.id))
      throw new Error(`Duplicate adapter: ${adapter.id}`)
    this.adapters.set(adapter.id, adapter)
  }

  start(dispatch: (message: MessageContext) => Promise<void>): Promise<void> {
    if (this.stopping)
      return this.stopping.then(() => this.start(dispatch))
    if (this.starting)
      return this.starting
    if (this.running.size)
      return Promise.resolve()
    const generation = ++this.generation
    this.starting = (async () => {
      try {
        for (const adapter of this.adapters.values()) {
          this.running.add(adapter)
          await adapter.start(async (message) => {
            if (generation === this.generation)
              await dispatch(message)
          })
        }
      }
      catch (error) {
        ++this.generation
        await this.stopRunning()
        throw error
      }
    })().finally(() => { this.starting = undefined })
    return this.starting
  }

  stop(): Promise<void> {
    if (this.stopping)
      return this.stopping
    ++this.generation
    this.stopping = (async () => {
      await this.starting?.catch(() => {})
      await this.stopRunning()
    })().finally(() => { this.stopping = undefined })
    return this.stopping
  }

  private async stopRunning() {
    const errors: unknown[] = []
    for (const adapter of [...this.running].reverse()) {
      try {
        await adapter.stop()
      }
      catch (error) {
        errors.push(error)
      }
      this.running.delete(adapter)
    }
    if (errors.length)
      throw new AggregateError(errors, 'Failed to stop platform adapters')
  }

  clear() {
    if (this.starting || this.stopping || this.running.size)
      throw new Error('Stop platform adapters before clearing registrations')
    this.adapters.clear()
  }

  async send(adapterId: string, target: MessageTarget, content: string) {
    const adapter = this.adapters.get(adapterId)
    if (!adapter || !this.running.has(adapter))
      throw new Error(`Adapter is not running: ${adapterId}`)
    if (!adapter.send)
      throw new Error('This adapter does not support proactive messages')
    return adapter.send(target, content)
  }
}

/** Coordinate startup and shutdown so cleanup never races unfinished initialization. */
export class RuntimeLifecycle {
  private ready!: () => void
  private startup = new Promise<void>((resolve) => { this.ready = resolve })
  private closing?: Promise<void>
  stopping = false

  constructor(private cleanup: () => Promise<void>) {}

  checkpoint() {
    if (this.stopping)
      throw new StartupCancelled()
  }

  started() { this.ready() }

  stop(): Promise<void> {
    this.stopping = true
    this.closing ??= this.startup.then(this.cleanup)
    return this.closing
  }
}

export class StartupCancelled extends Error {}

/** Always finish every cleanup step; report failures only after releasing resources. */
export async function cleanupAll(steps: (() => void | Promise<void>)[]): Promise<void> {
  const failures: unknown[] = []
  for (const step of steps) {
    try {
      await step()
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length)
    throw new AggregateError(failures, '部分关闭步骤失败，请查看本机日志。')
}

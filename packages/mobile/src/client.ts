export const name = 'el-bot-mobile-client'
export const inject = ['uiWorkspace', 'sessions']

interface SessionFace {
  getSnapshot: () => { openState: string }
  subscribe: (listener: () => void) => (() => void)
}
interface ClientContext {
  uiWorkspace: { openSession: (sessionId: string) => void }
  sessions: {
    binding: (id: string) => { session: SessionFace } | undefined
    list: { getSnapshot: () => { phase: string, byId: Record<string, { retainedBy?: { mainView?: number } }> }, subscribe: (listener: () => void) => (() => void) }
  }
  effect: (install: () => (() => void)) => unknown
}

/** A navigation hint only. Session identity never grants phone control. */
export function apply(ctx: ClientContext) {
  ctx.effect(() => {
    let opened: string | undefined
    let queued = false
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let observed: SessionFace | undefined
    let unobserve: (() => void) | undefined
    const reconcile = () => {
      queued = false
      if (!active)
        return
      const match = /^#yun-phone=([\w-]{1,128})$/.exec(window.location.hash)
      const snapshot = ctx.sessions.list.getSnapshot()
      const mains = Object.entries(snapshot.byId).filter(([, row]) => (row.retainedBy?.mainView ?? 0) > 0).map(([id]) => id)
      const current = mains.length === 1 ? ctx.sessions.binding(mains[0]!)?.session : undefined
      if (observed !== current) {
        unobserve?.()
        observed = current
        unobserve = current?.subscribe(navigate)
      }
      delete document.documentElement.dataset.yunPhoneSession
      if (!match || snapshot.phase !== 'ready' || !snapshot.byId[match[1]!])
        return
      // UI restoration follows the controller baseline. Wait for its initial
      // main reference, then navigate outside the synchronous retention publish.
      if (match[1] !== opened && current?.getSnapshot().openState === 'open') {
        opened = match[1]!
        ctx.uiWorkspace.openSession(match[1]!)
        navigate()
      }
      else if (mains.length === 1 && mains[0] === match[1] && current?.getSnapshot().openState === 'open') {
        // Proof of actual selected state, not an optimistic navigation marker.
        document.documentElement.dataset.yunPhoneSession = match[1]!
      }
    }
    function navigate() {
      if (queued || !active)
        return
      queued = true
      // Let reference.ready continuations and view teardown finish before
      // replacing the restored selection; do not retire a still-opening view.
      timer = setTimeout(reconcile, 0)
    }
    const unsubscribe = ctx.sessions.list.subscribe(navigate)
    window.addEventListener('hashchange', navigate)
    navigate()
    return () => {
      active = false
      if (timer !== undefined)
        clearTimeout(timer)
      unobserve?.()
      unsubscribe()
      window.removeEventListener('hashchange', navigate)
      delete document.documentElement.dataset.yunPhoneSession
    }
  })
}

// DSH 0.2.1 publishes its resolved palette on body and its scheme on html.
// Read computed values so custom themes and font overrides cross the iframe
// boundary without importing the host's React runtime or global stylesheets.
const hostProperties = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-settings-card-fill',
  '--dsw-alias-settings-card-stroke',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-link',
  '--dsw-font-family',
  '--ds-font-family-code',
  '--dsh-content-font-size',
  '--dsw-radius-sm',
  '--dsw-radius-md',
  '--dsw-radius-lg',
  '--dsw-focus-ring-width',
] as const

export function followHostTheme(): () => void {
  const root = document.documentElement
  const system = window.matchMedia('(prefers-color-scheme: dark)')
  let host: Window | undefined
  try {
    if (window.parent !== window && window.parent.document.body)
      host = window.parent
  }
  catch {
    // Standalone or cross-origin embeds use the system palette.
  }

  function sync() {
    const style = host?.getComputedStyle(host.document.body)
    const hosted = !!style?.getPropertyValue('--dsw-alias-bg-base').trim()
    const dark = hosted ? host!.document.body.hasAttribute('data-ds-dark-theme') : system.matches
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.themeSource = hosted ? 'host' : 'system'
    root.style.colorScheme = dark ? 'dark' : 'light'
    for (const name of hostProperties) {
      const value = hosted ? style!.getPropertyValue(name).trim() : ''
      if (value)
        root.style.setProperty(name, value)
      else
        root.style.removeProperty(name)
    }
  }

  let frame = 0
  function schedule() {
    if (!frame) {
      frame = window.requestAnimationFrame(() => {
        frame = 0
        sync()
      })
    }
  }
  const observer = new MutationObserver(schedule)
  if (host) {
    observer.observe(host.document.documentElement, { attributes: true })
    observer.observe(host.document.body, { attributes: true })
    // Theme plugins can also replace stylesheets instead of inline tokens.
    observer.observe(host.document.head, { childList: true, subtree: true, characterData: true, attributes: true })
    host.document.addEventListener('load', schedule, true)
  }
  system.addEventListener('change', schedule)
  sync()

  return () => {
    observer.disconnect()
    host?.document.removeEventListener('load', schedule, true)
    system.removeEventListener('change', schedule)
    window.cancelAnimationFrame(frame)
  }
}

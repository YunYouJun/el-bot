import { createElement } from 'react'

export const name = 'el-bot-dsh-personas-client'
export const inject = ['slots', 'layout']
const PANEL = 'el-bot-personas'
interface ClientContext {
  slots: { inject: (name: string, install: () => (() => void)) => (() => void), register: (options: Record<string, unknown>, component: () => unknown) => (() => void) }
  layout: { selectPanel: (id: string) => void }
  effect: (install: () => (() => void)) => unknown
}

function PersonaPage() {
  return createElement('iframe', { title: '人物卡管理', src: '/el-bot/personas/', style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' } })
}
function PersonaIcon() {
  return createElement('span', { 'aria-hidden': true }, '☁')
}

export function apply(ctx: ClientContext) {
  ctx.effect(() => {
    const main = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, PersonaPage))
    const sidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 12, label: '人物卡' }, PersonaIcon))
    const navigate = () => {
      if (window.location.hash === `#${PANEL}`)
        ctx.layout.selectPanel(PANEL)
    }
    window.addEventListener('hashchange', navigate)
    queueMicrotask(navigate)
    return () => {
      window.removeEventListener('hashchange', navigate)
      sidebar()
      main()
    }
  })
}

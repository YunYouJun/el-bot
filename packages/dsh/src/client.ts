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
function ManualPage() {
  return createElement('iframe', { title: '主人手动接管', src: '/el-bot/manual/', style: { border: 0, width: '100%', height: '100%', display: 'block' } })
}

export function apply(ctx: ClientContext) {
  ctx.effect(() => {
    const main = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, PersonaPage))
    const sidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 12, label: '人物卡' }, PersonaIcon))
    const manual = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'el-bot-manual' }, ManualPage))
    const manualSidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'el-bot-manual', order: 13, label: '手动接管' }, () => createElement('span', { 'aria-hidden': true }, '✎')))
    const navigate = () => {
      if (window.location.hash === `#${PANEL}`)
        ctx.layout.selectPanel(PANEL)
      if (window.location.hash === '#el-bot-manual')
        ctx.layout.selectPanel('el-bot-manual')
    }
    window.addEventListener('hashchange', navigate)
    queueMicrotask(navigate)
    return () => {
      window.removeEventListener('hashchange', navigate)
      sidebar()
      main()
      manualSidebar()
      manual()
    }
  })
}

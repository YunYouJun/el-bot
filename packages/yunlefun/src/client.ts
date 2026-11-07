import { createElement } from 'react'

export const name = 'el-bot-yunlefun-client'
export const inject = ['slots', 'layout']
const PANEL = 'el-bot-ai'
interface Context {
  slots: {
    inject: (name: string, install: () => (() => void)) => (() => void)
    register: (options: Record<string, unknown>, component: () => unknown) => (() => void)
  }
  layout: {
    selectPanel: (id: string) => void
  }
  effect: (install: () => (() => void)) => unknown
}
export function apply(ctx: Context) {
  ctx.effect(() => {
    const main = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, () => createElement('iframe', { title: '云乐坊 AI', src: '/el-bot/ai/', style: { border: 0, width: '100%', height: '100%', display: 'block' } })))
    const sidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 14, label: '云乐坊 AI' }, () => createElement('span', { 'aria-hidden': true }, '☁')))
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

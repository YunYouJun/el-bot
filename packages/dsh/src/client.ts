import { createElement, useEffect, useState } from 'react'

export const name = 'el-bot-dsh-personas-client'
export const inject = ['slots', 'layout']
const PANEL = 'el-bot-personas'
const MANUAL_PANEL = 'el-bot-manual'
const SCHEDULE_PANEL = 'el-bot-schedule'
type View = 'personas' | 'manual' | 'schedule'
const HASH_VIEWS: Record<string, View> = {
  [MANUAL_PANEL]: 'manual',
  [SCHEDULE_PANEL]: 'schedule',
}
const titles: Record<View, string> = {
  personas: '人物卡管理',
  manual: '主人手动接管',
  schedule: '定时群发',
}
let requestedView: View = HASH_VIEWS[window.location.hash.slice(1)] ?? 'personas'
const viewListeners = new Set<(view: View) => void>()

function requestView(view: View) {
  if (view === requestedView)
    return
  requestedView = view
  for (const listener of viewListeners)
    listener(view)
}

interface ClientContext {
  slots: { inject: (name: string, install: () => (() => void)) => (() => void), register: (options: Record<string, unknown>, component: (props: { size?: number }) => unknown) => (() => void) }
  layout: { selectPanel: (id: string) => void }
  effect: (install: () => (() => void)) => unknown
}

function BotIcon({ size = 16 }: { size?: number } = {}) {
  // The brand cloud is drawn on a 64px grid; fit it into a 16px icon.
  const cloud = 'M17.078261 49.295652A11.078261 11.078261 0 0 1 15.452343 27.259095A17.182609 17.182609 0 0 1 48.547657 27.259095A11.078261 11.078261 0 0 1 46.921739 49.295652Z'
  const eye = (x: number) => createElement('rect', { x, y: 31.5, width: 4.6, height: 6.2, rx: 2.3, fill: 'currentColor', stroke: 'none' })
  return createElement('svg', {
    'width': size,
    'height': size,
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'stroke': 'currentColor',
    'strokeLinejoin': 'round',
    'aria-hidden': true,
  }, createElement('g', { transform: 'translate(.12 .12) scale(.2462)', strokeWidth: 4.062 }, createElement('path', { d: cloud }), eye(24.37), eye(35.03)))
}

function BotPage() {
  const [view, setView] = useState<View>(requestedView)
  useEffect(() => {
    viewListeners.add(setView)
    return () => {
      viewListeners.delete(setView)
    }
  }, [])
  return createElement('iframe', {
    key: view,
    title: titles[view],
    src: view === 'personas' ? '/el-bot/personas/' : `/el-bot/personas/?view=${view}`,
    style: { border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' },
  })
}

export function apply(ctx: ClientContext) {
  ctx.effect(() => {
    const main = ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, BotPage))
    const sidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 12, label: '机器人' }, BotIcon))
    const navigate = () => {
      const hash = window.location.hash.slice(1)
      if (hash !== PANEL && !HASH_VIEWS[hash])
        return
      const view = HASH_VIEWS[hash]
      if (view)
        requestView(view)
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

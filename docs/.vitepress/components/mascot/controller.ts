import type {
  MascotController,
  MascotMotion,
  MascotOptions,
  MascotRig,
  MascotTheme,
} from './types'
import { projectEye } from './geometry'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEG = Math.PI / 180
let nextClipId = 0

interface ResolvedMotion {
  baseYaw: number
  basePitch: number
  yawRange: number
  pitchRange: number
  headX: number
  headY: number
  headRoll: number
  headRollLag: number
  squashX: number
  pivot: readonly [number, number]
  spring: { stiffness: number, damping: number }
  pointer: { x: number, y: number }
  blink: { interval: readonly [number, number], duration: number, closedScale: number }
  idle: {
    initial: readonly [number, number]
    interval: readonly [number, number]
    pause: readonly [number, number]
    reach: readonly [number, number]
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function format(value: number): string {
  return `${Number(value.toFixed(4))}`
}

function randomBetween(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0])
}

function resolveMotion(rig: MascotRig, motion: MascotMotion = {}): ResolvedMotion {
  const [, , width, height] = rig.viewBox
  return {
    baseYaw: motion.baseYaw ?? 7,
    basePitch: motion.basePitch ?? 4,
    yawRange: motion.yawRange ?? 31,
    pitchRange: motion.pitchRange ?? 11,
    headX: motion.headX ?? 0.015,
    headY: motion.headY ?? 0.011,
    headRoll: motion.headRoll ?? 2.8,
    headRollLag: motion.headRollLag ?? 1.2,
    squashX: motion.squashX ?? 0.065,
    pivot: motion.pivot ?? [
      rig.viewBox[0] + width / 2,
      rig.viewBox[1] + height * 0.63,
    ],
    spring: {
      stiffness: motion.spring?.stiffness ?? 520,
      damping: motion.spring?.damping ?? 32,
    },
    pointer: {
      x: motion.pointer?.x ?? 135,
      y: motion.pointer?.y ?? 100,
    },
    blink: {
      interval: motion.blink?.interval ?? [3600, 6800],
      duration: motion.blink?.duration ?? 120,
      closedScale: motion.blink?.closedScale ?? 0.12,
    },
    idle: {
      initial: motion.idle?.initial ?? [1800, 3000],
      interval: motion.idle?.interval ?? [2300, 3900],
      pause: motion.idle?.pause ?? [1500, 2400],
      reach: motion.idle?.reach ?? [0.35, 0.65],
    },
  }
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  document: Document,
  tag: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag)
}

function setTransition(element: SVGElement, value: string): void {
  element.style.setProperty('transition', value)
}

export function createMascot(root: HTMLElement, options: MascotOptions): MascotController {
  const { rig } = options
  const doc = root.ownerDocument
  const view = doc.defaultView ?? window
  const motion = resolveMotion(rig, rig.motion)
  const clickToBlink = options.clickToBlink ?? false
  const trackPointer = options.trackPointer ?? true
  const respectReducedMotion = options.respectReducedMotion ?? true
  const fallbackExpression = rig.defaultExpression && rig.expressions[rig.defaultExpression]
    ? rig.defaultExpression
    : Object.keys(rig.expressions)[0] ?? 'idle'
  let currentExpression = options.expression && rig.expressions[options.expression]
    ? options.expression
    : fallbackExpression

  let media: MediaQueryList | undefined
  let active = false
  let pointerPresent = false
  let frame = 0
  let previousTime = 0
  let x = 0
  let y = 0
  let gazeX = 0
  let gazeY = 0
  let gazeVelocityX = 0
  let gazeVelocityY = 0
  let targetX = 0
  let targetY = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let blinkTimer: ReturnType<typeof setTimeout> | undefined
  let openEyesTimer: ReturnType<typeof setTimeout> | undefined
  let idleLooks = 0
  let destroyed = false
  let currentTheme: MascotTheme = { ...options.theme }

  const clipId = `yun-mascot-clip-${rig.id.replace(/[^\w-]/g, '')}-${nextClipId++}`

  const svg = svgElement(doc, 'svg')
  svg.setAttribute('viewBox', rig.viewBox.join(' '))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('data-yun-mascot-svg', '')
  svg.style.setProperty('display', 'block')
  svg.style.setProperty('width', '100%')
  svg.style.setProperty('height', '100%')
  svg.style.setProperty('overflow', 'visible')
  svg.style.setProperty('pointer-events', 'none')

  if (!root.style.display)
    root.style.display = 'inline-block'
  if (!root.style.lineHeight)
    root.style.lineHeight = '0'
  root.style.aspectRatio = `${rig.viewBox[2]} / ${rig.viewBox[3]}`
  root.setAttribute('data-yun-mascot', rig.id)

  const defs = svgElement(doc, 'defs')
  const clip = svgElement(doc, 'clipPath')
  clip.setAttribute('id', clipId)
  const clipBody = svgElement(doc, 'path')
  clipBody.setAttribute('d', rig.body)
  clip.append(clipBody)
  defs.append(clip)

  const artwork = svgElement(doc, 'g')
  artwork.setAttribute('data-yun-mascot-artwork', '')
  if (rig.artworkTransform)
    artwork.setAttribute('transform', rig.artworkTransform)

  const head = svgElement(doc, 'g')
  head.setAttribute('data-yun-mascot-head', '')

  const body = svgElement(doc, 'path')
  body.setAttribute('d', rig.body)
  body.setAttribute('data-yun-mascot-body', '')
  body.setAttribute('class', 'yun-mascot__body')
  body.style.setProperty('fill', 'var(--mascot-body)')

  head.append(body)

  let blushGroup: SVGGElement | undefined
  if (rig.blush?.length) {
    blushGroup = svgElement(doc, 'g')
    blushGroup.setAttribute('data-yun-mascot-blush', '')
    blushGroup.setAttribute('class', 'yun-mascot__blush')
    blushGroup.style.setProperty('opacity', 'var(--mascot-blush-opacity, 0)')
    blushGroup.style.setProperty('transform', 'scale(var(--mascot-blush-scale, 0.78))')
    blushGroup.style.setProperty('transform-box', 'fill-box')
    blushGroup.style.setProperty('transform-origin', 'center')
    for (const mark of rig.blush) {
      const ellipse = svgElement(doc, 'ellipse')
      ellipse.setAttribute('cx', `${mark.cx}`)
      ellipse.setAttribute('cy', `${mark.cy}`)
      ellipse.setAttribute('rx', `${mark.rx}`)
      ellipse.setAttribute('ry', `${mark.ry}`)
      ellipse.setAttribute('class', 'yun-mascot__blush-mark')
      ellipse.style.setProperty('fill', 'var(--mascot-blush)')
      ellipse.style.setProperty('filter', 'blur(0.55px)')
      blushGroup.append(ellipse)
    }
    head.append(blushGroup)
  }

  const gaze = svgElement(doc, 'g')
  gaze.setAttribute('data-yun-mascot-gaze', '')
  gaze.setAttribute('class', 'yun-mascot__gaze')
  gaze.setAttribute('clip-path', `url(#${clipId})`)

  const eyeGroups: SVGGElement[] = []
  const eyeShapes: SVGPathElement[] = []
  for (const eye of rig.eyes) {
    const group = svgElement(doc, 'g')
    group.setAttribute('data-yun-mascot-eye', '')
    group.style.setProperty('opacity', '1')

    const local = svgElement(doc, 'g')
    local.setAttribute('transform', `translate(${format(-eye.center[0])} ${format(-eye.center[1])})`)

    const shape = svgElement(doc, 'path')
    shape.setAttribute('d', eye.path)
    shape.setAttribute('class', 'yun-mascot__eye-shape')
    shape.style.setProperty('fill', 'var(--mascot-eye)')
    shape.style.setProperty('transform-box', 'fill-box')
    shape.style.setProperty('transform-origin', 'center')
    shape.style.setProperty(
      'transform',
      'scaleY(calc(var(--mascot-blink, 1) * var(--mascot-squint, 1)))',
    )
    setTransition(shape, 'transform 75ms ease')

    local.append(shape)
    group.append(local)
    gaze.append(group)
    eyeGroups.push(group)
    eyeShapes.push(shape)
  }

  head.append(gaze)
  artwork.append(head)
  svg.append(defs, artwork)
  root.append(svg)

  function applyTheme(theme: MascotTheme): void {
    currentTheme = { ...currentTheme, ...theme }
    const resolved = { ...rig.theme, ...currentTheme }
    root.style.setProperty('--mascot-body', resolved.body)
    root.style.setProperty('--mascot-eye', resolved.eye)
    root.style.setProperty('--mascot-blush', resolved.blush)
    if (currentTheme.background)
      root.style.setProperty('--mascot-background', currentTheme.background)
    else
      root.style.removeProperty('--mascot-background')
  }

  function applyExpression(): void {
    const expression = rig.expressions[currentExpression] ?? {}
    const blush = clamp(expression.blush ?? 0, 0, 1)
    root.style.setProperty('--mascot-squint', `${expression.squint ?? 1}`)
    root.style.setProperty('--mascot-blush-opacity', `${blush}`)
    root.style.setProperty('--mascot-blush-scale', blush > 0 ? '1' : '0.78')
  }

  function applyMotionPreference(reduced: boolean): void {
    const eyeTransition = reduced ? 'none' : 'transform 75ms ease'
    for (const shape of eyeShapes)
      setTransition(shape, eyeTransition)
    if (blushGroup) {
      setTransition(
        blushGroup,
        reduced ? 'none' : 'opacity 260ms ease, transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      )
    }
    if (reduced)
      root.style.setProperty('--mascot-blink', '1')
  }

  function draw(): void {
    const yaw = (motion.baseYaw + gazeX * motion.yawRange) * DEG
    const pitch = (motion.basePitch - gazeY * motion.pitchRange) * DEG
    const [pivotX, pivotY] = motion.pivot
    const roll = gazeX * motion.headRoll + x * motion.headRollLag
    const headX = x * rig.viewBox[2] * motion.headX
    const headY = y * rig.viewBox[3] * motion.headY
    const scaleX = 1 - Math.abs(Math.sin(yaw)) * motion.squashX
    head.setAttribute(
      'transform',
      `translate(${format(headX)} ${format(headY)}) `
      + `translate(${format(pivotX)} ${format(pivotY)}) `
      + `rotate(${format(roll)}) scale(${format(scaleX)} 1) `
      + `translate(${format(-pivotX)} ${format(-pivotY)})`,
    )

    const sides = [-1, 1] as const
    for (let index = 0; index < sides.length; index++) {
      const eye = projectEye(rig, yaw, pitch, sides[index])
      const group = eyeGroups[index]
      if (!group)
        continue
      group.setAttribute(
        'transform',
        `matrix(${format(eye.a)} ${format(eye.b)} ${format(eye.c)} ${format(eye.d)} ${format(eye.x)} ${format(eye.y)})`,
      )
      group.style.setProperty('opacity', `${clamp((eye.depth - 0.02) / 0.1, 0, 1)}`)
      group.setAttribute('visibility', eye.depth > 0.02 ? 'visible' : 'hidden')
    }
  }

  function animate(time: number): void {
    const delta = previousTime ? Math.min(time - previousTime, 40) : 16
    previousTime = time
    const easing = 1 - Math.exp(-delta / 110)
    x += (targetX - x) * easing
    y += (targetY - y) * easing
    let remaining = delta / 1000
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120)
      gazeVelocityX += ((targetX - gazeX) * motion.spring.stiffness - gazeVelocityX * motion.spring.damping) * step
      gazeVelocityY += ((targetY - gazeY) * motion.spring.stiffness - gazeVelocityY * motion.spring.damping) * step
      gazeX = clamp(gazeX + gazeVelocityX * step, -1.1, 1.1)
      gazeY = clamp(gazeY + gazeVelocityY * step, -1.1, 1.1)
      remaining -= step
    }
    draw()
    const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < 0.002
      && Math.abs(targetX - gazeX) + Math.abs(targetY - gazeY) < 0.003
      && Math.abs(gazeVelocityX) + Math.abs(gazeVelocityY) < 0.003
    if (!settled) {
      frame = view.requestAnimationFrame(animate)
      return
    }
    frame = 0
    previousTime = 0
    gazeX = targetX
    gazeY = targetY
    gazeVelocityX = 0
    gazeVelocityY = 0
    draw()
  }

  function requestFrame(): void {
    if (!frame && !destroyed)
      frame = view.requestAnimationFrame(animate)
  }

  function reset(immediate = false): void {
    targetX = targetY = 0
    if (immediate) {
      view.cancelAnimationFrame(frame)
      frame = previousTime = x = y = gazeX = gazeY = gazeVelocityX = gazeVelocityY = 0
      draw()
      return
    }
    requestFrame()
  }

  function clearIdle(): void {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }

  function reducedMotion(): boolean {
    return respectReducedMotion && !!media?.matches
  }

  function scheduleIdle(delay = randomBetween(motion.idle.initial)): void {
    clearIdle()
    if (!active || reducedMotion() || pointerPresent)
      return
    idleTimer = setTimeout(() => {
      if (!active || reducedMotion() || pointerPresent)
        return
      const angle = Math.random() * Math.PI * 2
      const reach = randomBetween(motion.idle.reach)
      targetX = Math.cos(angle) * reach
      targetY = Math.sin(angle) * reach * 0.8
      requestFrame()
      idleLooks += 1
      scheduleIdle(randomBetween(idleLooks % 3 === 0
        ? [motion.idle.interval[1], motion.idle.interval[1] * 1.5]
        : motion.idle.interval))
    }, delay)
  }

  function track(event: PointerEvent): void {
    if (!active || reducedMotion() || !trackPointer || event.pointerType === 'touch')
      return
    const bounds = root.getBoundingClientRect()
    if (!bounds.width || !bounds.height)
      return
    pointerPresent = true
    idleLooks = 0
    clearIdle()
    targetX = Math.tanh((event.clientX - bounds.left - bounds.width / 2) / motion.pointer.x)
    targetY = Math.tanh((event.clientY - bounds.top - bounds.height / 2) / motion.pointer.y)
    requestFrame()
  }

  function lookAt(nextX: number, nextY: number): void {
    if (destroyed)
      return
    pointerPresent = true
    idleLooks = 0
    clearIdle()
    targetX = clamp(nextX, -1, 1)
    targetY = clamp(nextY, -1, 1)
    requestFrame()
  }

  function enter(event: PointerEvent): void {
    if (event.pointerType === 'touch')
      return
    pointerPresent = true
    idleLooks = 0
    clearIdle()
  }

  function leave(event: PointerEvent): void {
    if (event.relatedTarget)
      return
    pointerPresent = false
    idleLooks = 0
    reset(reducedMotion())
    scheduleIdle(randomBetween(motion.idle.pause))
  }

  function blink(): void {
    if (destroyed || reducedMotion())
      return
    clearTimeout(openEyesTimer)
    root.style.setProperty('--mascot-blink', `${motion.blink.closedScale}`)
    options.onBlink?.()
    openEyesTimer = setTimeout(() => {
      root.style.setProperty('--mascot-blink', '1')
    }, motion.blink.duration)
  }

  function scheduleBlink(): void {
    clearTimeout(blinkTimer)
    if (!active || reducedMotion())
      return
    blinkTimer = setTimeout(() => {
      blink()
      scheduleBlink()
    }, randomBetween(motion.blink.interval))
  }

  function pause(): void {
    active = false
    pointerPresent = false
    clearIdle()
    clearTimeout(blinkTimer)
    clearTimeout(openEyesTimer)
    root.style.setProperty('--mascot-blink', '1')
    reset(true)
  }

  function resume(): void {
    pause()
    active = !doc.hidden && doc.hasFocus()
    applyMotionPreference(reducedMotion())
    scheduleBlink()
    scheduleIdle()
  }

  function setExpression(expression: string): void {
    if (!rig.expressions[expression])
      return
    currentExpression = expression
    applyExpression()
  }

  function onVisibilityChange(): void {
    resume()
  }

  function onMotionChange(): void {
    resume()
  }

  function onClick(): void {
    blink()
  }

  applyTheme(options.theme ?? {})
  applyExpression()
  applyMotionPreference(false)
  draw()

  if (respectReducedMotion) {
    media = view.matchMedia('(prefers-reduced-motion: reduce)')
    media.addEventListener('change', onMotionChange)
  }

  if (trackPointer) {
    view.addEventListener('pointermove', track, { passive: true })
    view.addEventListener('pointerover', enter, { passive: true })
    view.addEventListener('pointerout', leave)
  }
  view.addEventListener('blur', pause)
  view.addEventListener('focus', resume)
  doc.addEventListener('visibilitychange', onVisibilityChange)
  if (clickToBlink)
    root.addEventListener('click', onClick)

  resume()

  return {
    root,
    svg,
    get expression() {
      return currentExpression
    },
    blink,
    lookAt,
    reset: () => reset(),
    setExpression,
    setTheme: applyTheme,
    destroy() {
      if (destroyed)
        return
      destroyed = true
      pause()
      if (trackPointer) {
        view.removeEventListener('pointermove', track)
        view.removeEventListener('pointerover', enter)
        view.removeEventListener('pointerout', leave)
      }
      view.removeEventListener('blur', pause)
      view.removeEventListener('focus', resume)
      doc.removeEventListener('visibilitychange', onVisibilityChange)
      root.removeEventListener('click', onClick)
      media?.removeEventListener('change', onMotionChange)
      svg.remove()
    },
  }
}

export interface MascotEye {
  path: string
  center: readonly [number, number]
}

export interface MascotBlushMark {
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface MascotExpression {
  squint?: number
  blush?: number
}

export interface MascotRigTheme {
  body: string
  eye: string
  blush: string
}

export interface MascotTheme extends Partial<MascotRigTheme> {
  background?: string
}

export interface MascotSpring {
  stiffness?: number
  damping?: number
}

export interface MascotMotion {
  baseYaw?: number
  basePitch?: number
  yawRange?: number
  pitchRange?: number
  headX?: number
  headY?: number
  headRoll?: number
  headRollLag?: number
  squashX?: number
  pivot?: readonly [number, number]
  spring?: MascotSpring
  pointer?: { x?: number, y?: number }
  blink?: {
    interval?: readonly [number, number]
    duration?: number
    closedScale?: number
  }
  idle?: {
    initial?: readonly [number, number]
    interval?: readonly [number, number]
    pause?: readonly [number, number]
    reach?: readonly [number, number]
  }
}

export interface MascotRig {
  id: string
  viewBox: readonly [number, number, number, number]
  body: string
  eyes: readonly [MascotEye, MascotEye]
  sphereRadius: number
  expressions: Record<string, MascotExpression>
  defaultExpression?: string
  theme: MascotRigTheme
  blush?: readonly MascotBlushMark[]
  artworkTransform?: string
  motion?: MascotMotion
}

export interface MascotOptions {
  rig: MascotRig
  expression?: string
  theme?: MascotTheme
  clickToBlink?: boolean
  respectReducedMotion?: boolean
  trackPointer?: boolean
  onBlink?: () => void
}

export interface MascotController {
  readonly root: HTMLElement
  readonly svg: SVGSVGElement
  readonly expression: string
  blink(): void
  lookAt(x: number, y: number): void
  reset(): void
  setExpression(expression: string): void
  setTheme(theme: MascotTheme): void
  destroy(): void
}

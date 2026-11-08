import type { MascotRig } from './types'

export const xiaoyunCloud: MascotRig = {
  id: 'xiaoyun-cloud',
  viewBox: [0, 0, 64, 64],
  body: 'M17.078261 49.295652A11.078261 11.078261 0 0 1 15.452343 27.259095A17.182609 17.182609 0 0 1 48.547657 27.259095A11.078261 11.078261 0 0 1 46.921739 49.295652Z',
  eyes: [
    {
      path: 'M24.72 31.87a1.95 1.95 0 0 1 3.9 0v5.46a1.95 1.95 0 0 1-3.9 0v-5.46Z',
      center: [26.67, 34.6],
    },
    {
      path: 'M35.38 31.87a1.95 1.95 0 0 1 3.9 0v5.46a1.95 1.95 0 0 1-3.9 0v-5.46Z',
      center: [37.33, 34.6],
    },
  ],
  sphereRadius: 19.2,
  blush: [
    { cx: 22.6, cy: 40.8, rx: 3.2, ry: 1.7 },
    { cx: 41.4, cy: 40.8, rx: 3.2, ry: 1.7 },
  ],
  artworkTransform: 'translate(32 32) scale(0.8861538461538462) translate(-32 -32)',
  expressions: {
    idle: {},
    thinking: { squint: 0.65 },
    happy: { squint: 0.5 },
    shy: { squint: 0.68, blush: 0.64 },
    error: { squint: 0.8 },
  },
  defaultExpression: 'idle',
  theme: {
    body: '#4B86C8',
    eye: '#FFFFFF',
    blush: '#FFB3C0',
  },
  motion: {
    baseYaw: 7,
    basePitch: 4,
    yawRange: 31,
    pitchRange: 11,
    headX: 0.015,
    headY: 0.011,
    headRoll: 2.8,
    headRollLag: 1.2,
    squashX: 0.065,
    spring: { stiffness: 520, damping: 32 },
    pointer: { x: 135, y: 100 },
    blink: {
      interval: [3600, 6800],
      duration: 120,
      closedScale: 0.12,
    },
    idle: {
      initial: [1800, 3000],
      interval: [2300, 3900],
      pause: [1500, 2400],
      reach: [0.35, 0.65],
    },
  },
}

import type { MascotRig } from './types'

export interface EyeProjection {
  x: number
  y: number
  a: number
  b: number
  c: number
  d: number
  depth: number
}

type Vec3 = [number, number, number]

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function spin(u: Vec3, v: Vec3, angle: number): [Vec3, Vec3] {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [
    [u[0] * cosine + v[0] * sine, u[1] * cosine + v[1] * sine, u[2] * cosine + v[2] * sine],
    [v[0] * cosine - u[0] * sine, v[1] * cosine - u[1] * sine, v[2] * cosine - u[2] * sine],
  ]
}

export function faceCenter(rig: MascotRig): readonly [number, number] {
  const [left, right] = rig.eyes
  return [
    (left.center[0] + right.center[0]) / 2,
    (left.center[1] + right.center[1]) / 2,
  ]
}

export function eyeSplit(rig: MascotRig): number {
  const [left, right] = rig.eyes
  const halfSpacing = Math.abs(right.center[0] - left.center[0]) / 2
  return Math.asin(clamp(halfSpacing / rig.sphereRadius, -1, 1))
}

export function projectEye(
  rig: MascotRig,
  yaw: number,
  pitch: number,
  side: -1 | 1,
): EyeProjection {
  const [centerX, centerY] = faceCenter(rig)
  let forward: Vec3 = [0, 0, 1]
  let right: Vec3 = [1, 0, 0]
  let down: Vec3 = [0, 1, 0]
  ;[forward, right] = spin(forward, right, yaw)
  ;[down, forward] = spin(down, forward, pitch)
  const [normal, tangentX] = spin(forward, right, eyeSplit(rig) * side)
  return {
    x: centerX + rig.sphereRadius * normal[0],
    y: centerY + rig.sphereRadius * normal[1],
    a: tangentX[0],
    b: tangentX[1],
    c: down[0],
    d: down[1],
    depth: normal[2],
  }
}

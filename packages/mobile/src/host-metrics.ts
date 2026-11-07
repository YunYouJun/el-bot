import type { RemoteHostStatus } from './types'
import { Buffer } from 'node:buffer'
import { open } from 'node:fs/promises'

const maximumBytes = 16 * 1024

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function integer(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function percent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function capacity(value: unknown) {
  const data = record(value)
  const { totalBytes, usedBytes, availableBytes, usagePercent } = data
  if (!integer(totalBytes, 1) || !integer(usedBytes) || !integer(availableBytes) || !percent(usagePercent)
    || usedBytes + availableBytes > totalBytes) {
    return
  }
  return { totalBytes, usedBytes, availableBytes, usagePercent }
}

/** Only project the bounded, versioned snapshot; never return arbitrary file contents. */
export async function readHostMetrics(path: string | undefined, now = Date.now()): Promise<RemoteHostStatus | undefined> {
  if (!path)
    return
  try {
    const file = await open(path, 'r')
    let data: Record<string, unknown>
    try {
      if (!(await file.stat()).isFile())
        return
      const bytes = Buffer.alloc(maximumBytes + 1)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
      if (bytesRead > maximumBytes)
        return
      data = record(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')))
    }
    finally { await file.close() }
    if (data.schemaVersion !== 1 || typeof data.sampledAt !== 'string' || typeof data.hostname !== 'string'
      || !data.hostname.trim() || data.hostname.length > 253 || !Array.isArray(data.disks) || data.disks.length < 1 || data.disks.length > 16) {
      return
    }
    const age = now - Date.parse(data.sampledAt)
    const cpu = record(data.cpu)
    const memory = capacity(data.memory)
    if (!Number.isFinite(age) || age < -5000 || !integer(cpu.count, 1) || !percent(cpu.usagePercent)
      || typeof cpu.sampleSeconds !== 'number' || !Number.isFinite(cpu.sampleSeconds)
      || cpu.sampleSeconds < 0.1 || cpu.sampleSeconds > 30 || !memory
      || memory.usedBytes + memory.availableBytes !== memory.totalBytes) {
      return
    }
    const disks: RemoteHostStatus['disks'] = []
    for (const item of data.disks) {
      const disk = record(item)
      const usage = capacity(disk)
      if (!usage || typeof disk.mountPoint !== 'string' || !disk.mountPoint.startsWith('/')
        || disk.mountPoint.length > 256 || /[\r\n\0]/.test(disk.mountPoint)
        || disks.some(row => row.mountPoint === disk.mountPoint)) {
        return
      }
      disks.push({ mountPoint: disk.mountPoint, ...usage })
    }
    return {
      sampledAt: data.sampledAt,
      stale: age > 60_000,
      hostname: data.hostname,
      cpu: { count: cpu.count, usagePercent: cpu.usagePercent, sampleSeconds: cpu.sampleSeconds },
      memory,
      disks,
    }
  }
  catch { return undefined }
}

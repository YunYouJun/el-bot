import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DshMobileHost } from './host'
import { readHostMetrics } from './host-metrics'

const now = Date.parse('2026-11-07T12:00:00.000Z')
function snapshot() {
  return {
    schemaVersion: 1,
    sampledAt: new Date(now).toISOString(),
    hostname: 'physical-host',
    cpu: { count: 2, usagePercent: 12.5, sampleSeconds: 1 },
    memory: { totalBytes: 4096, usedBytes: 1024, availableBytes: 3072, usagePercent: 25 },
    disks: [{ mountPoint: '/', totalBytes: 10000, usedBytes: 3000, availableBytes: 6000, usagePercent: 33.3 }],
  }
}

it('projects a host snapshot independently of container resources and preserves stale timestamps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-host-metrics-'))
  const path = join(directory, 'host.json')
  try {
    await writeFile(path, JSON.stringify({ ...snapshot(), secret: 'must-not-leak', cpu: { ...snapshot().cpu, private: 'must-not-leak' } }))
    const fresh = await readHostMetrics(path, now)
    expect(fresh).toEqual({
      sampledAt: snapshot().sampledAt,
      hostname: 'physical-host',
      stale: false,
      cpu: snapshot().cpu,
      memory: snapshot().memory,
      disks: snapshot().disks,
    })
    expect(JSON.stringify(fresh)).not.toContain('must-not-leak')
    expect((await readHostMetrics(path, now + 60_001))?.stale).toBe(true)
    expect((await readHostMetrics(path, now + 60_001))?.sampledAt).toBe(snapshot().sampledAt)
    await writeFile(path, JSON.stringify({ ...snapshot(), sampledAt: new Date().toISOString() }))
    const controller = Object.fromEntries(['list', 'create', 'modelCatalog', 'selectModel', 'prompt', 'follow', 'page'].map(name => [name, vi.fn()]))
    const host = new DshMobileHost(controller, { list: () => [], create: vi.fn() }, {
      publicBaseUrl: 'https://bot.test',
      hostMetricsFile: path,
    }, () => '')
    const status = await host.status()
    expect(status.host?.hostname).toBe('physical-host')
    expect(status.runtime?.nodeVersion).toBeTruthy()
    for (const method of Object.values(controller)) expect(method).not.toHaveBeenCalled()
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('omits unavailable or malformed metrics without failing the status API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-host-metrics-'))
  const path = join(directory, 'host.json')
  try {
    expect(await readHostMetrics(undefined, now)).toBeUndefined()
    expect(await readHostMetrics(path, now)).toBeUndefined()
    expect(await readHostMetrics(directory, now)).toBeUndefined()
    const data = snapshot()
    for (const invalid of [
      {},
      { ...data, schemaVersion: 2 },
      { ...data, sampledAt: 'invalid' },
      { ...data, sampledAt: new Date(now + 5001).toISOString() },
      { ...data, cpu: { ...data.cpu, usagePercent: 101 } },
      { ...data, cpu: { ...data.cpu, count: 0 } },
      { ...data, memory: { ...data.memory, usedBytes: 9999 } },
      { ...data, disks: [{ ...data.disks[0], availableBytes: -1 }] },
      { ...data, disks: [{ ...data.disks[0], mountPoint: '/\nprivate' }] },
      { ...data, disks: [data.disks[0], data.disks[0]] },
    ]) {
      await writeFile(path, JSON.stringify(invalid))
      expect(await readHostMetrics(path, now)).toBeUndefined()
    }
    for (const bytes of ['{"partial":', ' '.repeat(16 * 1024 + 1)]) {
      await writeFile(path, bytes)
      expect(await readHostMetrics(path, now)).toBeUndefined()
    }
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

import { describe, expect, it } from 'vitest'
import { hooks } from '../.pnpmfile.mjs'

describe('published manifest', () => {
  it('omits bundled private dependencies without changing the source manifest', () => {
    const manifest = {
      name: 'el-bot',
      version: '1.0.0',
      dependencies: { '@el-bot/commands': 'workspace:*', 'consola': 'catalog:' },
      devDependencies: { typescript: 'catalog:' },
    }
    const original = structuredClone(manifest)
    const packed = hooks.beforePacking(manifest)
    expect(packed.dependencies).toEqual({ consola: 'catalog:' })
    expect(packed).not.toHaveProperty('devDependencies')
    expect(manifest).toEqual(original)

    manifest.version = '1.0.1'
    expect(hooks.beforePacking(manifest).version).toBe('1.0.1')
    expect(manifest.version).toBe('1.0.1')
  })

  it('leaves unrelated workspace packages unchanged', () => {
    const manifest = { name: 'other', dependencies: { '@el-bot/commands': 'workspace:*' } }
    expect(hooks.beforePacking(manifest)).toBe(manifest)
  })
})

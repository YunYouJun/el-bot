import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
for (const language of ['en', 'zh-Hans']) {
  const canonical = await readFile(`${root}/apps/el-bot-client/locales/${language}.json`, 'utf8')
  const shared = await readFile(`${root}/packages/yun-apple/Sources/YunCore/Resources/${language}.json`, 'utf8')
  assert.equal(shared, canonical, `Sync ${language}.json into YunCore/Resources after changing the controller catalog`)
}
const project = await readFile(`${root}/apps/ios/project.yml`, 'utf8')
const { version } = JSON.parse(await readFile(`${root}/apps/el-bot-client/package.json`, 'utf8'))
assert.equal(project.match(/^\s*MARKETING_VERSION:\s*['"]?([\w.+-]+)['"]?\s*$/m)?.[1], version, 'Keep Apple and client versions in sync')
if (process.platform === 'darwin' && !process.argv.includes('--catalog-only')) {
  const commands = process.argv.includes('--test')
    ? [['test', '--package-path', 'packages/yun-apple'], ['test', '--package-path', 'apps/macos']]
    : [['build', '--package-path', 'apps/macos']]
  for (const args of commands) {
    const result = spawnSync('swift', args, { cwd: root, stdio: 'inherit' })
    if (result.error)
      throw result.error
    assert.equal(result.status, 0, 'Apple validation failed')
  }
}

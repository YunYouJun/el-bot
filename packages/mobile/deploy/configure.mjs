// Run inside the DSH container with its existing HOME, after mounting the package.
import { chmodSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const profile = join(process.env.HOME, '.dsh/profiles/cloud')
const manifestPath = join(profile, 'package.json')
const patchPath = join(profile, 'cordis.patch.yml')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const patch = readFileSync(patchPath, 'utf8')
if (patch.includes('id: el-bot-mobile'))
  throw new Error('Mobile configuration already exists; review it before changing it')
const backup = new Date().toISOString().replaceAll(/\D/g, '')
for (const path of [manifestPath, patchPath]) {
  copyFileSync(path, `${path}.before-mobile-${backup}`)
  chmodSync(`${path}.before-mobile-${backup}`, 0o600)
}
manifest.dependencies ??= {}
manifest.dependencies['@el-bot/mobile'] = 'file:/opt/dsh-runtime/node_modules/@el-bot/mobile'
manifest.dsh.profile.bundles.push('@el-bot/mobile')
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
writeFileSync(patchPath, `${patch}\n- id: el-bot-mobile\n  config:\n    publicBaseUrl: https://bot.yunle.fun\n    web:\n      enabled: true\n      port: 3082\n`, { mode: 0o600 })
process.stdout.write('Mobile bundle configured; existing settings retained; private backups created\n')

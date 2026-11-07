import { chmodSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
function value(name, fallback) {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const profile = value('--profile-directory', join(process.env.HOME, '.dsh/profiles/cloud'))
const publicOrigin = value('--public-origin', 'https://bot.yunle.fun')
const runtimeOrigin = value('--runtime-origin', 'https://ai-runtime-193029-4-1325586649.sh.run.tcloudbase.com')
if (!isAbsolute(profile))
  throw new Error('An absolute profile directory is required')
for (const origin of [publicOrigin, runtimeOrigin]) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin)
    throw new Error('Origins must be exact HTTPS origins')
}
const manifestPath = join(profile, 'package.json')
const patchPath = join(profile, 'cordis.patch.yml')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const patch = readFileSync(patchPath, 'utf8')
if (!Array.isArray(manifest.dsh?.profile?.bundles))
  throw new Error('The existing DSH bundle list is unavailable')
if (patch.includes('id: el-bot-yunlefun') || manifest.dsh.profile.bundles.includes('@el-bot/yunlefun'))
  throw new Error('YunLeFun is already configured; inspect the existing configuration')
const config = { profileDirectory: profile, publicOrigin, runtimeOrigin }
if (!args.includes('--apply')) {
  process.stdout.write(`${JSON.stringify({ dryRun: true, bundle: '@el-bot/yunlefun', config }, null, 2)}\n`)
  process.exit(0)
}
const stamp = new Date().toISOString().replaceAll(/\D/g, '')
for (const path of [manifestPath, patchPath]) {
  copyFileSync(path, `${path}.before-yunlefun-${stamp}`)
  chmodSync(`${path}.before-yunlefun-${stamp}`, 0o600)
}
manifest.dependencies ??= {}
manifest.dependencies['@el-bot/yunlefun'] = 'file:/opt/dsh-runtime/node_modules/@el-bot/yunlefun'
manifest.dsh.profile.bundles.push('@el-bot/yunlefun')
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
writeFileSync(patchPath, `${patch}\n- id: el-bot-yunlefun\n  config: ${JSON.stringify(config)}\n`, { mode: 0o600 })
process.stdout.write('YunLeFun bundle configured; existing model selections retained; private backups created\n')

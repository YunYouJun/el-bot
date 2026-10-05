import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'el-bot-cli-package-'))
const pnpm = process.env.npm_execpath
assert(pnpm, 'Run with pnpm test:cli')
const environment = { ...process.env }
environment.CI = 'true'
for (const key of Object.keys(environment)) {
  if (key.startsWith('QQ_BOT_') || key.startsWith('DOTENV_CONFIG_'))
    delete environment[key]
}
environment.QQ_BOT_APP_ID = 'package-smoke-app'
environment.QQ_BOT_SECRET = 'package-smoke-secret'
environment.HOME = join(temporary, 'home')
environment.USERPROFILE = environment.HOME

function run(command, args, cwd, success = true) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', timeout: 180000 })
  assert(!result.error, result.error?.message)
  const output = result.stdout + result.stderr
  assert(!output.includes('package-smoke-secret'), 'CLI leaked a credential')
  assert(success ? result.status === 0 : result.status !== 0, output)
  return output
}

try {
  const app = join(root, 'packages/el-bot')
  let archive = process.argv[2] ? resolve(process.argv[2]) : undefined
  if (!archive) {
    run(process.execPath, [pnpm, 'pack', '--pack-destination', temporary], app)
    const filename = (await readdir(temporary)).find(file => file.endsWith('.tgz'))
    if (filename)
      archive = join(temporary, filename)
  }
  assert(archive, 'No package archive produced')
  const consumer = join(temporary, 'consumer')
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  run(process.execPath, [pnpm, '--ignore-workspace', 'add', archive, '--ignore-scripts'], consumer)
  const installed = join(consumer, 'node_modules/el-bot')
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
  assert(!JSON.stringify(manifest.dependencies).match(/workspace:|catalog:/))
  assert(!manifest.dependencies['qq-sdk'])
  assert(!manifest.dependencies['@el-bot/codex'])
  assert(!manifest.dependencies['@el-bot/qq-codex'])
  assert.equal(manifest.bin['el-bot'], './dist/cli.mjs')
  assert.equal(manifest.bin.el, manifest.bin['el-bot'])
  assert.equal(manifest.imports['#qq-sdk'].default, './dist/qq-sdk.mjs')
  assert.equal(manifest.exports['.'].import, './dist/index.mjs')
  assert.equal(manifest.exports['.'].types, './dist/index.d.mts')
  assert.equal(manifest.exports['./nest'].import, './dist/nest.mjs')
  await writeFile(join(consumer, 'import.mjs'), `
    import assert from 'node:assert/strict'
    import { Bot, createBot, defineBotPlugin, defineConfig } from 'el-bot'
    import { ElBotModule, ElBotService } from 'el-bot/nest'
    for (const value of [Bot, createBot, defineBotPlugin, defineConfig, ElBotModule, ElBotService])
      assert.equal(typeof value, 'function')
    assert.equal(defineConfig({ debug: true }).debug, true)
  `)
  run(process.execPath, ['import.mjs'], consumer)
  run(process.execPath, [pnpm, '--ignore-workspace', 'add', '--save-dev', `typescript@${manifest.devDependencies.typescript}`, `@types/node@${manifest.devDependencies['@types/node']}`, '--ignore-scripts'], consumer)
  await writeFile(join(consumer, 'consumer.ts'), `
    import { createBot, defineConfig, type Bot } from 'el-bot'
    import { ElBotModule, ElBotService } from 'el-bot/nest'
    const config = defineConfig({ debug: true })
    const create: (options?: Parameters<typeof createBot>[0]) => Promise<Bot> = createBot
    void [config, create, ElBotModule, ElBotService]
  `)
  run(process.execPath, [join(consumer, 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--module', 'NodeNext', '--target', 'ES2022', '--types', 'node', 'consumer.ts'], consumer)
  run(process.execPath, ['--input-type=module', '-e', 'import("./node_modules/el-bot/dist/qq-sdk.mjs").then(sdk => { if (typeof sdk.createQQApi !== "function") process.exit(1) })'], consumer)
  const cli = join(installed, 'dist/cli.mjs')
  const help = run(process.execPath, [cli, '--help'], consumer)
  assert(help.includes('codex'))
  assert(help.includes('dev'))
  const codexHelp = run(process.execPath, [cli, 'codex', '--help'], consumer)
  assert(codexHelp.includes('el-bot codex'))
  for (const command of ['init', 'check', 'start', 'paths', 'recover', 'api', 'desktop-init', 'desktop-check', 'render']) assert(codexHelp.includes(command))
  assert(codexHelp.includes('--profile'))
  assert(run(process.execPath, [cli, 'codex', 'init', '--help'], consumer).includes('--project'))
  assert(run(process.execPath, [cli, 'codex', 'check', '--help'], consumer).includes('--json'))
  assert(run(process.execPath, [cli, 'codex', 'api', '--help'], consumer).includes('--experimental'))
  assert(run(process.execPath, [cli, 'codex', 'desktop-init', '--help'], consumer).includes('--thread-id'))
  const preview = join(temporary, 'card.png')
  run(process.execPath, [cli, 'codex', 'render', '--card', 'result', '--theme', 'dark', '--output', preview], consumer)
  const png = await readFile(preview)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 720)
  run(process.execPath, [cli, 'codex', 'render', '--output', preview], consumer, false)
  assert.deepEqual(await readFile(preview), png)
  assert(run(process.execPath, [cli, 'dev', '--help'], consumer).includes('--port'))
  const legacyError = run(process.execPath, [cli, '--legacy-invalid-option'], consumer, false)
  assert(/Unknown arguments?: legacy-invalid-option/.test(legacyError), legacyError)
  assert(run(process.execPath, [cli, '--version'], consumer).includes(manifest.version))
  assert(run(process.execPath, [pnpm, 'exec', 'el-bot', '--version'], consumer).includes(manifest.version))
  assert(run(process.execPath, [pnpm, 'exec', 'el', 'codex', '--help'], consumer).includes('el-bot codex'))
  const paths = ['--config', join(temporary, 'config.json'), '--credentials', join(temporary, 'credentials.env'), '--state', join(temporary, 'state.json')]
  run(process.execPath, [pnpm, 'exec', 'el-bot', 'codex', 'init', '--no-prompt', '--project', consumer, '--name', 'consumer', ...paths], consumer)
  const config = JSON.parse(await readFile(join(temporary, 'config.json'), 'utf8'))
  assert.equal(config.defaultProject, 'consumer')
  assert(run(process.execPath, [cli, 'codex', 'paths', ...paths], consumer).includes('credentials.env'))
  assert(run(process.execPath, [cli, 'codex', ...paths, 'paths'], consumer).includes('credentials.env'))
  run(process.execPath, [cli, 'codex', 'init', '--no-prompt', ...paths], consumer, false)
  run(process.execPath, [cli, 'codex', 'check', '--qq', '--all', ...paths], consumer, false)
  run(process.execPath, [cli, 'codex', '--check', '--check-qq', ...paths], consumer, false)
  run(process.execPath, [cli, 'codex', 'start', '--check', ...paths], consumer, false)
  run(process.execPath, [cli, 'codex', 'unknown-command'], consumer, false)
  run(process.execPath, [cli, 'codex', 'check', '--config', join(temporary, 'missing.json')], consumer, false)
  const diagnostic = JSON.parse(run(process.execPath, [cli, 'codex', 'check', '--all', '--json', '--config', join(temporary, 'missing.json')], consumer, false))
  assert.equal(diagnostic.ok, false)
  assert.equal(diagnostic.checks[0].id, 'config')
  assert.equal(diagnostic.checks[0].status, 'fail')
  const isolatedPaths = JSON.parse(run(process.execPath, [cli, 'codex', '--profile', 'package-smoke', 'paths'], consumer))
  run(process.execPath, [cli, 'codex', '--profile', 'package-smoke', 'init', '--no-prompt', '--project', consumer], consumer)
  assert.equal(JSON.parse(await readFile(isolatedPaths.config, 'utf8')).codexHome, isolatedPaths.codexHome)
  await writeFile(isolatedPaths.state, JSON.stringify({ version: 1, owner: 'smoke-owner', project: 'consumer', threads: { consumer: { id: 'old', cwd: consumer } }, seen: ['keep'], tasks: [{ id: 'keep-result', project: 'consumer', status: 'completed', output: 'keep', createdAt: 'now' }] }))
  run(process.execPath, [cli, 'codex', '--profile', 'package-smoke', 'recover', '--project', 'consumer'], consumer)
  const recovered = JSON.parse(await readFile(isolatedPaths.state, 'utf8'))
  assert.equal(recovered.owner, 'smoke-owner')
  assert.equal(recovered.tasks[0].output, 'keep')
  assert.deepEqual(recovered.seen, ['keep'])
  assert.deepEqual(recovered.threads, {})
  assert.equal(recovered.instance.appId, 'package-smoke-app')
  const backups = (await readdir(resolve(isolatedPaths.state, '..'))).filter(file => file.includes('before-recover'))
  assert.equal(backups.length, 1)
  assert.equal(JSON.parse(await readFile(join(resolve(isolatedPaths.state, '..'), backups[0]), 'utf8')).threads.consumer.id, 'old')
  const snapshot = await readFile(isolatedPaths.state, 'utf8')
  const profileArgs = [cli, 'codex', '--profile', 'package-smoke']
  run(process.execPath, [...profileArgs, 'recover', '--project', 'unknown'], consumer, false)
  await writeFile(`${isolatedPaths.state}.lock`, '0')
  run(process.execPath, [...profileArgs, 'recover'], consumer, false)
  await rm(`${isolatedPaths.state}.lock`)
  assert.equal(await readFile(isolatedPaths.state, 'utf8'), snapshot)
  await writeFile(isolatedPaths.envFile, 'QQ_BOT_APP_ID="another-app"\nQQ_BOT_SECRET="package-smoke-secret"\n')
  run(process.execPath, [...profileArgs, 'recover'], consumer, false)
  run(process.execPath, [...profileArgs, 'check', '--qq'], consumer, false)
  assert.equal(await readFile(isolatedPaths.state, 'utf8'), snapshot)
  run(process.execPath, [cli, 'codex', '--profile', '../bad', 'paths'], consumer, false)
  run(process.execPath, [cli, 'codex', 'desktop-check', ...paths], consumer, false)
  console.log('Packed package: framework and Nest imports, CLI installation, JSON diagnostics, setup, recovery and credential redaction passed.')
}
finally {
  await rm(temporary, { recursive: true, force: true })
}

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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
    import { fileURLToPath } from 'node:url'
    import { Bot, Command, Plugins, answerPlugin, createBot, defineBotPlugin, defineConfig, getAllPluginsFromDir } from 'el-bot'
    import { ElBotModule, ElBotService } from 'el-bot/nest'
    for (const value of [Bot, Command, createBot, defineBotPlugin, defineConfig, ElBotModule, ElBotService])
      assert.equal(typeof value, 'function')
    assert.equal(defineConfig({ debug: true }).debug, true)
    const bot = Object.create(Bot.prototype)
    bot._command = new Command(bot)
    bot.reply = () => { throw new Error('Programmatic execution must not send to QQ') }
    bot.command('echo').description('Echo arguments').usage('echo <text>').example('echo hello')
      .action(async (args, context) => {
        assert.equal(context.bot, bot)
        assert.equal(context.source, 'programmatic')
        return args.join(' ')
      })
    assert.deepEqual(await bot.executeCommand('echo hello'), { matched: true, result: 'hello' })
    assert.deepEqual(await bot.executeCommand('missing'), { matched: false })
    assert(bot.getCommandHelp('echo').includes('echo <text>'))
    await answerPlugin({ list: [{ receivedText: ['ping'], reply: 'pong', help: 'ping → pong' }] }).setup(bot)
    assert.deepEqual(await bot.executeCommand('answer'), { matched: true, result: '回答列表：\\n- ping → pong' })
    assert(bot.getCommandHelp().includes('answer'))
    const fixture = new URL('./plugins/', import.meta.url)
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(fixture)
    await writeFile(new URL('01-failed.mjs', fixture), 'export default { setup() { throw new Error("expected setup failure") } }')
    await writeFile(new URL('space%20%23%20name.mjs', fixture), 'export default { setup(bot) { bot.command("loaded").action(() => "ready") } }')
    const plugins = await getAllPluginsFromDir(fileURLToPath(fixture))
    assert.equal(plugins.length, 2)
    assert.equal(plugins[1].pkg.name, 'space # name')
    bot.el = { bot: { plugins } }
    await new Plugins(bot).loadConfig()
    assert.deepEqual(await bot.executeCommand('loaded'), { matched: true, result: 'ready' })
    assert.deepEqual(await getAllPluginsFromDir(fileURLToPath(new URL('./missing/', import.meta.url))), [])
  `)
  run(process.execPath, ['import.mjs'], consumer)
  const template = join(root, 'packages/create-app/template-ts')
  const templateManifest = JSON.parse(await readFile(join(template, 'package.json'), 'utf8'))
  run(process.execPath, [pnpm, '--ignore-workspace', 'add', '--save-dev', `typescript@${manifest.devDependencies.typescript}`, `@types/node@${manifest.devDependencies['@types/node']}`, `tsx@${templateManifest.devDependencies.tsx}`, '--ignore-scripts'], consumer)
  await cp(template, join(consumer, 'template'), { recursive: true })
  run(process.execPath, [join(consumer, 'node_modules/typescript/bin/tsc'), '--project', 'template/tsconfig.json'], consumer)
  await writeFile(join(consumer, 'template-check.ts'), `
    import assert from 'node:assert/strict'
    import { fileURLToPath } from 'node:url'
    import { Bot, Command, getAllPluginsFromDir } from 'el-bot'
    const bot = Object.create(Bot.prototype) as Bot
    bot._command = new Command(bot)
    const plugins = await getAllPluginsFromDir(fileURLToPath(new URL('./template/plugins/', import.meta.url)))
    assert.equal(plugins.length, 1)
    await plugins[0].setup(bot)
    assert.deepEqual(await bot.executeCommand('test'), { matched: true, result: 'Link Start!' })
    assert(bot.getCommandHelp('test').includes('用法：test'))
  `)
  run(process.execPath, ['--import', 'tsx', 'template-check.ts'], consumer)
  await writeFile(join(consumer, 'consumer.ts'), `
    import { createBot, defineBotPlugin, defineConfig, onPrivateFriendMessage, onPrivateGroupMessage, onPrivateMessage, type Bot, type BotPlugin, type CommandContext, type CommandExecution } from 'el-bot'
    import { ElBotModule, ElBotService } from 'el-bot/nest'
    const config = defineConfig({ debug: true })
    const create: (options?: Parameters<typeof createBot>[0]) => Promise<Bot> = createBot
    function commandConsumer(bot: Bot) {
      bot.command('echo').description('Echo').usage('echo <text>').example('echo hello')
        .action(async (args: string[], context: CommandContext) => {
          if (context.source === 'message') await context.reply(args.join(' '))
          return args.join(' ')
        })
      const execution: Promise<CommandExecution> = bot.executeCommand('echo hello')
      const help: string = bot.getCommandHelp('echo')
      return { execution, help }
    }
    function pluginConsumer() {
      const plugin: BotPlugin = defineBotPlugin({ setup() {} })
      const factory: (options: { prefix: string }) => BotPlugin = defineBotPlugin<{ prefix: string }>(options => ({ pkg: { name: options.prefix }, setup() {} }))
      onPrivateFriendMessage(message => { const type: 'friend' = message.sub_type; void type })
      onPrivateGroupMessage(message => { const type: 'group' = message.sub_type; void type })
      onPrivateMessage(message => { const type: 'friend' | 'group' = message.sub_type; void type })
      return { plugin, factory }
    }
    void [config, create, commandConsumer, pluginConsumer, ElBotModule, ElBotService]
  `)
  run(process.execPath, [join(consumer, 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--module', 'NodeNext', '--target', 'ES2022', '--types', 'node', 'consumer.ts'], consumer)
  run(process.execPath, ['--input-type=module', '-e', 'import("./node_modules/el-bot/dist/qq-sdk.mjs").then(sdk => { if (typeof sdk.createQQApi !== "function") process.exit(1) })'], consumer)
  const cli = join(installed, 'dist/cli.mjs')
  const help = run(process.execPath, [cli, '--help'], consumer)
  assert(help.includes('codex'))
  assert(help.includes('dev'))
  const codexHelp = run(process.execPath, [cli, 'codex', '--help'], consumer)
  assert(codexHelp.includes('el-bot codex'))
  for (const command of ['init', 'check', 'start', 'status', 'stop', 'restart', 'logs', 'preferences', 'paths', 'recover', 'api', 'desktop-init', 'desktop-check', 'render']) assert(codexHelp.includes(command))
  assert(codexHelp.includes('--profile'))
  assert(run(process.execPath, [cli, 'codex', 'init', '--help'], consumer).includes('--project'))
  assert(run(process.execPath, [cli, 'codex', 'check', '--help'], consumer).includes('--json'))
  assert(run(process.execPath, [cli, 'codex', 'api', '--help'], consumer).includes('--experimental'))
  assert(run(process.execPath, [cli, 'codex', 'desktop-init', '--help'], consumer).includes('--thread-id'))
  const controlState = join(temporary, 'control-state.json')
  const controlArgs = ['--state', controlState, '--json']
  assert.equal(JSON.parse(run(process.execPath, [cli, 'codex', 'status', ...controlArgs], consumer)).result.phase, 'stopped')
  assert.equal(JSON.parse(run(process.execPath, [cli, 'codex', 'stop', ...controlArgs], consumer)).result.phase, 'stopped')
  assert.equal(JSON.parse(run(process.execPath, [cli, 'codex', 'start', ...controlArgs], consumer, false)).ok, false)
  await writeFile(`${controlState}.lock`, '99999999', { mode: 0o600 })
  assert.equal(JSON.parse(run(process.execPath, [cli, 'codex', 'status', ...controlArgs], consumer)).result.phase, 'unmanaged')
  assert.equal(JSON.parse(run(process.execPath, [cli, 'codex', 'stop', '--interrupt', ...controlArgs], consumer, false)).ok, false)
  assert.equal(await readFile(`${controlState}.lock`, 'utf8'), '99999999')
  const preview = join(temporary, 'card.png')
  run(process.execPath, [cli, 'codex', 'render', '--card', 'result', '--theme', 'dark', '--output', preview], consumer)
  const png = await readFile(preview)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 720)
  run(process.execPath, [cli, 'codex', 'render', '--output', preview], consumer, false)
  assert.deepEqual(await readFile(preview), png)
  const helpPreview = join(temporary, 'help-part.png')
  run(process.execPath, [cli, 'codex', 'render', '--card', 'help', '--page', '1', '--part', '2', '--output', helpPreview], consumer)
  const helpPng = await readFile(helpPreview)
  assert.equal(helpPng.subarray(1, 4).toString(), 'PNG')
  assert.equal(helpPng.readUInt32BE(16), 720)
  assert(helpPng.readUInt32BE(20) <= 1100)
  const invalidPreview = join(temporary, 'invalid-part.png')
  assert(run(process.execPath, [cli, 'codex', 'render', '--card', 'help', '--part', '99', '--output', invalidPreview], consumer, false).includes('卡片页码无效'))
  assert(run(process.execPath, [cli, 'codex', 'render', '--part', '2', '--output', invalidPreview], consumer, false).includes('--part 仅用于 help'))
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
  const preferences = JSON.parse(run(process.execPath, [cli, 'codex', 'preferences', '--json', ...paths], consumer))
  assert.deepEqual(preferences.result, { messageFormat: config.messageFormat, imageTheme: 'light', restartRequired: false })
  const imagePreferences = JSON.parse(run(process.execPath, [cli, 'codex', 'preferences', '--message-format', 'image', '--image-theme', 'dark', '--json', ...paths], consumer))
  assert.deepEqual(imagePreferences.result, { messageFormat: 'image', imageTheme: 'dark', restartRequired: false })
  assert.deepEqual(JSON.parse(await readFile(join(temporary, 'config.json'), 'utf8')), { ...config, messageFormat: 'image', image: { ...config.image, theme: 'dark' } })
  const textPreferences = JSON.parse(run(process.execPath, [cli, 'codex', 'preferences', '--message-format', 'text', '--json', ...paths], consumer))
  assert.equal(textPreferences.result.messageFormat, 'text')
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
  console.log('Packed package: framework and Nest imports, plugin loading and TypeScript starter, CLI installation, JSON diagnostics, setup, recovery and credential redaction passed.')
}
finally {
  await rm(temporary, { recursive: true, force: true })
}

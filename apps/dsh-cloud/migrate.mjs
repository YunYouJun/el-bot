import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

// Keep the original home path inside the container: log bytes, cwd identities,
// workspace membership and fork ancestry can then move without rewriting history.
const sourceHome = homedir()
const output = resolve(process.argv[2] ?? '.el-bot/dsh-cloud-staging')
if (existsSync(output))
  throw new Error('Migration destination already exists; choose a fresh snapshot directory')
const sourceProfile = join(sourceHome, '.dsh/profiles/desktop')
const require = createRequire(join(sourceProfile, 'package.json'))
const yaml = require('yaml')

const options = { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }], logLevel: 'silent' }
const patch = yaml.parse(readFileSync(join(sourceProfile, 'cordis.patch.yml'), 'utf8'), options)
const official = patch.find(row => row.id === 'im-qqbot')
const tokenlink = patch.find(row => row.id === 'llm-pi-ai')?.config?.providers?.tokenlink
const credentials = yaml.parse(readFileSync(join(sourceHome, '.dsh/.credentials.yaml'), 'utf8'))
const key = credentials.refs?.TOKENLINK_API_KEY
const deepseekKey = credentials.refs?.DEEPSEEK_API_KEY
if (!official?.config?.appId || !official.config.appSecret || !tokenlink || typeof key !== 'string' || typeof deepseekKey !== 'string')
  throw new Error('Bound QQ bot, TokenLink and DeepSeek credentials are required')
const access = official.config.access
if (access?.c2cMode !== 'allowlist' || access.c2cAllow?.length !== 1)
  throw new Error('Cloud QQ security requires exactly one authenticated private-chat owner')
const cloudAccess = { ...access, groupMode: 'open' }
delete cloudAccess.groupAllow

const home = join(output, 'home')
const dsh = join(home, '.dsh')
const cloudProfile = join(dsh, 'profiles/cloud')
function privateWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, value, { mode: 0o600 })
}
mkdirSync(home, { recursive: true, mode: 0o700 })
for (const name of ['sessions', 'ungrouped']) {
  const source = join(sourceHome, '.dsh', name)
  if (existsSync(source)) {
    cpSync(source, join(dsh, name), {
      recursive: true,
      filter: path => !path.endsWith('/session.lock'),
    })
  }
}
const workspaceFile = join(sourceHome, '.dsh/storages/workspace.json')
mkdirSync(join(dsh, 'storages'), { recursive: true, mode: 0o700 })
cpSync(workspaceFile, join(dsh, 'storages/workspace.json'), { recursive: true })
const projectionCache = join(sourceHome, '.dsh/storages/session_projcache')
if (existsSync(projectionCache))
  cpSync(projectionCache, join(dsh, 'storages/session_projcache'), { recursive: true })
const workspaceStorage = JSON.parse(readFileSync(workspaceFile, 'utf8'))
for (const workspace of Object.values(workspaceStorage.tables.workspaces)) {
  if (workspace.path?.startsWith(`${sourceHome}/`))
    mkdirSync(join(home, workspace.path.slice(sourceHome.length + 1)), { recursive: true, mode: 0o700 })
}
for (const name of ['workspace', 'workspaces']) {
  const source = join(sourceHome, '.dsh-qqbot', name)
  if (existsSync(source))
    cpSync(source, join(home, '.dsh-qqbot', name), { recursive: true })
}
cpSync(join(sourceHome, '.dsh-qqbot/model-prefs.json'), join(home, '.dsh-qqbot/model-prefs.json'))
privateWrite(join(dsh, '.credentials.yaml'), yaml.stringify({ version: credentials.version, records: {}, refs: { TOKENLINK_API_KEY: key, DEEPSEEK_API_KEY: deepseekKey } }))
const deepseek = {
  ...tokenlink,
  displayName: 'DeepSeek API',
  baseURL: 'https://api.deepseek.com',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  models: [{ ...tokenlink.models[0], id: 'deepseek-flash', name: 'DeepSeek Flash' }],
}
const cloudPatch = [
  { id: 'llm-pi-ai', config: { providers: { tokenlink, 'deepseek-api': deepseek } } },
  { id: 'agent-default-model', config: { provider: 'deepseek-api', model: 'deepseek-flash' } },
  ...patch.filter(row => ['ui-settings-general', 'ui-chat', 'ui-settings', 'ui-settings-account'].includes(row.id)),
  { ...official, disabled: false, inject: ['qqWorkspaceGrouping', 'qqRuntimeHealth', 'qqRuntimeSecurity'], config: {
    ...official.config,
    requireMention: true,
    access: cloudAccess,
  } },
  { insert: [{
    id: 'el-bot-qq-workspaces',
    name: '@el-bot/dsh/qq-workspaces',
    config: {
      appId: official.config.appId,
      profileDirectory: join(sourceHome, '.dsh/profiles/cloud'),
      privateTitle: '小云 Bot · 私聊',
      groupTitle: '小云 Bot · 群聊',
    },
  }, {
    id: 'el-bot-cloud-health',
    name: 'file:///opt/dsh-runtime/health.mjs',
    config: { appId: official.config.appId },
  }, {
    id: 'el-bot-qq-security',
    name: '@el-bot/dsh/qq-security',
    config: {
      appId: official.config.appId,
      ownerOpenId: access.c2cAllow[0],
      profileDirectory: join(sourceHome, '.dsh/profiles/cloud'),
    },
  }, {
    id: 'el-bot-cloud-cutover',
    name: 'file:///opt/dsh-runtime/cutover.mjs',
    config: { provider: 'deepseek-api', model: 'deepseek-flash' },
  }] },
  { id: 'el-bot-personas', config: { profileDirectory: join(sourceHome, '.dsh/profiles/cloud'), title: '小云 Bot' } },
]
privateWrite(join(cloudProfile, 'cordis.patch.yml'), yaml.stringify(cloudPatch))
privateWrite(join(cloudProfile, 'package.json'), `${JSON.stringify({
  name: 'el-bot-dsh-cloud-profile',
  private: true,
  dependencies: { '@tencent-connect/dsh-qqbot': '0.5.5', '@el-bot/dsh': 'file:/opt/el-bot-dsh' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@tencent-connect/dsh-qqbot', '@el-bot/dsh'] } },
}, null, 2)}\n`)
privateWrite(join(output, '.env'), `DSH_USER_HOME=${sourceHome}\n`)
function countLogs(path) {
  return readdirSync(path, { withFileTypes: true }).reduce((count, entry) => {
    const file = join(path, entry.name)
    return count + (entry.isDirectory() ? countLogs(file) : entry.name.endsWith('.zstd') ? 1 : 0)
  }, 0)
}
process.stdout.write(`${JSON.stringify({ output, appId: official.config.appId, sessionLogs: countLogs(join(dsh, 'sessions')), workspaceCount: Object.keys(workspaceStorage.tables.workspaces).length, homePathRetained: sourceHome, receiverEnabled: true, cloudModel: 'deepseek-api/deepseek-flash' })}\n`)

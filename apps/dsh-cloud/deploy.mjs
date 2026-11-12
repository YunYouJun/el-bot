import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const app = dirname(fileURLToPath(import.meta.url))
const source = join(app, '../../packages/dsh')
const [mode = 'deploy', ...rest] = process.argv.slice(2)
const allowed = ['deploy', 'status', 'rollback', '--stage']
const host = process.env.DSH_DEPLOY_HOST ?? 'el-bot-dsh-deploy'

function invoke(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error)
    throw result.error
  return result.status ?? 1
}

function ssh(args, input = 'ignore') {
  return invoke('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', host, ...args], { stdio: [input, 'inherit', 'inherit'] })
}

function build(stage) {
  const out = join(stage, 'dsh')
  const dist = join(out, 'dist')
  mkdirSync(dist, { recursive: true })
  for (const file of ['package.json', 'cordis.patch.yml'])
    copyFileSync(join(source, file), join(out, file))
  for (const args of [
    ['tsdown', '--out-dir', dist],
    ['tsdown', '--config', 'tsdown.client.config.ts', '--out-dir', dist],
    ['vite', 'build', '--config', 'vite.config.ts', '--outDir', join(dist, 'web')],
  ]) {
    if (invoke('pnpm', ['exec', ...args], { cwd: source }))
      throw new Error(`${args[0]} build failed`)
  }
  const smoke = ['qq-smoke.mjs', 'group-chat-smoke.mjs']
  for (const file of smoke)
    copyFileSync(join(app, file), join(stage, file))
  const archive = join(stage, 'dsh.tar.gz')
  const archiveScript = `
import gzip, pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1])
with open(sys.argv[2], 'wb') as output:
    with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.PAX_FORMAT) as tar:
            paths = [*(root / 'dsh').rglob('*'), *(root / name for name in sys.argv[3:])]
            for path in sorted(paths):
                if path.is_dir():
                    continue
                if path.is_symlink() or not path.is_file():
                    raise ValueError('unexpected build artifact')
                info = tarfile.TarInfo(path.relative_to(root).as_posix())
                info.mode = 0o644
                info.size = path.stat().st_size
                with path.open('rb') as contents:
                    tar.addfile(info, contents)
`
  if (invoke('python3', ['-c', archiveScript, stage, archive, ...smoke]))
    throw new Error('Could not package the complete DSH build')
  return archive
}

try {
  if (rest.length || !allowed.includes(mode) || !/^[a-z0-9][\w.-]{0,63}$/i.test(host))
    throw new Error('Usage: pnpm dsh:deploy [status|rollback|--stage]; DSH_DEPLOY_HOST is an SSH alias')
  if (mode === 'status' || mode === 'rollback') {
    process.exitCode = ssh([mode])
  }
  else {
    const connected = ssh(['status'])
    if (connected) {
      process.exitCode = connected
    }
    else {
      const stage = mkdtempSync(join(tmpdir(), 'el-bot-dsh-release-'))
      try {
        const archive = build(stage)
        const sha = createHash('sha256').update(readFileSync(archive)).digest('hex')
        const fd = openSync(archive, 'r')
        try {
          process.exitCode = ssh([mode === '--stage' ? 'stage' : 'deploy', sha], fd)
        }
        finally { closeSync(fd) }
      }
      finally { rmSync(stage, { recursive: true, force: true }) }
    }
  }
}
catch (error) {
  console.error(error instanceof Error ? error.message : 'DSH deployment failed')
  process.exitCode = 1
}

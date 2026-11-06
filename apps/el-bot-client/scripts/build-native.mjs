import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { appDirectory, run } from './nsh.mjs'

const args = process.argv.slice(2)
const platformIndex = args.indexOf('--platform')
const target = platformIndex < 0 ? process.platform : args[platformIndex + 1]
if (args.includes('--nsh')) {
  run(process.execPath, ['scripts/build-nsh.mjs', ...args.filter(arg => arg !== '--nsh')])
}
else if (process.platform === 'darwin' && (target === 'darwin' || target.startsWith('darwin/') || ['ios', 'ios-simulator'].includes(target))) {
  run(process.execPath, ['../../scripts/build-apple.mjs', ...args])
}
else if (platformIndex >= 0) {
  throw new Error('Active app development targets macOS and iOS. Use nsh:build for the retained cross-platform preview.')
}
else {
  // Workspace builds still verify the portable controller on non-Apple CI hosts.
  const output = join(appDirectory, 'build/controller')
  await mkdir(output, { recursive: true })
  run('go', ['build', '-trimpath', '-o', join(output, `yun-controller${process.platform === 'win32' ? '.exe' : ''}`), '.'])
  console.log('Built the headless controller. Apple app bundles require macOS and Xcode.')
}

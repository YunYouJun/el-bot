import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const directory = `${root}/resources/darwin`
  mkdirSync(directory, { recursive: true })
  const run = (args) => {
    const result = spawnSync('xcrun', args, { stdio: 'inherit' })
    if (result.error)
      throw result.error
    if (result.status !== 0)
      throw new Error(`Native macOS build failed (${result.status})`)
  }
  const slices = ['arm64', 'x86_64'].map(arch => `${directory}/libYunBotNative-${arch}.dylib`)
  try {
    for (const [index, arch] of ['arm64', 'x86_64'].entries())
      run(['swiftc', '-swift-version', '5', '-parse-as-library', '-emit-library', '-O', '-target', `${arch}-apple-macosx13.0`, '-module-name', 'YunBotNative', '-Xlinker', '-install_name', '-Xlinker', '@rpath/libYunBotNative.dylib', `${root}/macos/YunBotNative.swift`, '-o', slices[index]])
    run(['lipo', '-create', ...slices, '-output', `${directory}/libYunBotNative.dylib`])
  }
  finally {
    for (const slice of slices)
      rmSync(slice, { force: true })
  }
}

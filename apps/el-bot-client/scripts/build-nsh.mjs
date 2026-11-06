import assert from 'node:assert/strict'
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { appDirectory, ensureNsh, run } from './nsh.mjs'

const args = process.argv.slice(2)
const config = JSON.parse(await readFile(join(appDirectory, 'nsh.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'))
assert.equal(config.version, manifest.version, 'Client versions must match')
const nsh = await ensureNsh()
const targets = { darwin: 'macos', win32: 'windows', linux: 'linux' }
const architecture = process.arch === 'x64' ? 'amd64' : process.arch
const hostTarget = `${process.platform === 'win32' ? 'windows' : process.platform}/${architecture}`
const platformIndex = args.indexOf('--platform')
const requested = platformIndex < 0 ? hostTarget : args[platformIndex + 1]
const mobile = ['ios', 'ios-simulator', 'android', 'web'].includes(requested)

if (mobile) {
  // Mobile/Web bundles have no desktop executable, filesystem or command grant.
  run(nsh, ['package', '--target', requested, '--out', `build/${requested}`, ...args.filter((_, index) => index !== platformIndex && index !== platformIndex + 1)])
}
else {
  assert.equal(requested, hostTarget, 'Build desktop installers on their target OS and architecture')
  const target = targets[process.platform]
  assert(target, `Unsupported desktop platform ${process.platform}`)
  const debug = args.includes('--dev')
  const output = join(appDirectory, 'build', hostTarget.replace('/', '-'))
  const runtime = join(appDirectory, '.nsh/runtime')
  await mkdir(join(runtime, target), { recursive: true })
  run('cargo', ['build', '--locked', '--manifest-path', 'native/Cargo.toml', ...(debug ? [] : ['--release'])], {
    env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '14.0' },
  })
  const runner = join(appDirectory, `native/target/${debug ? 'debug' : 'release'}/Yun${process.platform === 'win32' ? '.exe' : ''}`)
  await copyFile(runner, join(runtime, target, `nsh-${target}-app${process.platform === 'win32' ? '.exe' : ''}`))
  // Do not leave a previous product beside the current package.
  await rm(output, { recursive: true, force: true })
  run(nsh, ['package', '--target', target, '--out', output], { env: { ...process.env, NSH_RUNTIME: runtime } })
  const application = join(output, process.platform === 'darwin' ? 'Yun.app' : 'Yun')
  const resources = process.platform === 'darwin' ? join(application, 'Contents/Resources/nsh') : join(application, 'nsh')
  await mkdir(resources, { recursive: true })
  run('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', join(resources, `yun-controller${process.platform === 'win32' ? '.exe' : ''}`), '.'])

  if (process.platform === 'darwin') {
    const bundleResources = join(application, 'Contents/Resources')
    await copyFile(join(appDirectory, 'icons/icon.icns'), join(bundleResources, 'icon.icns'))
    const compiled = join(appDirectory, '.nsh/icon')
    await mkdir(compiled, { recursive: true })
    run('xcrun', ['actool', 'icons/ElBot.icon', '--compile', compiled, '--output-format', 'human-readable-text', '--platform', 'macosx', '--target-device', 'mac', '--minimum-deployment-target', '14.0', '--app-icon', 'ElBot', '--output-partial-info-plist', join(compiled, 'partial.plist')])
    await copyFile(join(compiled, 'Assets.car'), join(bundleResources, 'Assets.car'))
    const plist = join(application, 'Contents/Info.plist')
    for (const [key, value] of Object.entries({ CFBundleIconName: 'ElBot', CFBundleIconFile: 'icon.icns', LSMinimumSystemVersion: '14.0' }))
      run('plutil', ['-replace', key, '-string', value, plist])
    for (const [tag, name] of [['en', 'Yun'], ['zh-Hans', '小云']]) {
      const directory = join(bundleResources, `${tag}.lproj`)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'InfoPlist.strings'), `"CFBundleDisplayName" = "${name}";\n"CFBundleName" = "${name}";\n`)
    }
    run('codesign', ['--force', '--deep', '--sign', '-', application])
    run('codesign', ['--verify', '--deep', '--strict', application])
    if (!args.includes('--skip-dmg')) {
      const stage = await mkdtemp(join(tmpdir(), 'yun-dmg-'))
      try {
        await cp(application, join(stage, 'Yun.app'), { recursive: true })
        await symlink('/Applications', join(stage, 'Applications'))
        run('hdiutil', ['create', '-volname', 'Yun', '-srcfolder', stage, '-ov', '-format', 'UDZO', join(output, `yun-bot_${config.version}_${architecture}.dmg`)])
      }
      finally { await rm(stage, { recursive: true, force: true }) }
    }
    if (args.includes('--run'))
      run('open', ['-n', application, '--args', '--replace'])
  }
  else if (process.platform === 'win32') {
    // Recreate the portable archive after adding the controller.
    for (const name of await readdir(output)) {
      if (name.endsWith('.zip'))
        await rm(join(output, name))
    }
    run('tar', ['-a', '-cf', join(output, `yun-bot_${config.version}_${architecture}.zip`), '-C', output, 'Yun'])
    if (!args.includes('--skip-installer')) {
      const installer = join(output, 'installer.nsi')
      const escape = value => value.replaceAll('$', '$$').replaceAll('"', '$\\"')
      await writeFile(installer, `Unicode True\nName "Yun"\nOutFile "${escape(join(output, `yun-bot-setup-${config.version}-${architecture}.exe`))}"\nInstallDir "$LOCALAPPDATA\\Programs\\Yun"\nRequestExecutionLevel user\nPage directory\nPage instfiles\nSection\nSetOutPath "$INSTDIR"\nFile /r "${escape(application)}\\*"\nCreateShortcut "$SMPROGRAMS\\Yun.lnk" "$INSTDIR\\Yun.exe"\nWriteUninstaller "$INSTDIR\\Uninstall.exe"\nSectionEnd\nSection "Uninstall"\nDelete "$SMPROGRAMS\\Yun.lnk"\nRMDir /r "$INSTDIR"\nSectionEnd\n`)
      run(process.env.NSIS_MAKENSIS || 'makensis', ['/V2', installer])
    }
    if (args.includes('--run'))
      run(join(application, 'Yun.exe'), ['--replace'])
  }
  else {
    // nsh writes its archive before our sidecar is present.
    for (const name of await readdir(output)) {
      if (name.endsWith('.tar.gz'))
        await rm(join(output, name))
    }
    run('tar', ['-czf', join(output, `yun-bot_${config.version}_${architecture}.tar.gz`), '-C', output, 'Yun'])
    if (!args.includes('--skip-installer')) {
      const stage = join(appDirectory, '.nsh/debian')
      await rm(stage, { recursive: true, force: true })
      await mkdir(join(stage, 'DEBIAN'), { recursive: true })
      await cp(application, join(stage, 'opt/yun'), { recursive: true })
      await writeFile(join(stage, 'DEBIAN/control'), `Package: yun-bot\nVersion: ${config.version}\nArchitecture: ${architecture}\nMaintainer: YunLeFun\nDescription: Yun cloud assistant\nDepends: libgtk-4-1 (>= 4.14)\n`)
      run('dpkg-deb', ['--build', stage, join(output, `yun-bot_${config.version}_${architecture}.deb`)])
    }
  }
  console.log(`Built nsh client: ${application}`)
}

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
assert.equal(process.platform, 'darwin', 'Build Apple apps on macOS with Xcode')
const client = join(root, 'apps/el-bot-client')
const { version } = JSON.parse(await readFile(join(client, 'package.json'), 'utf8'))
function run(command, values, options = {}) {
  const result = spawnSync(command, values, { cwd: root, stdio: 'inherit', ...options })
  if (result.error)
    throw result.error
  assert.equal(result.status, 0, `${command} failed`)
}
run(process.execPath, ['scripts/check-apple.mjs', '--catalog-only'])
const index = args.indexOf('--platform')
const target = index >= 0 ? args[index + 1] : `darwin/${process.arch === 'x64' ? 'amd64' : process.arch}`
const configuration = args.includes('--release') ? 'Release' : 'Debug'
if (target === 'ios-simulator' || target === 'ios') {
  const simulator = target === 'ios-simulator'
  run('xcodebuild', ['-project', 'apps/ios/Yun.xcodeproj', '-scheme', 'Yun', '-configuration', configuration, '-sdk', simulator ? 'iphonesimulator' : 'iphoneos', '-destination', `generic/platform=${simulator ? 'iOS Simulator' : 'iOS'}`, '-derivedDataPath', 'apps/ios/build', ...(simulator ? ['CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=NO'] : ['CODE_SIGNING_ALLOWED=NO']), 'build'])
  console.log(`Built native iOS app: apps/ios/build/Build/Products/${configuration}-${simulator ? 'iphonesimulator' : 'iphoneos'}/Yun.app`)
}
else {
  const architecture = process.arch === 'x64' ? 'amd64' : process.arch
  assert.equal(target, `darwin/${architecture}`, 'Build macOS installers on the target architecture')
  const mode = configuration.toLowerCase()
  run('swift', ['build', '--package-path', 'apps/macos', '-c', mode])
  const bin = spawnSync('swift', ['build', '--package-path', 'apps/macos', '-c', mode, '--show-bin-path'], { cwd: root, encoding: 'utf8' })
  assert.equal(bin.status, 0)
  const output = join(root, 'apps/macos/build', `darwin-${architecture}`)
  const application = join(output, 'Yun.app')
  const contents = join(application, 'Contents')
  const resources = join(contents, 'Resources')
  await rm(application, { recursive: true, force: true })
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await mkdir(resources, { recursive: true })
  await copyFile(join(bin.stdout.trim(), 'Yun'), join(contents, 'MacOS/Yun'))
  await cp(join(bin.stdout.trim(), 'YunApple_YunCore.bundle'), join(resources, 'YunApple_YunCore.bundle'), { recursive: true })
  run('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', join(resources, 'yun-controller'), '.'], { cwd: client })
  run('xcrun', ['actool', join(client, 'icons/ElBot.icon'), '--compile', resources, '--output-format', 'human-readable-text', '--platform', 'macosx', '--target-device', 'mac', '--minimum-deployment-target', '14.0', '--app-icon', 'ElBot', '--output-partial-info-plist', join(output, 'icon.plist')])
  await copyFile(join(client, 'icons/icon.icns'), join(resources, 'icon.icns'))
  await copyFile(join(client, 'icons/tray-icon.png'), join(resources, 'tray-icon.png'))
  const plist = {
    CFBundleExecutable: 'Yun',
    CFBundleIdentifier: 'cn.elpsy.elbot.client',
    CFBundleName: 'Yun',
    CFBundleDisplayName: 'Yun',
    CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: version,
    CFBundleVersion: version,
    CFBundleIconName: 'ElBot',
    CFBundleIconFile: 'icon.icns',
    LSMinimumSystemVersion: '14.0',
    CFBundleDevelopmentRegion: 'en',
    CFBundleLocalizations: ['en', 'zh-Hans'],
    NSHighResolutionCapable: true,
    NSPrincipalClass: 'NSApplication',
  }
  const info = join(contents, 'Info.plist')
  await writeFile(info, JSON.stringify(plist))
  run('plutil', ['-convert', 'xml1', info])
  for (const [tag, name] of [['en', 'Yun'], ['zh-Hans', '小云']]) {
    const directory = join(resources, `${tag}.lproj`)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'InfoPlist.strings'), `"CFBundleDisplayName" = "${name}";\n"CFBundleName" = "${name}";\n`)
  }
  run('codesign', ['--force', '--deep', '--sign', '-', application])
  run('codesign', ['--verify', '--deep', '--strict', application])
  run(process.execPath, ['apps/el-bot-client/scripts/check-macos-icon.mjs', application])
  if (!args.includes('--skip-dmg')) {
    const stage = await mkdtemp(join(tmpdir(), 'yun-native-dmg-'))
    try {
      await cp(application, join(stage, 'Yun.app'), { recursive: true })
      await symlink('/Applications', join(stage, 'Applications'))
      run('hdiutil', ['create', '-volname', 'Yun', '-srcfolder', stage, '-ov', '-format', 'UDZO', join(output, `yun-bot_${version}_${architecture}.dmg`)])
    }
    finally { await rm(stage, { recursive: true, force: true }) }
  }
  if (args.includes('--run'))
    run('open', [application])
  console.log(`Built native macOS app: ${application}`)
}

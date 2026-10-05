#!/usr/bin/env node
/* eslint-disable no-console */

import { exec } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import enquirer from 'enquirer'
import fs from 'fs-extra'
import c from 'picocolors'

const argv = process.argv.slice(2)

const cwd = process.cwd()
const { prompt } = enquirer
const templateUrl = 'https://github.com/elpsycn/el-bot-template'

const TEMPLATES = [
  {
    name: 'ts',
    message: c.blue('TypeScript'),
  },
  {
    name: 'js',
    message: c.yellow('JavaScript'),
  },
]

const renameFiles: Record<string, string> = {
  _gitignore: '.gitignore',
}

async function init() {
  let targetDir = argv[0]
  const answers = await prompt<{
    type: 'ts' | 'js'
    name: string
  }>([
    {
      type: 'select',
      name: 'type',
      message: '模版类型:',
      choices: TEMPLATES,
    },
    {
      type: 'input',
      name: 'name',
      message: '文件夹名:',
      initial: 'el-bot-template',
    },
  ])
  targetDir = answers.name

  const root = path.join(cwd, targetDir)
  console.log(`生成模版至 ${root} ...`)

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }
  else {
    const existing = fs.readdirSync(root)
    if (existing.length) {
      /**
       * @type {{ yes: boolean }}
       */
      const { yes } = await prompt<{
        yes: boolean
      }>({
        type: 'confirm',
        name: 'yes',
        initial: 'Y',
        message: `目标文件夹 ${targetDir} 不为空，移除已存在的文件并继续?`,
      })
      if (yes)
        emptyDir(root)
      else
        return
    }
  }

  switch (answers.type) {
    case 'js':
      console.log(`Clonging ${targetDir} ...`)
      exec(`git clone ${templateUrl} ${targetDir}`)
      break
    case 'ts':
      generateTemplate()
      break
    default:
      break
  }

  async function generateTemplate() {
    const templateDir = fileURLToPath(new URL(`../template-${answers.type}`, import.meta.url))
    const write = (file: string, content?: string) => {
      const targetPath = renameFiles[file]
        ? path.join(root, renameFiles[file])
        : path.join(root, file)
      if (content)
        fs.writeFileSync(targetPath, content)
      else
        copy(path.join(templateDir, file), targetPath)
    }

    const files = fs.readdirSync(templateDir)
    for (const file of files.filter(f => f !== 'package.json'))
      write(file)

    // 替换 package.json name
    const pkg = fs.readJsonSync(path.join(templateDir, 'package.json'))
    pkg.name = path.basename(root)
    write('package.json', JSON.stringify(pkg, null, 2))
  }

  console.log('\nDone. Now run:\n')
  if (root !== cwd)
    console.log(`  cd ${path.relative(cwd, root)}`)

  console.log('  pnpm install')
  console.log('  pnpm dev')
  console.log()
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src)
  if (stat.isDirectory())
    copyDir(src, dest)
  else
    fs.copyFileSync(src, dest)
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    const destFile = path.resolve(destDir, file)
    copy(srcFile, destFile)
  }
}

function emptyDir(dir: string) {
  if (!fs.existsSync(dir))
    return

  for (const file of fs.readdirSync(dir)) {
    const abs = path.resolve(dir, file)
    // baseline is Node 12 so can't use rmSync :(
    if (fs.lstatSync(abs).isDirectory()) {
      emptyDir(abs)
      fs.rmSync(abs)
    }
    else {
      fs.unlinkSync(abs)
    }
  }
}

init().catch((e) => {
  console.error(e)
})

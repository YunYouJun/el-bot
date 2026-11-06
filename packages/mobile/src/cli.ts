#!/usr/bin/env node
import { request } from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
import { profileDirectory } from './index'

const args = process.argv.slice(2)
let profile = 'cloud'
const index = args.indexOf('--profile')
if (index >= 0) {
  profile = args[index + 1] ?? ''
  args.splice(index, 2)
}
const [operation = '--help', id] = args
if (operation === '--help') {
  process.stdout.write('yun-bot-mobile [--profile cloud] --pair | --devices | --revoke <device-id>\n')
}
else {
  const socketPath = join(profileDirectory(profile), 'el-bot-mobile/admin.sock')
  const path = operation === '--pair' ? '/pair' : operation === '--devices' ? '/devices' : operation === '--revoke' && /^[a-f0-9-]{36}$/.test(id ?? '') ? `/devices/${id}` : undefined
  if (!path)
    throw new Error('Invalid mobile administration command')
  const method = operation === '--pair' ? 'POST' : operation === '--revoke' ? 'DELETE' : 'GET'
  const result = await new Promise<string>((resolve, reject) => {
    const req = request({ socketPath, path, method, timeout: 5000 }, (res) => {
      let value = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        value += chunk
      })
      res.on('end', () => res.statusCode === 200 ? resolve(value) : reject(new Error('Mobile administration failed')))
    })
    req.on('timeout', () => req.destroy(new Error('Mobile administration timed out')))
    req.on('error', reject)
    req.end()
  })
  process.stdout.write(`${result}\n`)
}

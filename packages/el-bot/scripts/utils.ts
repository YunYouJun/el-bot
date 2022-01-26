import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function getAllPlugins() {
  const plugins = fs.readdirSync(path.resolve(__dirname, '../src/plugins'))
  return plugins
}

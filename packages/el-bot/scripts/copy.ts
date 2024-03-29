import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

import { getAllPlugins } from './utils'

const plugins = getAllPlugins()

const __dirname = dirname(fileURLToPath(import.meta.url))

plugins.map((item) => {
  const source = path.resolve(__dirname, '../src/plugins/', item, 'package.json')
  const dest = path.resolve(__dirname, '../dist/plugins', item, 'package.json')
  fs.copyFileSync(source, dest)
})

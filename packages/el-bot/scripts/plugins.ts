import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

import { getAllPlugins } from './utils'

const plugins = getAllPlugins()

const __dirname = dirname(fileURLToPath(import.meta.url))

// 批量设置 type = module
plugins.map((item) => {
  const source = path.resolve(__dirname, '../src/plugins/', item, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(source, 'utf-8'))
  delete pkg.type
  console.log(pkg)
  pkg.exports = {
    '.': {
      require: './index.js',
      import: './index.mjs',
    },
  }
  fs.writeFileSync(source, JSON.stringify(pkg, null, 2))
})

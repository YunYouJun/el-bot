import fs from 'fs'
import path from 'path'

// 拷贝内置 plugins package.json

const plugins = fs.readdirSync(path.resolve(__dirname, '../src/plugins'))

plugins.map((item) => {
  fs.copyFileSync(path.resolve(__dirname, '../src/plugins/', item, 'package.json'), path.resolve(__dirname, '../dist/plugins', item, 'package.json'))
})

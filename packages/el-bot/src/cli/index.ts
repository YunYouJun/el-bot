#!/usr/bin/env node

import { spawn } from 'child_process'
import commander from 'commander'
import registerInstallCommand from './install'
import registerStartCommand from './start'

const pkg = require('../../package.json')
const cli = new commander.Command('el')
cli.version(pkg.version)

registerInstallCommand(cli)
registerStartCommand(cli)

// default
cli
  .command('bot')
  .description('等价于 el start bot')
  .action(() => {
    spawn('el', ['start', 'bot'], { stdio: 'inherit' })
  })

cli.parse()

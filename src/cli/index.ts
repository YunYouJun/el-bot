#!/usr/bin/env node

import registerInstallCommand from "./install";
import registerStartCommand from "./start";
import CAC from "cac";
// import registerRunCommand from "./run";

import { spawn } from "child_process";

const { version } = require("../../package");
const cli = CAC("el");
cli.help();
cli.version(version);

registerInstallCommand(cli);
registerStartCommand(cli);
// registerRunCommand(cli);

// default
cli
  // Simply omit the command name, just brackets
  .command('[command]', '不存在该命令时，等价于 el start [command]')
  .action((command) => {
    spawn('el', ['start', command], { stdio: 'inherit' });
  });

cli.parse();

#!/usr/bin/env node

import registerInstallCommand from "./install";
import registerStartCommand from "./start";
import commander from "commander";
// import registerRunCommand from "./run";

import { spawn } from "child_process";

const { version } = require("../../package");
const cli = new commander.Command("el");
cli.help();
cli.version(version);

registerInstallCommand(cli);
registerStartCommand(cli);
// registerRunCommand(cli);

// default
cli
  .command("[command]", "不存在该命令时，等价于 el start [command]")
  .action((command) => {
    spawn("el", ["start", command], { stdio: "inherit" });
  });

cli.parse();

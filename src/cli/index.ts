#!/usr/bin/env node

import cac from "cac";
import registerRunCommand from "./run";

const { version } = require("../../package");
const cli = cac("el").help().version(version);

registerRunCommand(cli);

cli.parse();

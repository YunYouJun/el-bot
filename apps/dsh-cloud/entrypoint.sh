#!/bin/sh
set -eu
umask 077
export DSH_HOME="$HOME/.dsh"
profile="$DSH_HOME/profiles/cloud"
test -f "$profile/package.json"
node --input-type=module -e 'import{mkdirSync,rmSync,writeFileSync}from"node:fs";import{randomUUID}from"node:crypto";const p=process.env.HOME+"/.dsh-qqbot/";mkdirSync(p,{recursive:true,mode:448});for(const n of ["workspace-grouping-status.json","cloud-runtime-status.json"])rmSync(p+n,{force:true});writeFileSync(p+"cloud-boot.json",JSON.stringify({id:randomUUID(),startedAt:Date.now()}),{mode:384})'
if [ ! -e "$profile/node_modules" ]; then
  ln -s /opt/dsh-runtime/node_modules "$profile/node_modules"
fi
dsh_bind_host="$(node -e "process.stdout.write(Object.values(require('node:os').networkInterfaces()).flat().find(x => x.family === 'IPv4' && !x.internal).address)")"
exec node --import /opt/dsh-runtime/tool-runtime.mjs /opt/dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile cloud --host "$dsh_bind_host" --port 3080 --no-open \
  --public-url "${DSH_PUBLIC_URL:-http://127.0.0.1:13080}"

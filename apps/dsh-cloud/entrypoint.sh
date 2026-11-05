#!/bin/sh
set -eu
umask 077
export DSH_HOME="$HOME/.dsh"
profile="$DSH_HOME/profiles/cloud"
test -f "$profile/package.json"
if [ ! -e "$profile/node_modules" ]; then
  ln -s /opt/dsh-runtime/node_modules "$profile/node_modules"
fi
dsh_bind_host="$(node -e "process.stdout.write(Object.values(require('node:os').networkInterfaces()).flat().find(x => x.family === 'IPv4' && !x.internal).address)")"
exec node /opt/dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile cloud --host "$dsh_bind_host" --port 3080 --no-open \
  --public-url "${DSH_PUBLIC_URL:-http://127.0.0.1:13080}"

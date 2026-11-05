#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-run}"
if [ "$(uname -s)" != Darwin ]; then printf 'This install script targets macOS. Use pnpm client:build on other platforms.\n' >&2; exit 1; fi
case "$MODE" in run|--build-only|--install-only|--verify|--debug|--logs) ;; *) printf 'Usage: %s [--build-only|--install-only|--verify|--debug|--logs]\n' "$0" >&2; exit 2 ;; esac
cd "$TASK_ROOT"
pnpm client:build --skip-dmg
TASK_APP="$TASK_ROOT/apps/el-bot-client/build/darwin-$(go env GOARCH)/Yun Bot.app"
if [ "$MODE" = --build-only ]; then exit 0; fi
if pgrep -x 'Yun Bot' >/dev/null; then
  pkill -TERM -x 'Yun Bot'
  for _ in {1..20}; do pgrep -x 'Yun Bot' >/dev/null || break; sleep 0.2; done
  if pgrep -x 'Yun Bot' >/dev/null; then printf 'Close Yun Bot before installing.\n' >&2; exit 1; fi
fi
TASK_INSTALLED="/Applications/Yun Bot.app"
if [ -e "$TASK_INSTALLED" ]; then
  TASK_BACKUP="$TASK_ROOT/.el-bot/backups/desktop/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$TASK_BACKUP"
  mv "$TASK_INSTALLED" "$TASK_BACKUP/"
fi
ditto "$TASK_APP" "$TASK_INSTALLED"
codesign --verify --deep --strict "$TASK_INSTALLED"
case "$MODE" in
  --install-only) ;;
  --debug) lldb -- "$TASK_INSTALLED/Contents/MacOS/Yun Bot" ;;
  --logs) open "$TASK_INSTALLED"; /usr/bin/log stream --info --style compact --predicate 'process == "Yun Bot"' ;;
  --verify) open "$TASK_INSTALLED"; sleep 1; pgrep -x 'Yun Bot' >/dev/null ;;
  *) open "$TASK_INSTALLED" ;;
esac

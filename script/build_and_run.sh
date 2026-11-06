#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-run}"
if [ "$(uname -s)" != Darwin ]; then printf 'This install script targets macOS. Use pnpm client:build on other platforms.\n' >&2; exit 1; fi
case "$MODE" in run|--build-only|--install-only|--verify|--debug|--logs) ;; *) printf 'Usage: %s [--build-only|--install-only|--verify|--debug|--logs]\n' "$0" >&2; exit 2 ;; esac
cd "$TASK_ROOT"
if [ "$MODE" != --build-only ]; then
for TASK_PROCESS in 'Yun' 'Yun Bot'; do
  if pgrep -x "$TASK_PROCESS" >/dev/null; then
    pkill -TERM -x "$TASK_PROCESS"
    for _ in {1..20}; do pgrep -x "$TASK_PROCESS" >/dev/null || break; sleep 0.2; done
    if pgrep -x "$TASK_PROCESS" >/dev/null; then printf 'Close %s before installing.\n' "$TASK_PROCESS" >&2; exit 1; fi
  fi
done
fi
pnpm client:build --skip-dmg
TASK_APP="$TASK_ROOT/apps/macos/build/darwin-$(uname -m | sed 's/x86_64/amd64/')/Yun.app"
if [ "$MODE" = --build-only ]; then exit 0; fi
TASK_INSTALLED="/Applications/Yun.app"
TASK_LEGACY_INSTALLED="/Applications/Yun Bot.app"
if [ -e "$TASK_INSTALLED" ] || [ -e "$TASK_LEGACY_INSTALLED" ]; then
  TASK_BACKUP="$TASK_ROOT/.el-bot/backups/desktop/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$TASK_BACKUP"
  for TASK_PREVIOUS in "$TASK_INSTALLED" "$TASK_LEGACY_INSTALLED"; do
    if [ -e "$TASK_PREVIOUS" ]; then mv "$TASK_PREVIOUS" "$TASK_BACKUP/"; fi
  done
fi
ditto "$TASK_APP" "$TASK_INSTALLED"
codesign --verify --deep --strict "$TASK_INSTALLED"
case "$MODE" in
  --install-only) ;;
  --debug) lldb -- "$TASK_INSTALLED/Contents/MacOS/Yun" ;;
  --logs) open "$TASK_INSTALLED"; /usr/bin/log stream --info --style compact --predicate 'process == "Yun"' ;;
  --verify) open "$TASK_INSTALLED"; sleep 1; pgrep -x 'Yun' >/dev/null ;;
  *) open "$TASK_INSTALLED" ;;
esac

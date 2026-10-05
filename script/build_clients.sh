#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
pnpm build
mkdir -p "$TASK_ROOT/dist/clients"
case "$(uname -s)" in
  Darwin) BUNDLE_FORMAT=dmg ;;
  Linux) BUNDLE_FORMAT=appimage ;;
  MINGW*|MSYS*|CYGWIN*) BUNDLE_FORMAT=nsis ;;
  *) printf 'Unsupported build platform\n' >&2; exit 1 ;;
esac
TASK_TAURI_BUNDLES="$BUNDLE_FORMAT"
if [ "$BUNDLE_FORMAT" = dmg ]; then
  TASK_TAURI_BUNDLES=app,dmg
fi
pnpm --filter @el-bot/client desktop:build --bundles "$TASK_TAURI_BUNDLES"
TASK_BUNDLES="$TASK_ROOT/apps/el-bot-client/src-tauri/target/release/bundle"
case "$BUNDLE_FORMAT" in
  dmg)
    ditto "$TASK_BUNDLES/macos/el-bot Client.app" "$TASK_ROOT/dist/clients/el-bot Client.app"
    cp "$TASK_BUNDLES/dmg/"*.dmg "$TASK_ROOT/dist/clients/"
    ;;
  appimage) cp "$TASK_BUNDLES/appimage/"*.AppImage "$TASK_ROOT/dist/clients/" ;;
  nsis) cp "$TASK_BUNDLES/nsis/"*.exe "$TASK_ROOT/dist/clients/" ;;
esac
printf 'Client artifacts: %s\n' "$TASK_ROOT/dist/clients"

#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) TARGET=darwin/arm64; LABEL=macos-arm64; BUNDLES=dmg ;;
  Darwin-x86_64) TARGET=darwin/amd64; LABEL=macos-x64; BUNDLES=dmg ;;
  *) printf 'Active installer builds target macOS. The nsh preview remains available through nsh:build.\n' >&2; exit 1 ;;
esac
pnpm --filter @el-bot/client desktop:build
node scripts/stage-client-release.mjs "$TARGET" "$LABEL" "$BUNDLES"

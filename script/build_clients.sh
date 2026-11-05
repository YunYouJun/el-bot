#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
pnpm client:build
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) TARGET=darwin/arm64; LABEL=macos-arm64; BUNDLES=dmg ;;
  Darwin-x86_64) TARGET=darwin/amd64; LABEL=macos-x64; BUNDLES=dmg ;;
  Linux-aarch64) TARGET=linux/arm64; LABEL=linux-arm64; BUNDLES=archive,deb ;;
  Linux-x86_64) TARGET=linux/amd64; LABEL=linux-x64; BUNDLES=archive,deb ;;
  MINGW*-*|MSYS*-*|CYGWIN*-*) TARGET=windows/amd64; LABEL=windows-x64; BUNDLES=nsis ;;
  *) printf 'Unsupported build platform\n' >&2; exit 1 ;;
esac
node scripts/stage-client-release.mjs "$TARGET" "$LABEL" "$BUNDLES"

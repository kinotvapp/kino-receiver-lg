#!/usr/bin/env bash
# Packages the receiver into dist/com.kino.receptor_<version>_all.ipk. Needs Node.js.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
cp -r "$root/appinfo.json" "$root/index.html" "$root/receiver.css" "$root/receiver.js" "$root/icon80.png" "$root/icon130.png" "$root/fonts" "$stage/"
node --check "$stage/receiver.js"
mkdir -p "$root/dist"
if command -v ares-package >/dev/null 2>&1; then
  ares-package "$stage" -o "$root/dist"
else
  npx --yes --package @webos-tools/cli ares-package "$stage" -o "$root/dist"
fi
ls -1 "$root"/dist/*.ipk

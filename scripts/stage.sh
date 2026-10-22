#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
[ "$(uname -m)" = aarch64 ] || { echo 'Expected Linux ARM64; stopping.' >&2; exit 1; }
[ ! -e runtime ] || { echo 'Runtime already exists; refusing to replace it.' >&2; exit 1; }
archive=node-v24.22.0-linux-arm64.tar.xz
curl --fail --show-error --location --proto '=https' --tlsv1.2 -o "$archive" "https://nodejs.org/dist/v24.22.0/$archive"
curl --fail --show-error --location --proto '=https' --tlsv1.2 -o SHASUMS256.txt https://nodejs.org/dist/v24.22.0/SHASUMS256.txt
printf '%s  %s\n' fef00bb4d36e1c50104a9775a10359beee98f162b4104dd12472c75065c6a143 "$archive" | sha256sum -c -
grep "  $archive\$" SHASUMS256.txt | sha256sum -c -
mkdir runtime
tar -xJf "$archive" --strip-components=1 -C runtime
[ "$(runtime/bin/node --version)" = v24.22.0 ]
[ "$(runtime/bin/node runtime/lib/node_modules/npm/bin/npm-cli.js --version)" = 11.19.1 ]
runtime/bin/node scripts/verify-dependencies.mjs --lock-only
runtime/bin/node runtime/lib/node_modules/npm/bin/npm-cli.js ci --ignore-scripts --omit=dev --omit=optional --no-audit --no-fund --cache "$PWD/.npm-cache"
runtime/bin/node scripts/verify-dependencies.mjs

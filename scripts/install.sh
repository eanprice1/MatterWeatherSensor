#!/bin/sh
# Fresh installations only. Uses an existing account; never creates users or changes networking.
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
[ "$(uname -s)" = Linux ] || { echo 'Linux with systemd is required.' >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo 'Run this installer with your existing sudo authorization.' >&2; exit 1; }
for tool in systemd-analyze systemctl id ss install cp chown chmod mktemp rm rmdir find; do
  command -v "$tool" >/dev/null || { echo "Required command is missing: $tool" >&2; exit 1; }
done
target=/opt/outdoor-matter-sensor
unit=/etc/systemd/system/outdoor-matter-sensor.service
for destination in "$target" "$unit" /etc/systemd/system/outdoor-matter-sensor.service.d /etc/outdoor-matter-sensor /var/lib/outdoor-matter-sensor /run/outdoor-matter-sensor; do
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    echo "Existing destination: $destination; refusing to replace it." >&2
    exit 1
  fi
done
if [ -n "$(ss -H -lun 'sport = :5540')$(ss -H -ltn 'sport = :5540')" ]; then
  echo 'Matter port 5540 is occupied; stopping.' >&2
  exit 1
fi
[ "$(runtime/bin/node --version)" = v24.22.0 ]
[ "$(runtime/bin/node runtime/lib/node_modules/npm/bin/npm-cli.js --version)" = 11.19.1 ]
for entry in src bin scripts systemd test examples automations docs LICENSES package.json package-lock.json README.md NOTICE.md LICENSE; do
  [ -e "$entry" ] || { echo "Missing application payload: $entry" >&2; exit 1; }
done
[ -z "$(find src bin scripts systemd test examples automations docs LICENSES -type l -print)" ] || { echo 'Application payload must not contain symlinks.' >&2; exit 1; }
runtime/bin/node scripts/verify-dependencies.mjs
for source in src/*.mjs scripts/*.mjs; do runtime/bin/node --check "$source"; done
umask 077
check_dir=$(mktemp -d)
trap 'rm -f -- "$check_dir/outdoor-matter-sensor.service" "$check_dir/verify.service"; rmdir -- "$check_dir"' EXIT HUP INT TERM
runtime/bin/node scripts/render-service.mjs "$@" --output "$check_dir/outdoor-matter-sensor.service" --verify-output "$check_dir/verify.service"
systemd-analyze verify "$check_dir/verify.service"
# All account, interface, runtime and unit checks happen before writing installation destinations.
umask 022
install -d -m 0755 "$target"
cp -R runtime node_modules src bin scripts systemd test examples automations docs LICENSES package.json package-lock.json README.md NOTICE.md LICENSE "$target/"
chown -R root:root "$target"
chmod -R go-w "$target"
chmod 0755 "$target/bin/sensorctl"
install -m 0644 "$check_dir/outdoor-matter-sensor.service" "$unit"
systemctl daemon-reload
systemctl enable --now outdoor-matter-sensor.service
echo 'Installed in simulated mode. See README.md for private weather configuration and commissioning.'

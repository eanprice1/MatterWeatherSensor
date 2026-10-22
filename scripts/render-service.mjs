import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const accountName = /^[a-z_][a-z0-9_-]{0,31}\$?$/i;
const interfaceName = /^[a-z0-9_][a-z0-9_.:-]{0,14}$/i;

export function validateSelection({ user, group, networkInterface }) {
  if (!accountName.test(user ?? '')) throw new Error('Select an existing account with a portable Unix username');
  if (!accountName.test(group ?? '')) throw new Error('The existing primary group must have a portable Unix group name');
  if (!interfaceName.test(networkInterface ?? '')) throw new Error('Select a valid existing network interface name');
}

export function renderService(template, selection) {
  validateSelection(selection);
  let unit = template.replaceAll('@SERVICE_USER@', selection.user)
    .replaceAll('@SERVICE_GROUP@', selection.group)
    .replaceAll('@NETWORK_INTERFACE@', selection.networkInterface);
  if (/@[A-Z_]+@/.test(unit)) throw new Error('The service template contains unresolved placeholders');
  for (const [key, value] of [['User', selection.user], ['Group', selection.group], ['Environment', `OTM_INTERFACE=${selection.networkInterface}`]]) {
    if (!unit.split('\n').includes(`${key}=${value}`)) throw new Error(`Missing rendered ${key} setting`);
  }
  return unit;
}

export function resolveSelection(user, networkInterface, {
  lookup = name => ({ uid: Number(execFileSync('id', ['-u', '--', name], {encoding: 'utf8'}).trim()),
    group: execFileSync('id', ['-gn', '--', name], {encoding: 'utf8'}).trim() }),
  interfaces = os.networkInterfaces(),
} = {}) {
  // Validate before invoking account lookups or accepting text for the unit file.
  validateSelection({user, group: user, networkInterface});
  const account = lookup(user);
  if (!Number.isSafeInteger(account.uid) || account.uid <= 0) throw new Error('The service must use an existing non-root account');
  if (!Object.hasOwn(interfaces, networkInterface) || !interfaces[networkInterface]?.length) {
    throw new Error('The selected network interface has no assigned addresses');
  }
  const selection = {user, group: account.group, networkInterface};
  validateSelection(selection);
  return selection;
}

export function parseOptions(args) {
  const values = {};
  const known = new Set(['--user', '--interface', '--output', '--verify-output']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!known.has(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) {
      throw new Error('Usage: --user EXISTING_USER --interface EXISTING_INTERFACE --output UNIT_PATH --verify-output CHECK_PATH');
    }
    values[key] = value;
  }
  if (Object.keys(values).length !== known.size) throw new Error('All service rendering arguments are required');
  return values;
}

function systemdArgument(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid staging path');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.platform !== 'linux') throw new Error('Service installation is supported on Linux only');
    const options = parseOptions(process.argv.slice(2));
    const selection = resolveSelection(options['--user'], options['--interface']);
    const project = fileURLToPath(new URL('../', import.meta.url));
    const template = fs.readFileSync(new URL('../systemd/outdoor-matter-sensor.service', import.meta.url), 'utf8');
    const rendered = renderService(template, selection);
    // Before installation /opt does not exist. Check the same unit using the staged executable.
    const verification = rendered.replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${systemdArgument(project)}`)
      .replace(/^ExecStart=.*$/m, `ExecStart=${systemdArgument(process.execPath)} ${systemdArgument(path.join(project, 'src/sensor.mjs'))}`);
    for (const filename of [options['--output'], options['--verify-output']]) {
      if (!path.isAbsolute(filename) || fs.existsSync(filename)) throw new Error('Render targets must be new absolute paths');
    }
    fs.writeFileSync(options['--output'], rendered, {mode: 0o600, flag: 'wx'});
    fs.writeFileSync(options['--verify-output'], verification, {mode: 0o600, flag: 'wx'});
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

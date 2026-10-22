import fs from 'node:fs';
const allowed = new Map([
  ...['main', 'nodejs', 'node', 'model', 'types', 'general', 'protocol'].map(name => [`@matter/${name}`, '0.17.9']),
  ['@noble/curves', '2.4.0'], ['@noble/hashes', '2.4.0'],
]);
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url)));
const lockOnly = process.argv.includes('--lock-only');
const found = new Set();
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location) continue;
  const name = location.split('node_modules/').at(-1);
  if (allowed.get(name) !== entry.version || entry.hasInstallScript) {
    throw new Error(`Unapproved dependency or install script: ${name}@${entry.version}`);
  }
  if (!lockOnly) {
    const installed = JSON.parse(fs.readFileSync(new URL(`../${location}/package.json`, import.meta.url)));
    if (installed.name !== name || installed.version !== allowed.get(name)) throw new Error(`Installed dependency mismatch: ${name}`);
  }
  found.add(name);
}
if (found.size !== allowed.size) throw new Error('Dependency inventory is incomplete');
console.log(`Verified all ${found.size} approved runtime libraries${lockOnly ? ' in the lockfile' : ''}; no additional dependencies.`);

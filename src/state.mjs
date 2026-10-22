import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateMatter } from './temperature.mjs';

export async function writeJson(filename, value, durable = false) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    const file = await fs.open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value)}\n`);
      if (durable) await file.sync();
    } finally { await file.close(); }
    await fs.rename(temporary, filename);
    if (durable) {
      const directory = await fs.open(path.dirname(filename), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function loadState(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const identityPath = path.join(directory, 'identity.json');
  let identity;
  try {
    identity = JSON.parse(await fs.readFile(identityPath, 'utf8'));
    if (!/^[0-9a-f-]{36}$/.test(identity.uniqueId)) throw new Error('Invalid identity file; refusing to reset it');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    identity = { uniqueId: randomUUID() };
    await fs.writeFile(identityPath, `${JSON.stringify(identity)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const readingPath = path.join(directory, 'reading.json');
  let reading;
  try {
    reading = JSON.parse(await fs.readFile(readingPath, 'utf8'));
    validateMatter(reading.matterValue);
    if (!Number.isFinite(Date.parse(reading.updatedAt))) throw new Error('Invalid reading timestamp');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    reading = { matterValue: 2000, updatedAt: new Date().toISOString() };
    await writeJson(readingPath, reading);
  }
  return { identity, reading, readingPath };
}

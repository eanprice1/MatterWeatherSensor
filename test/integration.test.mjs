import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { request } from '../src/rpc.mjs';
import { loadState } from '../src/state.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));

test('real Matter server updates, validates, protects credentials, and preserves state', { timeout: 60000 }, async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'outdoor-matter-test-'));
  const socketPath = path.join(temporary, 'control.sock');
  const stateDirectory = path.join(temporary, 'state');
  let child;
  let output = '';
  async function start() {
    output = '';
    child = spawn(process.execPath, [path.join(project, 'src/sensor.mjs')], {
      env: { ...process.env, OTM_STATE_DIR: stateDirectory, OTM_SOCKET_PATH: socketPath,
        OTM_PORT: '5559', OTM_CONFIG_PATH: path.join(temporary, 'absent-config.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Sensor exited during startup: ${output}`);
      try { return await request(socketPath, { op: 'status' }); }
      catch { await delay(100); }
    }
    throw new Error(`Sensor did not start: ${output}`);
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 0, output);
    assert.doesNotMatch(output, /MT:|manual pairing code|passcode[=:]|QR code URL/i);
    assert.doesNotMatch(output, /\b\d{11}\b/);
  }
  try {
    const initial = await start();
    assert.equal(initial.matterValue, 2000);
    assert.equal(initial.online, true);
    assert.equal(initial.commissioned, false);
    const socketMode = (await fs.stat(socketPath)).mode & 0o777;
    assert.equal(socketMode, 0o600);
    const pair = await request(socketPath, { op: 'pairing' });
    assert.match(pair.qrPairingCode, /^MT:/);
    assert.match(pair.manualPairingCode, /^\d{11}$/);
    for (const [fahrenheit, matter] of [[77, 2500], [86, 3000], [-4, -2000]]) {
      const result = await request(socketPath, { op: 'set-f', value: fahrenheit });
      assert.equal(result.matterValue, matter);
    }
    await assert.rejects(request(socketPath, { op: 'set-f', value: -500 }));
    await assert.rejects(request(socketPath, { op: 'set-f', value: '68' }));
    await assert.rejects(request(socketPath, { op: 'erase' }));
    assert.equal((await request(socketPath, { op: 'status' })).matterValue, -2000);
    assert.equal((await request(socketPath, { op: 'unavailable' })).matterValue, null);
    await stop();
    assert.equal((await start()).matterValue, null);
    const pairAfter = await request(socketPath, { op: 'pairing' });
    assert.equal(pairAfter.manualPairingCode, pair.manualPairingCode);
    assert.equal(pairAfter.qrPairingCode, pair.qrPairingCode);
    await request(socketPath, { op: 'set-f', value: 77 });
    // Exercise a crash leaving a stale control socket; the next process must recover without erasing identity.
    const crashed = once(child, 'exit');
    child.kill('SIGKILL');
    await crashed;
    assert.equal((await start()).matterValue, 2500);
    assert.equal((await request(socketPath, { op: 'pairing' })).manualPairingCode, pair.manualPairingCode);
    await stop();
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('corrupt project state stops startup instead of silently replacing it', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'outdoor-matter-state-'));
  try {
    await loadState(temporary);
    await fs.writeFile(path.join(temporary, 'reading.json'), '{"matterValue":-32768,"updatedAt":"2026-01-01"}');
    await assert.rejects(loadState(temporary));
    assert.match(await fs.readFile(path.join(temporary, 'reading.json'), 'utf8'), /-32768/);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});

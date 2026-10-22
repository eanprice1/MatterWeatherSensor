// Runs only against this project's installed, uncommissioned service. Never operates the thermostat.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { request, defaultSocket } from '../src/rpc.mjs';

const unit = 'outdoor-matter-sensor.service';
const systemctl = (...args) => execFileSync('/usr/bin/systemctl', args, { encoding: 'utf8' }).trim();
const control = message => request(defaultSocket, message);
async function ready() {
  for (let attempt = 0; attempt < 150; attempt++) {
    try { const status = await control({ op: 'status' }); if (status.online) return status; } catch {}
    await delay(200);
  }
  throw new Error('Service did not become ready');
}

let restoreReading = false;
try {
  const initial = await ready();
  assert.equal(initial.commissioned, false, 'These installation tests require an uncommissioned device');
  assert.equal(initial.mode, 'simulated', 'These installation tests require simulated mode');
  restoreReading = true;
  const pairingBefore = await control({ op: 'pairing' });
  const pidBefore = systemctl('show', unit, '-p', 'MainPID', '--value');
  await control({ op: 'set-f', value: 77 });
  systemctl('restart', unit);
  assert.equal((await ready()).matterValue, 2500);
  assert.notEqual(systemctl('show', unit, '-p', 'MainPID', '--value'), pidBefore);
  const pairingAfterRestart = await control({ op: 'pairing' });
  assert.ok(pairingAfterRestart.qrPairingCode === pairingBefore.qrPairingCode &&
    pairingAfterRestart.manualPairingCode === pairingBefore.manualPairingCode, 'Onboarding codes changed on restart');
  console.log('PASS: systemd restart preserves identity, onboarding codes, and last reading.');
  const restartsBefore = Number(systemctl('show', unit, '-p', 'NRestarts', '--value'));
  systemctl('kill', '--kill-whom=main', '--signal=SIGKILL', unit);
  const afterCrash = await ready();
  assert.equal(afterCrash.matterValue, 2500);
  assert.ok(Number(systemctl('show', unit, '-p', 'NRestarts', '--value')) > restartsBefore);
  const pairingAfterCrash = await control({ op: 'pairing' });
  assert.ok(pairingAfterCrash.qrPairingCode === pairingBefore.qrPairingCode &&
    pairingAfterCrash.manualPairingCode === pairingBefore.manualPairingCode, 'Onboarding codes changed after crash');
  console.log('PASS: systemd recovers from a process crash without resetting pairing state.');
  const pairingOutput = execFileSync('/opt/outdoor-matter-sensor/bin/sensorctl', ['pairing'], { encoding: 'utf8' });
  assert.ok(pairingOutput.includes(pairingBefore.qrPairingCode));
  assert.ok(pairingOutput.includes(pairingBefore.manualPairingCode));
  const logs = execFileSync('/usr/bin/journalctl', ['-u', unit, '-b', '--no-pager'], { encoding: 'utf8' });
  assert.ok(!logs.includes(pairingBefore.qrPairingCode));
  assert.ok(!logs.includes(pairingBefore.manualPairingCode));
  console.log('PASS: pairing CLI renders credentials explicitly; service journal contains neither code.');
  for (const directory of ['/var/lib/outdoor-matter-sensor', '/run/outdoor-matter-sensor']) {
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  }
  assert.equal((await fs.stat(defaultSocket)).mode & 0o777, 0o600);
  assert.equal((await fs.stat('/opt/outdoor-matter-sensor/src/sensor.mjs')).uid, 0);
  assert.equal(systemctl('is-enabled', unit), 'enabled');
  console.log('PASS: private state/socket permissions, root-owned app, and boot enablement.');
} finally {
  if (restoreReading) {
    await ready();
    await control({ op: 'set-f', value: 68 });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deviceConfiguration, hexadecimalId} from '../src/configuration.mjs';
import {renderService, resolveSelection, parseOptions} from '../scripts/render-service.mjs';

test('generic metadata defaults and independent deployment overrides', () => {
  assert.deepEqual(deviceConfiguration({}), {deviceName: 'Outdoor Temperature Sensor', vendorName: 'MatterWeatherSensor', vendorId: 0xfff1, productId: 0x8000});
  const settings = deviceConfiguration({OTM_DEVICE_NAME: 'Example Weather', OTM_VENDOR_NAME: 'Example Project', OTM_VENDOR_ID: '0xFFF2', OTM_PRODUCT_ID: '32769'});
  assert.equal(settings.deviceName, 'Example Weather');
  assert.equal(settings.vendorName, 'Example Project');
  assert.equal(hexadecimalId(settings.vendorId), '0xFFF2');
  assert.equal(hexadecimalId(settings.productId), '0x8001');
  for (const bad of ['', ' ', 'a\nb', 'a'.repeat(33), '\u00e9'.repeat(17)]) {
    assert.throws(() => deviceConfiguration({OTM_DEVICE_NAME: bad}));
    assert.throws(() => deviceConfiguration({OTM_VENDOR_NAME: bad}));
  }
  for (const bad of ['', '-1', '1.5', '0xFFFF', '65536', ' 42', 'NaN']) assert.throws(() => deviceConfiguration({OTM_VENDOR_ID: bad}));
  for (const bad of ['-1', '65536', '1e2']) assert.throws(() => deviceConfiguration({OTM_PRODUCT_ID: bad}));
});

test('service rendering keeps existing account/group and hardening without accepting unit injection', () => {
  const template = fs.readFileSync(new URL('../systemd/outdoor-matter-sensor.service', import.meta.url), 'utf8');
  const selection = resolveSelection('exampleuser', 'eth0', {lookup: () => ({uid: 1001, group: 'examplegroup'}), interfaces: {eth0: [{address: '192.0.2.10'}]}});
  const rendered = renderService(template, selection);
  assert.match(rendered, /^User=exampleuser$/m);
  assert.match(rendered, /^Group=examplegroup$/m);
  assert.match(rendered, /^Environment=OTM_INTERFACE=eth0$/m);
  assert.match(rendered, /^NoNewPrivileges=yes$/m);
  assert.match(rendered, /^ProtectSystem=strict$/m);
  assert.doesNotMatch(rendered, /@[A-Z_]+@/);
  for (const field of ['user', 'group', 'networkInterface']) {
    assert.throws(() => renderService(template, {...selection, [field]: 'bad\nExecStart=/bad'}));
  }
  assert.throws(() => resolveSelection('root', 'eth0', {lookup: () => ({uid: 0, group: 'root'}), interfaces: {eth0: [{}]}}));
  assert.throws(() => resolveSelection('exampleuser', 'eth0', {lookup: () => {throw new Error('Missing user');}, interfaces: {eth0: [{}]}}));
  assert.throws(() => resolveSelection('exampleuser', 'eth0', {lookup: () => ({uid: 1001, group: 'examplegroup'}), interfaces: {}}));
  assert.throws(() => renderService(template + '\n@UNKNOWN@', selection));
});

test('installer options require explicit selections and reject unknown or duplicate arguments', () => {
  const good = ['--user', 'exampleuser', '--interface', 'eth0', '--output', '/tmp/example.service', '--verify-output', '/tmp/check.service'];
  assert.equal(parseOptions(good)['--user'], 'exampleuser');
  for (const bad of [[], good.slice(2), [...good, '--user', 'another'], [...good, '--unknown', 'value'], ['--user']]) {
    assert.throws(() => parseOptions(bad));
  }
});


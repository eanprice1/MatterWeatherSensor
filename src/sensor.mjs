// Device structure adapted from the Apache-2.0 Matter.js sensor example; see NOTICE.md.
// Modified for weather polling, protected local control and configurable deployment metadata.
import { Endpoint, Environment, Logger, ServerNode } from '@matter/main';
import { TemperatureSensorDevice } from '@matter/main/devices/temperature-sensor';
import { DeviceTypeId, VendorId } from '@matter/main/types';
import os from 'node:os';
import path from 'node:path';
import { loadState } from './state.mjs';
import { fahrenheitToMatter, MIN_MATTER, MAX_MATTER } from './temperature.mjs';
import { WeatherEngine, loadConfiguration } from './weather.mjs';
import { defaultSocket, serve } from './rpc.mjs';
import { deviceConfiguration, hexadecimalId } from './configuration.mjs';

process.umask(0o077);
const stateDirectory = process.env.OTM_STATE_DIR ?? '/var/lib/outdoor-matter-sensor';
const socketPath = process.env.OTM_SOCKET_PATH ?? defaultSocket;
const networkInterface = process.env.OTM_INTERFACE ?? 'wlan0';
const matterPort = Number(process.env.OTM_PORT ?? 5540);
const device = deviceConfiguration();
if (!Number.isInteger(matterPort) || matterPort < 1024 || matterPort > 65535) throw new Error('Invalid Matter port');
if (!path.isAbsolute(stateDirectory) || !path.isAbsolute(socketPath)) throw new Error('State and socket paths must be absolute');

// The SDK normally prints onboarding credentials at NOTICE level. They are available only through sensorctl pairing.
Logger.level = 'warn';
Logger.format = 'plain';
Logger.facilityLevels = { Commissioning: 'error' };

let node;
let weather;
let stopControl;
let closing = false;

async function shutdown(code) {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 12000);
  deadline.unref();
  try {
    await stopControl?.();
    await weather?.close();
    await node?.close();
    console.log('Sensor stopped; persistent state preserved.');
  } catch {
    console.error('Sensor shutdown failed; persistent state preserved.');
    code = 1;
  }
  process.exitCode = code;
}

async function main() {
  if (!(os.networkInterfaces()[networkInterface]?.length)) throw new Error('Configured interface is not ready');
  const stored = await loadState(stateDirectory);
  let sensor;
  let initialValue;
  const config = await loadConfiguration(process.env.OTM_CONFIG_PATH ?? '/etc/outdoor-matter-sensor/weather.json').catch(() => null);
  weather = new WeatherEngine({ directory: stateDirectory, simulated: stored.reading, readingPath: stored.readingPath, config,
    publish: async value => {
      if (sensor) await sensor.set({ temperatureMeasurement: { measuredValue: value } });
      else initialValue = value;
    } });
  await weather.init();
  const env = Environment.default;
  env.vars.set('storage.path', path.join(stateDirectory, 'matter'));
  env.vars.set('mdns.networkInterface', networkInterface);
  node = await ServerNode.create({
    id: 'outdoor-temperature-test',
    network: { port: matterPort, ble: false, discoveryCapabilities: { onIpNetwork: true, ble: false } },
    productDescription: { name: device.deviceName, deviceType: DeviceTypeId(TemperatureSensorDevice.deviceType) },
    basicInformation: {
      vendorName: device.vendorName, vendorId: VendorId(device.vendorId), productId: device.productId,
      productName: device.deviceName, productLabel: device.deviceName, nodeLabel: device.deviceName,
      uniqueId: stored.identity.uniqueId.replaceAll('-', ''),
      serialNumber: `OTM-${stored.identity.uniqueId.replaceAll('-', '').slice(0, 24)}`,
      hardwareVersion: 1, hardwareVersionString: 'Pi4', softwareVersion: 2, softwareVersionString: '0.2.0',
    },
  });
  sensor = new Endpoint(TemperatureSensorDevice, {
    id: 'outdoor-temperature',
    temperatureMeasurement: { measuredValue: initialValue, minMeasuredValue: MIN_MATTER, maxMeasuredValue: MAX_MATTER },
  });
  await node.add(sensor);
  await node.start();
  stopControl = await serve(socketPath, async message => {
    if (closing) throw new Error('Sensor is stopping');
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Expected a control command');
    if (message.op === 'status') return {
      name: device.deviceName, ...weather.status(),
      online: node.lifecycle.isOnline, commissioned: node.lifecycle.isCommissioned,
      vendorId: hexadecimalId(device.vendorId), productId: hexadecimalId(device.productId), interface: networkInterface, port: matterPort,
      endpoint: sensor.number,
    };
    if (message.op === 'mode') return weather.setMode(message.value);
    if (message.op === 'pairing') {
      if (node.lifecycle.isCommissioned) throw new Error('Already commissioned; use Google Home to share the device with another controller');
      return { ...node.state.commissioning.pairingCodes, name: device.deviceName,
        vendorId: hexadecimalId(device.vendorId), productId: hexadecimalId(device.productId) };
    }
    if (message.op !== 'set-f' && message.op !== 'unavailable') throw new Error('Unknown control command');
    const value = message.op === 'unavailable' ? null : fahrenheitToMatter(message.value);
    const result = await weather.setSimulated(value);
    console.log(value === null ? 'Simulated temperature marked unavailable.' : `Simulated temperature updated: ${value / 100} C.`);
    return result;
  });
  weather.start();
  console.log('Matter temperature sensor online; local control ready.');
}

process.on('SIGTERM', () => { void shutdown(0); });
process.on('SIGINT', () => { void shutdown(0); });
main().catch(async error => {
  // SDK exceptions can include onboarding data. Report a category, not raw credential-bearing objects.
  console.error('Sensor startup failed. Check project paths, stored data, interface availability, and port 5540.');
  const seen = new Set();
  function report(failure) {
    if (!failure || seen.has(failure)) return;
    seen.add(failure);
    if (typeof failure.message === 'string') console.error(failure.message
      .replace(/MT:[^\s]+/g, '[redacted QR]')
      .replace(/(passcode\s*[:=]?\s*)\S+/gi, '$1[redacted]')
      .replace(/\b\d{8,}\b/g, '[redacted number]')
      .replace(/\b[a-fA-F0-9]{32,}\b/g, '[redacted hex]'));
    if (failure.errors && typeof failure.errors[Symbol.iterator] === 'function') for (const cause of failure.errors) report(cause);
    report(failure.cause);
  }
  report(error);
  await shutdown(1);
});

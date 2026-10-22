import { request, defaultSocket } from './rpc.mjs';

const [command, argument, ...extra] = process.argv.slice(2);
try {
  if (extra.length || !['status', 'set-f', 'unavailable', 'pairing', 'mode'].includes(command) ||
      (!['set-f', 'mode'].includes(command) && argument !== undefined) ||
      (command === 'mode' && !['weather', 'simulated'].includes(argument)) ||
      (command === 'set-f' && (argument === undefined || argument.trim() === '' || !Number.isFinite(Number(argument))))) {
    throw new Error('Usage: sensorctl status | mode weather|simulated | set-f <fahrenheit> | unavailable | pairing');
  }
  const result = await request(process.env.OTM_SOCKET_PATH ?? defaultSocket, {
    op: command, ...(command === 'set-f' ? { value: Number(argument) } : command === 'mode' ? { value: argument } : {}),
  });
  if (command === 'pairing') {
    // Explicitly requested output only; never written to service logs or source control.
    const { QrCode } = await import('@matter/main/types');
    console.log(QrCode.get(result.qrPairingCode));
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

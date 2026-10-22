import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';

export const defaultSocket = '/run/outdoor-matter-sensor/control.sock';

export function request(socketPath, message) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const socket = net.createConnection(socketPath);
    socket.setTimeout(5000, () => socket.destroy(new Error('Control request timed out')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(`${JSON.stringify(message)}\n`));
    socket.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 32768) return socket.destroy(new Error('Control response too large'));
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      try {
        const response = JSON.parse(buffer.slice(0, end));
        if (!response.ok) throw new Error(response.error);
        resolve(response.result);
        socket.end();
      } catch (error) { socket.destroy(error); }
    });
    socket.on('close', () => { if (!buffer.includes('\n')) reject(new Error('Control connection closed without a response')); });
  });
}

export async function serve(socketPath, handler) {
  await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  try {
    const existing = await fs.lstat(socketPath);
    if (!existing.isSocket()) throw new Error('Refusing to replace a non-socket control path');
    await new Promise((resolve, reject) => {
      const probe = net.createConnection(socketPath);
      probe.setTimeout(1000, () => probe.destroy(new Error('Existing control socket did not respond')));
      probe.on('connect', () => { probe.destroy(); reject(new Error('Another sensor is already running')); });
      probe.on('error', error => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
    });
    await fs.unlink(socketPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let queue = Promise.resolve();
  const connections = new Set();
  const server = net.createServer(socket => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(5000, () => socket.destroy());
    let buffer = '';
    let received = false;
    socket.on('data', chunk => {
      if (received) return;
      buffer += chunk.toString();
      if (buffer.length > 4096) return socket.destroy();
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      received = true;
      queue = queue.then(async () => {
        try {
          const result = await handler(JSON.parse(buffer.slice(0, end)));
          socket.end(`${JSON.stringify({ ok: true, result })}\n`);
        } catch (error) {
          socket.end(`${JSON.stringify({ ok: false, error: error.message })}\n`);
        }
      });
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  await fs.chmod(socketPath, 0o600);
  return async () => {
    for (const socket of connections) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await queue;
    await fs.unlink(socketPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  };
}

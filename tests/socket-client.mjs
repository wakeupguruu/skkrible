import WebSocket from 'ws';
import assert from 'node:assert/strict';

export const BACKEND = process.env.TEST_BACKEND_URL ?? 'http://127.0.0.1:8787';
export const ORIGIN = 'http://127.0.0.1:5173';
export async function newRoom() {
  const response = await fetch(`${BACKEND}/api/rooms`, { method: 'POST', headers: { Origin: ORIGIN } });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).code;
}
export async function connect(code, identity) {
  const socket = new WebSocket(`${BACKEND.replace(/^http/, 'ws')}/api/rooms/${code}/socket`, { origin: ORIGIN });
  const messages = [];
  const waiters = new Set();
  socket.on('error', () => {});
  socket.on('message', bytes => {
    const raw = bytes.toString();
    if (raw === 'pong') return;
    const message = JSON.parse(raw);
    messages.push(message);
    for (const notify of waiters) notify();
  });
  const until = (predicate, timeout = 10_000) => new Promise((resolve, reject) => {
    const check = () => {
      const found = messages.find(predicate);
      if (found) { clearTimeout(timer); waiters.delete(check); resolve(found); }
    };
    const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`Timed out waiting for message. Last messages: ${JSON.stringify(messages.slice(-2))}`)); }, timeout);
    waiters.add(check); check();
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'join', ...identity }));
  const welcome = await until(m => m.type === 'welcome' || m.type === 'error');
  assert.equal(welcome.type, 'welcome', welcome.message);
  return { socket, messages, until, welcome,
    async command(type, extra = {}, id = crypto.randomUUID()) {
      socket.send(JSON.stringify({ type, id, ...extra }));
      const result = await until(m => m.id === id && ['ack', 'error'].includes(m.type));
      assert.equal(result.type, 'ack', result.message);
      return id;
    },
    close() { socket.terminate(); },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, connect, BACKEND, ORIGIN } from './socket-client.mjs';

test('origins and unsupported endpoints are rejected at the transport boundary', async () => {
  assert.equal((await fetch(`${BACKEND}/health`)).status, 200);
  assert.equal((await fetch(`${BACKEND}/api/rooms`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${BACKEND}/missing`, { headers: { Origin: ORIGIN } })).status, 404);
});

test('live clients share drawing and recover the same player after a transport loss', async t => {
  const code = await newRoom();
  const host = await connect(code, { name: 'Host', avatar: 1 });
  const guest = await connect(code, { name: 'Friend', avatar: 2 });
  t.after(() => { host.close(); guest.close(); });
  await host.until(m => m.type === 'state' && m.room.players.length === 2);
  await host.command('start');
  const choosing = await host.until(m => m.type === 'state' && m.room.phase === 'choosing');
  assert.equal(choosing.room.choices.length, 3);
  const hidden = await guest.until(m => m.type === 'state' && m.room.phase === 'choosing');
  assert.deepEqual(hidden.room.choices, []);
  const turnId = choosing.room.turnId;
  await host.command('choose', { turnId, index: 0 });
  const drawing = await host.until(m => m.type === 'state' && m.room.phase === 'drawing');
  const stroke = { id: crypto.randomUUID(), color: '#252a34', size: 4, tool: 'pen', points: [[10, 10], [200, 200]] };
  await host.command('stroke', { turnId, stroke });
  await guest.until(m => m.type === 'stroke' && m.stroke.id === stroke.id);
  const token = guest.welcome.token;
  const playerId = guest.welcome.room.youId;
  guest.close();
  const recovered = await connect(code, { token });
  t.after(() => recovered.close());
  assert.equal(recovered.welcome.room.youId, playerId);
  assert.equal(recovered.welcome.room.players.length, 2);
  assert.equal(recovered.welcome.board.length, 1);
  assert.deepEqual(recovered.welcome.board[0], stroke);
  assert.equal(recovered.welcome.room.word, '');
  await recovered.command('chat', { turnId, text: drawing.room.word });
  const reveal = await recovered.until(m => m.type === 'state' && m.room.phase === 'reveal');
  const score = reveal.room.players.find(p => p.id === playerId).score;
  assert.ok(score > 100);
  recovered.close();
  const again = await connect(code, { token });
  t.after(() => again.close());
  assert.equal(again.welcome.room.players.find(p => p.id === playerId).score, score);
});

test('a repeated drawing command is acknowledged without duplicating the board', async t => {
  const code = await newRoom();
  const host = await connect(code, { name: 'One' });
  const guest = await connect(code, { name: 'Two' });
  t.after(() => { host.close(); guest.close(); });
  await host.command('start');
  const state = await host.until(m => m.type === 'state' && m.room.phase === 'choosing');
  await host.command('choose', { index: 0, turnId: state.room.turnId });
  const command = { type: 'stroke', id: crypto.randomUUID(), turnId: state.room.turnId,
    stroke: { id: crypto.randomUUID(), color: '#252a34', size: 10, tool: 'pen', points: [[20, 20]] } };
  await host.command('stroke', command, command.id);
  host.socket.send(JSON.stringify(command));
  host.socket.send(JSON.stringify({ type: 'sync' }));
  const snapshot = await host.until(m => m.type === 'snapshot');
  assert.equal(snapshot.board.length, 1);
});

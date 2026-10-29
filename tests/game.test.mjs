import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, disconnect, action, tick, nextAlarm, view, validateStroke, ROOM_TTL } from '../apps/backend/game.mjs';

const send = (r, p, type, extra = {}, now = 1000, id = crypto.randomUUID()) => action(r, p.id, { id, type, turnId: r.turnId, ...extra }, now);
function fixture() {
  const room = createRoom('TESTROOM', 0);
  const host = joinRoom(room, { name: 'Host', avatar: 2 }, 0);
  const guest = joinRoom(room, { name: 'Friend', avatar: 3 }, 0);
  return { room, host, guest };
}
function drawing(f) {
  send(f.room, f.host, 'start');
  send(f.room, f.host, 'choose', { index: 0 }, 2000);
}
const stroke = () => ({ id: crypto.randomUUID(), color: '#252a34', tool: 'pen', size: 4, points: [[10, 20], [100, 200]] });

test('private words and resume credentials never appear in another player’s view', () => {
  const f = fixture();
  send(f.room, f.host, 'start');
  assert.equal(view(f.room, f.host.id).choices.length, 3);
  assert.deepEqual(view(f.room, f.guest.id).choices, []);
  send(f.room, f.host, 'choose', { index: 0 });
  const guestView = view(f.room, f.guest.id);
  assert.equal(guestView.word, '');
  assert.ok(!JSON.stringify(guestView).includes(f.host.token));
  assert.ok(!JSON.stringify(guestView).includes(f.guest.token));
  assert.equal(view(f.room, f.host.id).word, f.room.word);
});

test('server awards scores once and completes a full two-player game', () => {
  const f = fixture();
  send(f.room, f.host, 'settings', { settings: { ...f.room.settings, rounds: 1, customWords: '' } });
  drawing(f);
  const id = crypto.randomUUID();
  send(f.room, f.guest, 'chat', { text: f.room.word }, 3000, id);
  assert.equal(f.room.phase, 'reveal');
  const score = f.guest.score;
  send(f.room, f.guest, 'chat', { text: f.room.word }, 3001, id);
  assert.equal(f.guest.score, score);
  assert.equal(f.host.score, 50);
  tick(f.room, 9000);
  assert.equal(f.room.drawerId, f.guest.id);
  send(f.room, f.guest, 'choose', { index: 0 }, 9001);
  send(f.room, f.host, 'chat', { text: f.room.word }, 10_000);
  tick(f.room, 16_000);
  assert.equal(f.room.phase, 'finished');
  assert.ok(f.host.score > 50 && f.guest.score > score);
});

test('disconnect and durable-state reload preserve identity, board, and scores', () => {
  const f = fixture(); drawing(f);
  const ink = stroke();
  send(f.room, f.host, 'stroke', { stroke: ink }, 3000);
  f.host.score = 150;
  disconnect(f.room, f.host.id, 4000);
  disconnect(f.room, f.guest.id, 4001);
  assert.equal(f.room.phase, 'paused');
  const restored = JSON.parse(JSON.stringify(f.room));
  const host = joinRoom(restored, { token: f.host.token }, 80_000);
  assert.equal(host.id, f.host.id);
  assert.equal(host.score, 150);
  assert.equal(restored.phase, 'paused');
  joinRoom(restored, { token: f.guest.token }, 81_000);
  assert.equal(restored.phase, 'drawing');
  assert.deepEqual(restored.board, [ink]);
  assert.ok(restored.deadline > 81_000);
  const before = restored.board.length;
  send(restored, host, 'stroke', { stroke: ink }, 82_000);
  assert.equal(restored.board.length, before);
});

test('short network loss gives a drawer time to return; a long loss advances the turn', () => {
  const f = fixture(); drawing(f);
  disconnect(f.room, f.host.id, 3000);
  tick(f.room, 20_000);
  assert.equal(f.room.phase, 'drawing');
  joinRoom(f.room, { token: f.host.token }, 21_000);
  assert.equal(f.room.disconnectDeadline, null);
  disconnect(f.room, f.host.id, 22_000);
  tick(f.room, 52_000);
  assert.equal(f.room.phase, 'reveal');
});

test('host handoff, explicit leave, and rejoining an empty room work', () => {
  const f = fixture();
  disconnect(f.room, f.host.id, 1000);
  assert.equal(f.room.ownerId, f.guest.id);
  send(f.room, f.guest, 'leave');
  assert.equal(f.room.ownerId, null);
  joinRoom(f.room, { token: f.host.token }, 2000);
  assert.equal(f.room.ownerId, f.host.id);
});

test('role, stale-turn, custom-word, and malformed-stroke validation protect state', () => {
  const f = fixture();
  assert.throws(() => send(f.room, f.guest, 'start'), /host/);
  assert.throws(() => send(f.room, f.host, 'settings', { settings: { ...f.room.settings, customOnly: true, customWords: 'cat,cat,,, ' } }), /5 different/);
  drawing(f);
  assert.throws(() => send(f.room, f.guest, 'stroke', { stroke: stroke() }), /not your/);
  assert.throws(() => send(f.room, f.host, 'stroke', { turnId: 'old-turn', stroke: stroke() }), /not your/);
  assert.throws(() => validateStroke({ ...stroke(), points: [[NaN, 5]] }), /not valid/);
  assert.throws(() => validateStroke({ ...stroke(), points: [[5, 751]] }), /not valid/);
  assert.throws(() => validateStroke({ ...stroke(), points: new Array(2049).fill([1, 1]) }), /not valid/);
  assert.equal(f.room.board.length, 0);
  assert.throws(() => send(f.room, f.guest, 'chat', { turnId: 'old-turn', text: f.room.word }), /turn changed/);
});

test('hints, word-choice deadlines, and expiry use server time', () => {
  const f = fixture(); send(f.room, f.host, 'start');
  assert.equal(nextAlarm(f.room, 1000), 21_000);
  tick(f.room, 21_000);
  assert.equal(f.room.phase, 'drawing');
  tick(f.room, 75_000);
  assert.ok(f.room.hintsRevealed > 0);
  assert.ok(view(f.room, f.guest.id).mask.includes('_'));
  tick(f.room, 101_000);
  assert.equal(f.room.phase, 'reveal');
  assert.throws(() => joinRoom(createRoom('EXPIRED', 0), { name: 'Late' }, ROOM_TTL + 1), /expired/);
});

test('joining mid-game adds the new player to the rotation without leaking the answer', () => {
  const f = fixture(); drawing(f);
  const newcomer = joinRoom(f.room, { name: 'Third friend' }, 3000);
  assert.ok(f.room.order.includes(newcomer.id));
  assert.equal(view(f.room, newcomer.id).word, '');
});

test('a short word does not schedule repeated alarms for impossible extra hints', () => {
  const f = fixture();
  send(f.room, f.host, 'settings', { settings: { ...f.room.settings, hints: 3, customOnly: true, customWords: 'ax,be,do,ex,go' } });
  drawing(f);
  tick(f.room, 70_000);
  assert.equal(f.room.hintsRevealed, 1);
  assert.equal(nextAlarm(f.room, 70_000), f.room.deadline);
});

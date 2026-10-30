import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { connect, newRoom } from '../tests/socket-client.mjs';

const started = performance.now();
const groups = [];
const clients = new Set();
const fanoutLatency = [];
const acknowledgementLatency = [];
const recoveredSeats = [];
const sentAt = new Map();
const observe = client => {
  client.socket.on('message', bytes => {
    const raw = bytes.toString(); if (raw === 'pong') return;
    const message = JSON.parse(raw);
    if (message.type === 'stroke' && sentAt.has(message.stroke.id)) fanoutLatency.push(performance.now() - sentAt.get(message.stroke.id));
  });
};
try {
  for (let r = 0; r < 5; r++) {
    const code = await newRoom();
    const host = await connect(code, { name: `Artist ${r + 1}` }); clients.add(host);
    await host.command('settings', { settings: { rounds: 1, drawTime: 120, maxPlayers: 20, hints: 2, wordCount: 3, difficulty: 'normal' } });
    const guests = await Promise.all(Array.from({ length: 19 }, (_, i) => connect(code, { name: `Friend ${r + 1}-${i + 1}`, avatar: i % 8 })));
    for (const guest of guests) { clients.add(guest); observe(guest); }
    await host.until(m => m.type === 'state' && m.room.players.length === 20);
    groups.push({ code, host, guests });
  }
  assert.equal(clients.size, 100);
  console.log('Connected 100 clients across 5 independent 20-player rooms.');
  for (const group of groups) {
    await group.host.command('start');
    const choosing = await group.host.until(m => m.type === 'state' && m.room.phase === 'choosing');
    group.turnId = choosing.room.turnId;
    await group.host.command('choose', { index: 0, turnId: group.turnId });
    const drawing = await group.host.until(m => m.type === 'state' && m.room.phase === 'drawing');
    group.word = drawing.room.word;
  }
  let recoveryMs = 0;
  for (let n = 0; n < 60; n++) {
    await Promise.all(groups.map(async group => {
      const stroke = { id: crypto.randomUUID(), color: '#252a34', tool: 'pen', size: 4,
        points: Array.from({ length: 20 }, (_, p) => [20 + n * 10 + p, 20 + p * 4]) };
      group.lastStrokeId = stroke.id; sentAt.set(stroke.id, performance.now());
      const before = performance.now();
      await group.host.command('stroke', { stroke, turnId: group.turnId });
      acknowledgementLatency.push(performance.now() - before);
    }));
    if (n === 24) {
      const recoveryStart = performance.now();
      await Promise.all(groups.map(async group => {
        const dropped = group.guests.slice(0, 10);
        for (const client of dropped) { client.close(); clients.delete(client); }
        const restored = await Promise.all(dropped.map(async previous => {
          const client = await connect(group.code, { token: previous.welcome.token });
          assert.equal(client.welcome.room.youId, previous.welcome.room.youId);
          assert.equal(client.welcome.room.players.length, 20);
          assert.equal(client.welcome.board.length, 25);
          assert.equal(client.welcome.room.word, '');
          recoveredSeats.push(client.welcome.room.youId);
          clients.add(client); observe(client); return client;
        }));
        group.guests.splice(0, 10, ...restored);
      }));
      recoveryMs = performance.now() - recoveryStart;
      console.log('Recovered 50 dropped connections with their original seats and drawings.');
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  for (const group of groups) {
    await Promise.all(group.guests.map(client => client.until(m => m.type === 'stroke' && m.stroke.id === group.lastStrokeId)));
    const player = group.guests[0];
    await player.command('chat', { turnId: group.turnId, text: group.word });
    const state = await player.until(m => m.type === 'state' && m.room.players.some(p => p.id === player.welcome.room.youId && p.score > 0));
    const score = state.room.players.find(p => p.id === player.welcome.room.youId).score;
    player.close(); clients.delete(player);
    const restored = await connect(group.code, { token: player.welcome.token }); clients.add(restored);
    assert.equal(restored.welcome.room.players.find(p => p.id === player.welcome.room.youId).score, score);
  }
  assert.equal(clients.size, 100);
  assert.equal(recoveredSeats.length, 50);
  const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = percentile => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))] * 100) / 100;
    return { samples: sorted.length, p50_ms: at(.5), p95_ms: at(.95), p99_ms: at(.99), max_ms: Math.round(sorted.at(-1) * 100) / 100 };
  };
  const report = {
    testedAt: new Date().toISOString(), environment: 'Local Windows Cloudflare Wrangler/Miniflare emulator; not deployed-provider capacity or Internet latency.',
    node: process.version, concurrentClients: 100, rooms: 5, clientsPerRoom: 20, activeDrawers: 5,
    completedStrokes: 300, pointsPerStroke: 20, restoredConnections: 50, restoredScoredConnections: 5,
    drawingFanout: stats(fanoutLatency), commandAcknowledgements: stats(acknowledgementLatency),
    reconnectWaveMs: Math.round(recoveryMs), durationSeconds: Math.round((performance.now() - started) / 1000),
    limitations: 'Short synthetic local test. Does not measure phone hardware, geographically distant players, long-running free-tier usage, quota exhaustion, or provider outages.',
  };
  assert.ok(report.drawingFanout.samples >= 5000);
  assert.ok(report.drawingFanout.p95_ms < 1500, 'Local fanout exceeded 1.5 seconds at p95');
  await mkdir('docs/verification', { recursive: true });
  await writeFile('docs/verification/load-100-clients.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { for (const client of clients) client.close(); }

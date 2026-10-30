import { DurableObject } from 'cloudflare:workers';
import { createRoom, joinRoom, disconnect, action, tick, nextAlarm, view, validateStroke } from './game.mjs';

const CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const creationWindows = new Map();
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
function allowed(request, env) {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).includes(request.headers.get('Origin'));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'skkrible-rooms' });
    if (!allowed(request, env)) return json({ error: 'This website is not allowed to connect.' }, 403);
    const cors = { 'Access-Control-Allow-Origin': request.headers.get('Origin'), Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      // shortcut: per-instance creation throttle; use a shared limiter before public matchmaking.
      const key = request.headers.get('CF-Connecting-IP') ?? 'local';
      const now = Date.now();
      const window = creationWindows.get(key);
      const next = !window || now - window.at > 60_000 ? { at: now, count: 1 } : { at: window.at, count: window.count + 1 };
      creationWindows.set(key, next);
      if (creationWindows.size > 2048) creationWindows.delete(creationWindows.keys().next().value);
      if (next.count > 8) return json({ error: 'A few rooms already! Wait a minute before creating another.' }, 429, cors);
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < 3; i++) {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => alphabet[b % alphabet.length]).join('');
        const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(`https://room/create?code=${code}`, { method: 'POST' }));
        if (response.ok) return json({ code }, 201, cors);
      }
      return json({ error: 'Couldn’t create a room. Please try again.' }, 503, cors);
    }
    const info = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]+)$/);
    if (request.method === 'GET' && info && CODE.test(info[1])) {
      const result = await env.ROOMS.get(env.ROOMS.idFromName(info[1])).fetch(new Request('https://room/info'));
      return new Response(result.body, { status: result.status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]+)\/socket$/);
    if (request.method === 'GET' && match && CODE.test(match[1]) && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
    }
    return json({ error: 'Room endpoint not found.' }, 404, cors);
  },
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    const saved = this.sql.exec('SELECT data FROM room_state WHERE id = 1').toArray()[0];
    this.room = saved ? JSON.parse(saved.data) : null;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    if (this.room) {
      const connected = new Set(this.ctx.getWebSockets().filter(s => s.readyState === 1).map(s => s.deserializeAttachment()?.playerId));
      for (const player of this.room.players) {
        if (player.connected && !connected.has(player.id)) disconnect(this.room, player.id);
        else player.connected = connected.has(player.id);
      }
    }
  }
  save() {
    this.sql.exec('INSERT INTO room_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(this.room));
  }
  send(socket, message) {
    try { socket.send(JSON.stringify(message)); } catch { /* A closing socket recovers through its next snapshot. */ }
  }
  broadcast(message, except = null) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except && socket.deserializeAttachment()?.playerId) this.send(socket, message);
    }
  }
  states(except = null) {
    for (const socket of this.ctx.getWebSockets()) {
      const id = socket.deserializeAttachment()?.playerId;
      if (socket !== except && id && this.room.players.some(p => p.id === id)) this.send(socket, { type: 'state', room: view(this.room, id) });
    }
  }
  snapshot(socket) {
    const id = socket.deserializeAttachment()?.playerId;
    this.send(socket, { type: 'snapshot', room: view(this.room, id), board: this.room.board });
  }
  async schedule() {
    if (!this.room) return;
    let next = nextAlarm(this.room);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const attachment = socket.deserializeAttachment();
      if (!attachment?.playerId) next = Math.min(next, attachment.acceptedAt + 15_000);
    }
    const current = await this.ctx.storage.getAlarm();
    if (!current || Math.abs(current - next) > 100) await this.ctx.storage.setAlarm(next);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create') {
      if (this.room) return json({ error: 'Code collision.' }, 409);
      const code = url.searchParams.get('code');
      if (!CODE.test(code)) return json({ error: 'Invalid room code.' }, 400);
      this.room = createRoom(code);
      this.save();
      await this.schedule();
      return json({ code }, 201);
    }
    if (!this.room || Date.now() >= this.room.expiresAt) return json({ error: 'This room is missing or expired.' }, 404);
    if (url.pathname === '/info') return json({ code: this.room.code, available: true });
    if (this.ctx.getWebSockets().length >= 40) return json({ error: 'Too many room connections.' }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ acceptedAt: Date.now(), playerId: null, windowAt: 0, count: 0, inkCount: 0 });
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket, data) {
    const attachment = socket.deserializeAttachment();
    if (!this.room || Date.now() >= this.room.expiresAt) { socket.close(4004, 'Room expired'); return; }
    if (typeof data !== 'string' || data.length > 50_000) { socket.close(1009, 'Message is too large'); return; }
    const now = Date.now();
    if (now - attachment.windowAt >= 1000) { attachment.windowAt = now; attachment.count = 0; attachment.inkCount = 0; }
    attachment.count++;
    socket.serializeAttachment(attachment);
    if (attachment.count > 50) { this.send(socket, { type: 'error', message: 'Slow down for a moment.' }); return; }
    let message;
    try { message = JSON.parse(data); } catch { this.send(socket, { type: 'error', message: 'Invalid message.' }); return; }
    if (!message || typeof message !== 'object') return;
    const original = this.room;
    try {
      if (tick(this.room, now)) { this.save(); this.states(); }
      if (!attachment.playerId) {
        if (message.type !== 'join') throw new Error('Join the room before playing.');
        this.room = structuredClone(this.room);
        const player = joinRoom(this.room, message, now);
        this.save();
        attachment.playerId = player.id;
        socket.serializeAttachment(attachment);
        for (const other of this.ctx.getWebSockets()) {
          if (other !== socket && other.deserializeAttachment()?.playerId === player.id) other.close(4001, 'Opened in another tab');
        }
        this.send(socket, { type: 'welcome', token: player.token, room: view(this.room, player.id), board: this.room.board });
        this.states(socket);
      } else if (message.type === 'sync') {
        this.snapshot(socket);
      } else if (message.type === 'ink') {
        if (attachment.count > 25 || this.room.phase !== 'drawing' || this.room.drawerId !== attachment.playerId || message.turnId !== this.room.turnId) return;
        const ink = validateStroke(message.stroke);
        if (ink.points.length > 64) return;
        this.broadcast({ type: 'ink', turnId: this.room.turnId, stroke: ink }, socket);
      } else {
        this.room = structuredClone(this.room);
        const result = action(this.room, attachment.playerId, message, now);
        if (!result.duplicate) this.save();
        for (const event of result.events) {
          if (event.type === 'removed') {
            for (const other of this.ctx.getWebSockets()) if (other.deserializeAttachment()?.playerId === event.playerId) other.close(4003, 'Removed by room vote');
          } else this.broadcast(event);
        }
        this.send(socket, { type: 'ack', id: message.id, feedback: result.feedback });
        if (!['stroke', 'undo', 'clear'].includes(message.type) && !result.duplicate) this.states();
        if (message.type === 'leave') socket.close(4002, 'Left the room');
      }
    } catch (error) {
      this.room = original;
      this.send(socket, { type: 'error', id: message.id, message: error.message || 'Couldn’t save that change. Try reconnecting.' });
    }
    await this.schedule();
  }
  async webSocketClose(socket) {
    const id = socket.deserializeAttachment()?.playerId;
    if (this.room && id && !this.ctx.getWebSockets().some(other => other !== socket && other.readyState === 1 && other.deserializeAttachment()?.playerId === id)) {
      disconnect(this.room, id);
      this.save();
      this.states();
    }
    try { socket.close(); } catch { /* The peer may have already completed the close handshake. */ }
    await this.schedule();
  }
  async webSocketError(socket) { await this.webSocketClose(socket); }
  async alarm() {
    if (!this.room) return;
    if (Date.now() >= this.room.expiresAt) {
      for (const socket of this.ctx.getWebSockets()) socket.close(4004, 'Room expired');
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment();
      if (!a.playerId && Date.now() - a.acceptedAt >= 15_000) socket.close(4000, 'Join timed out');
    }
    if (tick(this.room)) { this.save(); this.states(); }
    await this.schedule();
  }
}

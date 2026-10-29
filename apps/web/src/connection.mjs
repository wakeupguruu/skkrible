export const BACKEND = (import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '')).replace(/\/$/, '');
export function readStorage(key, fallback = null) {
  try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function store(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* This tab can still play when browser storage is unavailable. */ } }

export class RoomConnection {
  constructor(code, profile, onFrame, onStatus) {
    this.code = code; this.profile = profile; this.onFrame = onFrame; this.onStatus = onStatus;
    this.token = readStorage(`seat:${code}`);
    this.pending = readStorage(`commands:${code}`, []).slice(-100);
    this.stopped = false; this.ready = false; this.attempt = 0; this.lastSeen = Date.now();
    this.wake = () => {
      if (this.stopped) return;
      if (!this.ready) { clearTimeout(this.retry); this.open(); }
      else if (Date.now() - this.lastSeen > 45_000) this.socket.close();
      else this.socket.send(JSON.stringify({ type: 'sync' }));
    };
    this.visible = () => { if (document.visibilityState === 'visible') this.wake(); };
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.visible);
    this.heartbeat = setInterval(() => {
      if (!this.ready) return;
      if (Date.now() - this.lastSeen > 45_000) this.socket.close();
      else this.socket.send('ping');
    }, 15_000);
    this.open();
  }
  savePending() { store(`commands:${this.code}`, this.pending); }
  open() {
    if (this.stopped || this.socket?.readyState === WebSocket.CONNECTING || this.socket?.readyState === WebSocket.OPEN) return;
    this.onStatus(this.attempt ? 'reconnecting' : 'connecting');
    const socket = this.socket = new WebSocket(`${BACKEND.replace(/^http/, 'ws')}/api/rooms/${this.code}/socket`);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'join', token: this.token, ...this.profile }));
    socket.onmessage = event => {
      if (this.stopped || socket !== this.socket) return;
      this.lastSeen = Date.now();
      if (event.data === 'pong') return;
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.type === 'welcome') {
        this.token = frame.token; store(`seat:${this.code}`, this.token);
        this.ready = true; this.attempt = 0;
        this.pending = this.pending.filter(command => !command.turnId || command.turnId === frame.room.turnId);
        this.savePending();
        this.onStatus('connected');
        this.onFrame(frame);
        for (const command of this.pending) socket.send(JSON.stringify(command));
        return;
      }
      if ((frame.type === 'ack' || frame.type === 'error') && frame.id) {
        this.pending = this.pending.filter(command => command.id !== frame.id); this.savePending();
      }
      if (frame.type === 'error' && !this.ready) {
        this.stopped = true;
        socket.close();
        this.onStatus('stopped');
      }
      this.onFrame(frame);
    };
    socket.onerror = () => {};
    socket.onclose = event => {
      if (this.stopped || socket !== this.socket) return;
      this.ready = false;
      if ([4001, 4002, 4003, 4004].includes(event.code)) {
        this.stopped = true; this.onStatus('stopped');
        this.onFrame({ type: 'error', message: event.reason || 'This room connection has ended.' });
      }
      if (this.stopped) return;
      this.onStatus('reconnecting');
      const delay = Math.min(8000, 400 * 2 ** Math.min(this.attempt++, 5)) * (0.7 + Math.random() * 0.6);
      this.retry = setTimeout(() => this.open(), delay);
    };
  }
  command(type, extra = {}) {
    const message = { type, id: crypto.randomUUID(), ...extra };
    if (this.pending.length >= 100) { this.onFrame({ type: 'error', message: 'Wait for your connection to catch up before sending more.' }); return null; }
    this.pending.push(message); this.savePending();
    if (this.ready && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    return message.id;
  }
  ink(stroke, turnId) {
    if (this.ready && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'ink', turnId, stroke }));
  }
  close(forget = false) {
    this.stopped = true; this.ready = false;
    clearTimeout(this.retry); clearInterval(this.heartbeat);
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.visible);
    this.socket?.close();
    if (forget) { store(`seat:${this.code}`, null); store(`commands:${this.code}`, []); }
  }
}

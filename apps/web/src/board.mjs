export const COLORS = ['#252a34', '#ffffff', '#868e96', '#f03e3e', '#f76707', '#fcc419', '#40c057', '#12b886', '#15aabf', '#228be6', '#7950f2', '#be4bdb', '#f06595', '#a66b46'];
export const COLOR_NAMES = ['Ink', 'White', 'Gray', 'Red', 'Orange', 'Yellow', 'Green', 'Mint', 'Teal', 'Blue', 'Purple', 'Violet', 'Pink', 'Brown'];

function draw(context, stroke) {
  if (!stroke.points.length) return;
  context.strokeStyle = context.fillStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
  context.lineWidth = stroke.size; context.lineCap = 'round'; context.lineJoin = 'round';
  if (stroke.points.length === 1) {
    context.beginPath(); context.arc(...stroke.points[0], stroke.size / 2, 0, Math.PI * 2); context.fill();
  } else {
    context.beginPath(); context.moveTo(...stroke.points[0]);
    for (let i = 1; i < stroke.points.length; i++) context.lineTo(...stroke.points[i]);
    context.stroke();
  }
}
export class DrawingBoard {
  constructor(canvas, overlay, onStroke, onInk) {
    this.canvas = canvas; this.overlay = overlay; this.context = canvas.getContext('2d'); this.inkContext = overlay.getContext('2d');
    this.onStroke = onStroke; this.onInk = onInk; this.strokes = []; this.pending = new Map(); this.previews = new Map();
    this.color = COLORS[0]; this.size = 10; this.tool = 'pen'; this.enabled = false; this.turnId = null;
    overlay.addEventListener('pointerdown', event => {
      if (!this.enabled || !event.isPrimary || event.button !== 0 || this.active) return;
      event.preventDefault(); overlay.setPointerCapture(event.pointerId); this.pointerId = event.pointerId;
      this.begin(this.point(event)); this.paintOverlay();
    });
    overlay.addEventListener('pointermove', event => {
      if (!this.active || event.pointerId !== this.pointerId) return;
      const point = this.point(event); const last = this.active.points.at(-1);
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 2) return;
      this.active.points.push(point);
      if (this.active.points.length >= 2048) { this.finish(); this.begin(point); }
      if (performance.now() - this.lastInk > 65) this.flushInk();
      this.paintOverlay();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) overlay.addEventListener(type, event => {
      if (event.pointerId === this.pointerId) this.finish();
    });
    this.redraw();
  }
  point(event) {
    const rect = this.overlay.getBoundingClientRect();
    return [Math.round(Math.min(1000, Math.max(0, (event.clientX - rect.left) / rect.width * 1000))),
      Math.round(Math.min(750, Math.max(0, (event.clientY - rect.top) / rect.height * 750)))];
  }
  begin(point) {
    this.active = { id: crypto.randomUUID(), color: this.color, size: this.size, tool: this.tool, points: [point] };
    this.inkIndex = 0; this.lastInk = 0;
  }
  flushInk() {
    if (!this.active) return;
    this.onInk({ ...this.active, points: this.active.points.slice(Math.max(0, this.inkIndex - 1)).slice(-64) }, this.turnId);
    this.inkIndex = this.active.points.length; this.lastInk = performance.now();
  }
  finish() {
    if (!this.active) return;
    const stroke = this.active; this.active = null;
    if (this.onStroke(stroke, this.turnId)) this.pending.set(stroke.id, stroke);
    this.paintOverlay();
  }
  enable(enabled, turnId, discard = false) {
    if (turnId !== this.turnId) {
      this.active = null; this.previews.clear(); this.pending.clear(); this.strokes = []; this.turnId = turnId; this.redraw();
    } else if (!enabled && this.active) {
      if (discard) this.active = null; else this.finish();
    }
    this.enabled = enabled; this.overlay.style.cursor = enabled ? 'crosshair' : 'default';
    this.overlay.style.touchAction = enabled ? 'none' : 'pan-y';
    this.paintOverlay();
  }
  snapshot(strokes, turnId, pending = []) {
    if (turnId !== this.turnId) this.active = null;
    this.turnId = turnId; this.strokes = strokes; this.previews.clear();
    const known = new Set(strokes.map(s => s.id));
    this.pending = new Map(pending.filter(s => !known.has(s.id)).map(s => [s.id, s]));
    this.redraw();
  }
  commit(stroke, turnId) {
    if (turnId !== this.turnId) return;
    if (!this.strokes.some(s => s.id === stroke.id)) { this.strokes.push(stroke); draw(this.context, stroke); }
    this.pending.delete(stroke.id); this.previews.delete(stroke.id); this.paintOverlay();
  }
  preview(stroke, turnId) {
    if (turnId !== this.turnId || this.strokes.some(s => s.id === stroke.id)) return;
    const previous = this.previews.get(stroke.id);
    const value = previous ? { ...stroke, points: [...previous.points, ...stroke.points].slice(-2048) } : stroke;
    if (this.previews.size >= 12 && !previous) this.previews.delete(this.previews.keys().next().value);
    this.previews.set(stroke.id, value); this.paintOverlay();
  }
  redraw() {
    this.context.fillStyle = '#ffffff'; this.context.fillRect(0, 0, 1000, 750);
    for (const stroke of this.strokes) draw(this.context, stroke);
    this.paintOverlay();
  }
  paintOverlay() {
    if (this.paintFrame) return;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = null; this.inkContext.clearRect(0, 0, 1000, 750);
      for (const stroke of this.previews.values()) draw(this.inkContext, stroke);
      for (const stroke of this.pending.values()) draw(this.inkContext, stroke);
      if (this.active) draw(this.inkContext, this.active);
    });
  }
}

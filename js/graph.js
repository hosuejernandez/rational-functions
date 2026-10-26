// Canvas grapher for a polynomial or rational function: the curve (broken at vertical
// asymptotes), dashed asymptotes, open circles at holes, and labeled intercepts.

const COLORS = {
  curve: '#2563eb', asym: '#ea580c', zero: '#15803d', yint: '#7c3aed', hole: '#0f172a',
  turn: '#64748b', grid: '#e5e7eb', axis: '#475569', text: '#334155', point: '#0f172a', hover: '#f59e0b',
};

function niceStep(span) {
  const raw = span / 8;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

const fmtTick = v => {
  const r = Math.round(v * 1e6) / 1e6;
  return Math.abs(r) >= 1e5 || (Math.abs(r) < 1e-3 && r !== 0) ? r.toExponential(1) : `${r}`;
};
const fmtNum = v => (isFinite(v) ? `${Math.round(v * 1000) / 1000}` : 'undefined');

export class Graph {
  constructor(canvas, readout) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.readout = readout;
    this.view = { x0: -10, x1: 10, y0: -10, y1: 10 };
    this.home = { ...this.view };
    this.data = null;
    this.hover = null;
    this.showAsymptotes = true;
    this.showLabels = true;
    this.bindEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  // data: { f, vas: [x], holes: [{x, y}], zeros: [x], yint: y|null, ha: y|null, slant: [b, m]|null,
  //         turning: [{x, y}], name, v }
  set(data) {
    this.data = data;
    this.home = this.autoView();
    this.view = { ...this.home };
    this.hover = null;
    this.draw();
  }

  clear() { this.data = null; this.draw(); }

  autoView() {
    const d = this.data;
    const xs = [0, ...d.vas, ...d.holes.map(h => h.x), ...d.zeros, ...d.turning.map(t => t.x)].filter(isFinite);
    let lo = Math.min(...xs), hi = Math.max(...xs);
    const pad = Math.max(3, (hi - lo) * 0.5);
    let x0 = lo - pad, x1 = hi + pad;
    if (x1 - x0 < 12) { const c = (x0 + x1) / 2; x0 = c - 6; x1 = c + 6; }
    // y-range from the typical values of f, staying away from the vertical asymptotes
    const ys = [];
    const away = x => d.vas.every(a => Math.abs(x - a) > (x1 - x0) * 0.03);
    for (let i = 0; i <= 600; i++) {
      const x = x0 + (x1 - x0) * i / 600;
      if (!away(x)) continue;
      const y = d.f(x);
      if (isFinite(y)) ys.push(y);
    }
    ys.sort((a, b) => a - b);
    let y0 = -5, y1 = 5;
    if (ys.length > 10) {
      y0 = ys[Math.floor(ys.length * 0.05)]; y1 = ys[Math.ceil(ys.length * 0.95) - 1];
    }
    const keys = [0, d.yint, d.ha, ...d.holes.map(h => h.y), ...d.turning.map(t => t.y)].filter(v => v !== null && isFinite(v));
    for (const k of keys) { y0 = Math.min(y0, k); y1 = Math.max(y1, k); }
    if (d.vas.length) { const span = Math.max(y1 - y0, 4); y0 -= span * 0.4; y1 += span * 0.4; }
    const ypad = Math.max((y1 - y0) * 0.15, 1);
    return { x0, x1, y0: y0 - ypad, y1: y1 + ypad };
  }

  reset() { this.view = { ...this.home }; this.draw(); }

  zoom(factor, cx, cy) {
    const v = this.view;
    if (cx === undefined) { cx = (v.x0 + v.x1) / 2; cy = (v.y0 + v.y1) / 2; }
    this.view = { x0: cx + (v.x0 - cx) * factor, x1: cx + (v.x1 - cx) * factor, y0: cy + (v.y0 - cy) * factor, y1: cy + (v.y1 - cy) * factor };
    this.draw();
  }

  // ----- coordinates -----

  sx(x) { return (x - this.view.x0) / (this.view.x1 - this.view.x0) * this.W; }
  sy(y) { return this.H - (y - this.view.y0) / (this.view.y1 - this.view.y0) * this.H; }
  wx(px) { return this.view.x0 + px / this.W * (this.view.x1 - this.view.x0); }
  wy(py) { return this.view.y0 + (this.H - py) / this.H * (this.view.y1 - this.view.y0); }

  // ----- events -----

  bindEvents() {
    const c = this.canvas;
    let drag = null;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => {
      const [px, py] = pos(e);
      drag = { px, py, view: { ...this.view }, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      const [px, py] = pos(e);
      if (drag) {
        const dx = (px - drag.px) / this.W * (drag.view.x1 - drag.view.x0);
        const dy = (py - drag.py) / this.H * (drag.view.y1 - drag.view.y0);
        if (Math.abs(px - drag.px) + Math.abs(py - drag.py) > 3) drag.moved = true;
        if (drag.moved && e.pointerType === 'mouse') {
          this.view = { x0: drag.view.x0 - dx, x1: drag.view.x1 - dx, y0: drag.view.y0 + dy, y1: drag.view.y1 + dy };
        }
      }
      this.hover = { px, py };
      this.draw();
    });
    c.addEventListener('pointerup', () => { drag = null; });
    c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { this.hover = null; this.draw(); } });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const [px, py] = pos(e);
      this.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, this.wx(px), this.wy(py));
    }, { passive: false });
  }

  // ----- drawing -----

  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    if (!this.W || !this.H) return;
    if (c.width !== Math.round(this.W * dpr) || c.height !== Math.round(this.H * dpr)) {
      c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.W, this.H);
    this.drawGrid();
    if (!this.data) { this.setReadout(''); return; }
    this.drawFunction();
  }

  drawGrid() {
    const ctx = this.ctx, v = this.view;
    const sx = niceStep(v.x1 - v.x0), sy = niceStep(v.y1 - v.y0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) { const p = Math.round(this.sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, this.H); }
    for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) { const p = Math.round(this.sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(this.W, p); }
    ctx.stroke();
    const ax = Math.min(Math.max(this.sy(0), 0), this.H), ay = Math.min(Math.max(this.sx(0), 0), this.W);
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, ax); ctx.lineTo(this.W, ax);
    ctx.moveTo(ay, 0); ctx.lineTo(ay, this.H);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ly = ax > this.H - 16 ? this.H - 14 : ax + 3;
    for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) {
      if (Math.abs(x) < sx / 2) continue;
      ctx.fillText(fmtTick(x), this.sx(x), ly);
    }
    ctx.textAlign = ay > this.W - 40 ? 'right' : 'left'; ctx.textBaseline = 'middle';
    const lx = ay > this.W - 40 ? this.W - 4 : ay + 4;
    for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) {
      if (Math.abs(y) < sy / 2) continue;
      ctx.fillText(fmtTick(y), lx, this.sy(y));
    }
  }

  // The curve as a polyline that never connects across a vertical asymptote.
  plot(g, breaks, color, width, dash = []) {
    const ctx = this.ctx, n = Math.ceil(this.W * 2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    let prev = null;
    const limit = this.H * 50;
    for (let i = 0; i <= n; i++) {
      const x = this.wx(i / n * this.W), y = g(x);
      let pt = isFinite(y) ? [this.sx(x), Math.max(-limit, Math.min(limit, this.sy(y)))] : null;
      const crosses = prev && breaks.some(b => (prev.x - b) * (x - b) <= 0);
      if (pt && prev && !crosses) ctx.lineTo(pt[0], pt[1]);
      else if (pt) ctx.moveTo(pt[0], pt[1]);
      if (pt) pt.x = x;
      prev = pt;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawFunction() {
    const d = this.data, ctx = this.ctx, v = this.view;
    if (this.showAsymptotes) {
      ctx.strokeStyle = COLORS.asym; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath();
      for (const a of d.vas) { const X = this.sx(a); ctx.moveTo(X, 0); ctx.lineTo(X, this.H); }
      if (d.ha !== null) { const Y = this.sy(d.ha); ctx.moveTo(0, Y); ctx.lineTo(this.W, Y); }
      if (d.slant) {
        const [b, m] = d.slant;
        ctx.moveTo(this.sx(v.x0), this.sy(b + m * v.x0)); ctx.lineTo(this.sx(v.x1), this.sy(b + m * v.x1));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.plot(d.f, d.vas, COLORS.curve, 3);

    // points
    const placed = [];
    const mark = (x, y, color, label, open = false) => {
      const X = this.sx(x), Y = this.sy(y);
      if (X < -10 || X > this.W + 10 || Y < -10 || Y > this.H + 10) return;
      ctx.beginPath(); ctx.arc(X, Y, open ? 6 : 5, 0, 2 * Math.PI);
      if (open) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(); }
      else { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      if (!this.showLabels || !label) return;
      ctx.font = '600 12px system-ui, sans-serif';
      const w = ctx.measureText(label).width + 10;
      for (const LY of [Y - 12, Y + 22, Y - 30]) {
        const LX = Math.min(Math.max(X, w / 2 + 2), this.W - w / 2 - 2);
        if (placed.some(q => Math.abs(q.x - LX) < (q.w + w) / 2 + 4 && Math.abs(q.y - LY) < 20)) continue;
        placed.push({ x: LX, y: LY, w });
        this.label(label, LX, LY, color);
        return;
      }
    };
    for (const t of d.turning) if (!t.hole) mark(t.x, t.y, COLORS.turn, `(${fmtNum(t.x)}, ${fmtNum(t.y)})`);
    for (const z of d.zeros) mark(z, 0, COLORS.zero, `(${fmtNum(z)}, 0)`);
    if (d.yint !== null && !d.zeros.some(z => Math.abs(z) < 1e-12)) mark(0, d.yint, COLORS.yint, `(0, ${fmtNum(d.yint)})`);
    for (const h of d.holes) mark(h.x, h.y, COLORS.hole, `hole (${fmtNum(h.x)}, ${fmtNum(h.y)})`, true);

    // point under the pointer
    if (this.hover) {
      const x = this.wx(this.hover.px), y = d.f(x);
      const hole = d.holes.find(h => Math.abs(this.sx(h.x) - this.hover.px) < 3);
      if (hole) { this.setReadout(`${d.v} = ${fmtNum(hole.x)}: hole, ${d.name}(${d.v}) is undefined here`); return; }
      if (isFinite(y) && Math.abs(this.sy(y)) < this.H * 3) {
        ctx.fillStyle = COLORS.hover;
        ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), 5, 0, 2 * Math.PI); ctx.fill();
        this.setReadout(`${d.v} = ${fmtNum(x)}    ${d.name}(${d.v}) = ${fmtNum(y)}`);
        return;
      }
    }
    this.setReadout('Move over the graph to read points. Drag to pan, scroll or use ＋/－ to zoom.');
  }

  label(text, x, y, color) {
    const ctx = this.ctx;
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x - w / 2, y - 14, w, 18);
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  setReadout(t) { if (this.readout) this.readout.textContent = t; }
}

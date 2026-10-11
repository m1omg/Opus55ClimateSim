/*
 * Lightweight canvas charts: history, volatile inventories, band profile and
 * the runaway (OLR vs. surface temperature) diagram.
 */
(function (root) {
  'use strict';

  const COLORS = {
    grid: 'rgba(160,180,220,0.12)', axis: 'rgba(190,205,235,0.55)', text: 'rgba(205,215,240,0.8)',
    temp: '#ffb36b', band: 'rgba(255,179,107,0.18)', water: '#5fb7ff', pressure: '#c9a7ff', co2: '#ffd36b',
    olr: '#6fc3ff', asr: '#ffa25c', limit: 'rgba(255,120,120,0.7)', freeze: 'rgba(130,200,255,0.45)', boil: 'rgba(255,140,90,0.45)'
  };

  function fmtTime(y) {
    const a = Math.abs(y);
    if (a >= 1e9) return (y / 1e9).toFixed(a >= 1e10 ? 0 : 2).replace(/\.?0+$/, '') + ' Gyr';
    if (a >= 1e6) return (y / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + ' Myr';
    if (a >= 1e3) return (y / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + ' kyr';
    if (a >= 1) return y.toFixed(a >= 10 ? 0 : 1).replace(/\.0$/, '') + ' yr';
    return (y * 365.25).toFixed(0) + ' d';
  }

  function setup(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px "Inter", system-ui, sans-serif';
    return { ctx, w, h };
  }

  function niceTicks(lo, hi, n) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(v);
    return out;
  }

  function frame(ctx, x0, y0, x1, y1) {
    ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  }

  // -------------------------------------------------------------- history
  class History {
    constructor(max) { this.max = max || 3000; this.clear(); }
    clear() { this.pts = []; this.lastT = -Infinity; }
    push(s) {
      const span = s.t - (this.pts.length ? this.pts[0].t : s.t);
      const minGap = span / (this.max * 0.8);
      if (this.pts.length && s.t - this.lastT < minGap && s.state === this.pts[this.pts.length - 1].state) {
        this.pts[this.pts.length - 1] = s;   // overwrite the newest sample
        return;
      }
      this.pts.push(s); this.lastT = s.t;
      if (this.pts.length > this.max) {
        const keep = [this.pts[0]];
        for (let i = 1; i < this.pts.length - 1; i++) {
          if (i % 2 === 0 || this.pts[i].state !== this.pts[i - 1].state) keep.push(this.pts[i]);
        }
        keep.push(this.pts[this.pts.length - 1]);
        this.pts = keep;
      }
    }
    window(span) {
      if (!this.pts.length) return [];
      if (!span) return this.pts;
      const t1 = this.pts[this.pts.length - 1].t;
      let i = this.pts.length - 1;
      while (i > 0 && this.pts[i - 1].t >= t1 - span) i--;
      return this.pts.slice(Math.max(0, i - 1));
    }
  }

  function drawHistory(canvas, pts, states, opts) {
    const { ctx, w, h } = setup(canvas);
    const L = 40, R = 10, T = 10, B = 34;
    const x0 = L, x1 = w - R, y0 = T, y1 = h - B;
    if (pts.length < 2) {
      ctx.fillStyle = COLORS.text; ctx.fillText('Run the simulation to record history…', L + 6, h / 2);
      return;
    }
    const tA = pts[0].t, tB = Math.max(pts[pts.length - 1].t, tA + 1e-6);
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { lo = Math.min(lo, p.Tmin); hi = Math.max(hi, p.Tmax); }
    lo = Math.floor((lo - 5) / 10) * 10; hi = Math.ceil((hi + 5) / 10) * 10;
    const X = (t) => x0 + (t - tA) / (tB - tA) * (x1 - x0);
    const Y = (v) => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    // grid
    ctx.fillStyle = COLORS.text;
    for (const v of niceTicks(lo, hi, 4)) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(0), x0 - 4, Y(v) + 3);
    }
    // reference lines
    for (const [v, c] of [[273, COLORS.freeze], [373, COLORS.boil]]) {
      if (v > lo && v < hi) { ctx.strokeStyle = c; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke(); ctx.setLineDash([]); }
    }
    // min/max envelope
    ctx.fillStyle = COLORS.band;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.Tmax)) : ctx.moveTo(X(p.t), Y(p.Tmax))));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(X(pts[i].t), Y(pts[i].Tmin));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COLORS.temp; ctx.lineWidth = 1.8;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.Tmean)) : ctx.moveTo(X(p.t), Y(p.Tmean))));
    ctx.stroke();
    // state ribbon
    const ry = y1 + 4;
    for (let i = 0; i < pts.length - 1; i++) {
      const st = states[pts[i].state];
      ctx.fillStyle = st ? st.color : '#888';
      ctx.fillRect(X(pts[i].t), ry, Math.max(1, X(pts[i + 1].t) - X(pts[i].t) + 0.5), 6);
    }
    frame(ctx, x0, y0, x1, y1);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
    ctx.fillText(fmtTime(tA), x0, h - 6);
    ctx.textAlign = 'right'; ctx.fillText(fmtTime(tB), x1, h - 6);
    ctx.textAlign = 'center'; ctx.fillText('surface temperature (K) · state ribbon', (x0 + x1) / 2, h - 6);
  }

  function drawVolatiles(canvas, pts) {
    const { ctx, w, h } = setup(canvas);
    const L = 40, R = 10, T = 10, B = 26;
    const x0 = L, x1 = w - R, y0 = T, y1 = h - B;
    if (pts.length < 2) return;
    const tA = pts[0].t, tB = Math.max(pts[pts.length - 1].t, tA + 1e-6);
    const series = [
      { key: 'water', color: COLORS.water, label: 'water (oceans)' },
      { key: 'P', color: COLORS.pressure, label: 'pressure (bar)' },
      { key: 'CO2', color: COLORS.co2, label: 'CO₂ (bar)' }
    ];
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) for (const s of series) { const v = p[s.key]; if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (!isFinite(lo)) { lo = 1e-4; hi = 1; }
    lo = Math.pow(10, Math.floor(Math.log10(lo))); hi = Math.pow(10, Math.ceil(Math.log10(hi)));
    if (lo === hi) hi = lo * 10;
    const X = (t) => x0 + (t - tA) / (tB - tA) * (x1 - x0);
    const Y = (v) => y1 - (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (y1 - y0);
    ctx.fillStyle = COLORS.text;
    const dec = Math.log10(hi) - Math.log10(lo);
    const stepD = Math.max(1, Math.ceil(dec / 5));
    for (let e = Math.log10(lo); e <= Math.log10(hi); e += stepD) {
      const v = Math.pow(10, e);
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText('1e' + e, x0 - 4, Y(v) + 3);
    }
    for (const s of series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        const v = p[s.key];
        if (!(v > 0)) { started = false; continue; }
        if (started) ctx.lineTo(X(p.t), Y(v)); else { ctx.moveTo(X(p.t), Y(v)); started = true; }
      }
      ctx.stroke();
    }
    frame(ctx, x0, y0, x1, y1);
    let lx = x0 + 4;
    ctx.textAlign = 'left';
    for (const s of series) {
      ctx.fillStyle = s.color; ctx.fillRect(lx, h - 12, 10, 3);
      ctx.fillStyle = COLORS.text; ctx.fillText(s.label, lx + 14, h - 8);
      lx += ctx.measureText(s.label).width + 30;
    }
  }

  function drawProfile(canvas, model) {
    const { ctx, w, h } = setup(canvas);
    const d = model.diag, p = model.p, Cl = root.Climate;
    const L = 40, R = 10, T = 10, B = 26;
    const x0 = L, x1 = w - R, y0 = T, y1 = h - B;
    let lo = Infinity, hi = -Infinity;
    for (const b of d.bands) { lo = Math.min(lo, b.T); hi = Math.max(hi, b.T); }
    lo = Math.floor((lo - 10) / 10) * 10; hi = Math.ceil((hi + 10) / 10) * 10;
    const N = Cl.N;
    const X = (i) => x0 + (i + 0.5) / N * (x1 - x0);
    const Y = (v) => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    // ice / liquid shading
    for (let i = 0; i < N; i++) {
      const b = d.bands[i];
      const xa = x0 + i / N * (x1 - x0), xb = x0 + (i + 1) / N * (x1 - x0);
      if (b.ice > 0.5 || b.snow > 0.5) { ctx.fillStyle = 'rgba(220,235,255,0.10)'; ctx.fillRect(xa, y0, xb - xa, y1 - y0); }
      else if (b.liquid) { ctx.fillStyle = 'rgba(80,150,255,0.09)'; ctx.fillRect(xa, y0, xb - xa, y1 - y0); }
      if (b.co2ice) { ctx.fillStyle = 'rgba(200,170,255,0.18)'; ctx.fillRect(xa, y0, xb - xa, y1 - y0); }
    }
    ctx.fillStyle = COLORS.text;
    for (const v of niceTicks(lo, hi, 4)) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(0), x0 - 4, Y(v) + 3);
    }
    for (const [v, c] of [[273, COLORS.freeze], [d.boilT, COLORS.boil]]) {
      if (v > lo && v < hi) { ctx.strokeStyle = c; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (d.co2Frost > lo && d.co2Frost < hi) {
      ctx.strokeStyle = 'rgba(200,170,255,0.6)'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x0, Y(d.co2Frost)); ctx.lineTo(x1, Y(d.co2Frost)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = COLORS.temp; ctx.lineWidth = 2;
    ctx.beginPath();
    d.bands.forEach((b, i) => (i ? ctx.lineTo(X(i), Y(b.T)) : ctx.moveTo(X(i), Y(b.T))));
    ctx.stroke();
    frame(ctx, x0, y0, x1, y1);
    ctx.fillStyle = COLORS.text;
    if (p.locked) {
      ctx.textAlign = 'left'; ctx.fillText('substellar', x0, h - 8);
      ctx.textAlign = 'center'; ctx.fillText('terminator', (x0 + x1) / 2, h - 8);
      ctx.textAlign = 'right'; ctx.fillText('antistellar', x1, h - 8);
    } else {
      ctx.textAlign = 'left'; ctx.fillText('90°S', x0, h - 8);
      ctx.textAlign = 'center'; ctx.fillText('equator', (x0 + x1) / 2, h - 8);
      ctx.textAlign = 'right'; ctx.fillText('90°N', x1, h - 8);
    }
  }

  // Runaway diagram: OLR and absorbed flux vs. a uniform surface temperature.
  function drawRunaway(canvas, model, cache) {
    const { ctx, w, h } = setup(canvas);
    const L = 40, R = 10, T = 10, B = 26;
    const x0 = L, x1 = w - R, y0 = T, y1 = h - B;
    const tLo = 150, tHi = 2500;
    const lx = (t) => (Math.log(t) - Math.log(tLo)) / (Math.log(tHi) - Math.log(tLo));
    const X = (t) => x0 + lx(t) * (x1 - x0);
    const curve = cache.curve;
    let hi = 0;
    for (const c of curve) hi = Math.max(hi, Math.min(c.olr, 900), Math.min(c.asr, 900));
    hi = Math.max(350, Math.ceil(hi / 100) * 100);
    const Y = (v) => y1 - Math.min(v, hi) / hi * (y1 - y0);
    ctx.fillStyle = COLORS.text;
    for (const v of niceTicks(0, hi, 4)) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(0), x0 - 4, Y(v) + 3);
    }
    for (const t of [200, 300, 500, 1000, 2000]) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(X(t), y0); ctx.lineTo(X(t), y1); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(t + ' K', X(t), h - 8);
    }
    const lim = 282 * Math.pow(model.geo.g, 0.1);
    ctx.strokeStyle = COLORS.limit; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x0, Y(lim)); ctx.lineTo(x1, Y(lim)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLORS.limit; ctx.textAlign = 'left'; ctx.fillText('radiation limit', x0 + 4, Y(lim) - 4);
    // surplus shading where absorbed > emitted
    ctx.fillStyle = 'rgba(255,110,60,0.12)';
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1];
      if (a.asr > a.olr && b.asr > b.olr) {
        ctx.beginPath();
        ctx.moveTo(X(a.T), Y(a.asr)); ctx.lineTo(X(b.T), Y(b.asr)); ctx.lineTo(X(b.T), Y(b.olr)); ctx.lineTo(X(a.T), Y(a.olr));
        ctx.closePath(); ctx.fill();
      }
    }
    const line = (key, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      curve.forEach((c, i) => (i ? ctx.lineTo(X(c.T), Y(c[key])) : ctx.moveTo(X(c.T), Y(c[key]))));
      ctx.stroke();
    };
    line('olr', COLORS.olr);
    line('asr', COLORS.asr);
    // current state marker
    const d = model.diag;
    const mx = X(Math.min(Math.max(d.Tmean, tLo), tHi));
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(mx, Y(d.olr), 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(mx, y0); ctx.lineTo(mx, y1); ctx.stroke();
    frame(ctx, x0, y0, x1, y1);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.olr; ctx.fillText('outgoing IR', x1 - 4, y0 + 12);
    ctx.fillStyle = COLORS.asr; ctx.fillText('absorbed sunlight', x1 - 4, y0 + 26);
  }

  function runawayCurve(model) {
    const out = [];
    const n = 70;
    for (let i = 0; i < n; i++) {
      const T = 150 * Math.pow(2500 / 150, i / (n - 1));
      const c = model.curveAt(T);
      out.push({ T, olr: c.olr, asr: c.asr });
    }
    return out;
  }

  root.Charts = { History, drawHistory, drawVolatiles, drawProfile, drawRunaway, runawayCurve, fmtTime };
})(window);

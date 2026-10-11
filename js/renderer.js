/*
 * WebGL planet renderer. Draws the planet procedurally in a single fragment
 * shader: continents from 3D noise (sea level follows the ocean fraction),
 * ice, snow, clouds, lava and atmosphere all driven by the 36 model bands.
 */
(function (root) {
  'use strict';

  const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform mat3 uRot;      // body -> view
uniform mat3 uRotT;     // view -> body
uniform vec3 uLight;    // view-space direction to the star
uniform vec3 uSub;      // body-space substellar direction (locked planets)
uniform float uLocked;
uniform sampler2D uBandA;   // r: sea ice, g: land snow, b: cloud, a: glow
uniform sampler2D uBandB;   // r: green, g: dry, b: co2 frost, a: temperature
uniform float uSea;
uniform float uHasOcean;
uniform float uHasLiquid;
uniform vec3 uAtmCol;
uniform float uAtm;
uniform vec3 uVeilCol;
uniform float uVeil;
uniform vec3 uHazeCol;
uniform float uHaze;
uniform vec3 uStarCol;
uniform float uZonal;
uniform float uScale;
uniform float uStarSize;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
float fbm4(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.07 + vec3(4.1, 1.3, 7.7); a *= 0.5; }
  return s;
}
float elevation(vec3 b) {
  vec3 q = b * 1.7 + vec3(3.1, 7.4, 1.9);
  vec3 w = vec3(fbm4(q + vec3(0.0, 1.3, 2.1)), fbm4(q + vec3(5.2, 0.7, 3.3)), fbm4(q + vec3(1.1, 4.4, 0.6)));
  return fbm(q + 0.9 * (w - 0.5));
}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

vec3 blackbody(float t) {
  // t: 0..1 over ~800..2200 K
  return srgb(mix(vec3(0.55, 0.05, 0.0), mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.55), smoothstep(0.5, 1.0, t)), smoothstep(0.0, 0.5, t)));
}

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

vec3 stars(vec2 frag) {
  vec2 cell = floor(frag / 3.0);
  float h = hash(vec3(cell, 7.0));
  float s = step(0.9965, h) * (0.4 + 0.6 * hash(vec3(cell, 3.0)));
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash(vec3(cell, 11.0)));
  return tint * s * 0.9;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float m = min(uRes.x, uRes.y);
  vec2 uv = (frag - 0.5 * uRes) / (0.5 * m);
  vec2 pp = uv / uScale;
  float r2 = dot(pp, pp);

  // background: deep space with a faint nebula
  float neb = fbm4(vec3(uv * 1.3, 0.5));
  vec3 col = srgb(vec3(0.012, 0.016, 0.04)) + srgb(vec3(0.06, 0.04, 0.11)) * smoothstep(0.5, 0.85, neb) * 0.6;
  col += stars(frag);
  // star glare off-screen in the light direction
  vec2 sp = normalize(uLight.xy + vec2(1e-4)) * 1.9;
  float sd = length(uv - sp);
  col += srgb(uStarCol) * (0.35 * exp(-sd * 3.0) + 0.012 * exp(-sd * 1.2)) * uStarSize;

  vec3 L = normalize(uLight);

  if (r2 < 1.0) {
    vec3 n = vec3(pp, sqrt(1.0 - r2));
    vec3 b = uRotT * n;
    float alpha;
    if (uLocked > 0.5) alpha = acos(clamp(dot(b, uSub), -1.0, 1.0));
    else alpha = acos(clamp(-b.y, -1.0, 1.0));
    float u = alpha / 3.14159265;
    vec4 A = texture2D(uBandA, vec2(u, 0.5));
    vec4 B = texture2D(uBandB, vec2(u, 0.5));
    float seaIce = A.r, snow = A.g, cloudCov = A.b, glow = A.a;
    float green = B.r, dry = B.g, frost = B.b, tn = B.a;

    float e = elevation(b);
    float detail = fbm4(b * 9.0);
    float land = uHasOcean > 0.5 ? smoothstep(uSea - 0.004, uSea + 0.004, e) : 1.0;
    float height = max(e - uSea, 0.0);

    // ---- ocean ----
    float depth = clamp((uSea - e) * 6.0, 0.0, 1.0);
    vec3 ocean = mix(srgb(vec3(0.10, 0.42, 0.52)), srgb(vec3(0.02, 0.10, 0.27)), sqrt(depth));
    ocean = mix(ocean, srgb(vec3(0.12, 0.30, 0.34)), smoothstep(0.55, 0.8, tn) * 0.5); // hot seas look murky
    if (uHasLiquid < 0.5) ocean = srgb(vec3(0.33, 0.30, 0.27)) * (0.6 + 0.4 * detail); // dry basins
    float iceN = fbm4(b * 6.0 + vec3(2.0)) * 0.55 + detail * 0.25;
    float iceMask = smoothstep(iceN - 0.04, iceN + 0.04, seaIce * 0.85 + 0.05 * seaIce);
    iceMask = seaIce > 0.97 ? 1.0 : iceMask * step(0.01, seaIce);
    vec3 iceCol = mix(srgb(vec3(0.70, 0.82, 0.90)), srgb(vec3(0.93, 0.96, 0.99)), smoothstep(0.3, 0.7, detail));
    ocean = mix(ocean, iceCol, iceMask);

    // ---- land ----
    vec3 rock = srgb(mix(vec3(0.36, 0.32, 0.28), vec3(0.50, 0.45, 0.40), detail));
    vec3 sand = srgb(mix(vec3(0.72, 0.58, 0.38), vec3(0.82, 0.68, 0.46), detail));
    vec3 veg = srgb(mix(vec3(0.16, 0.30, 0.13), vec3(0.30, 0.38, 0.18), detail));
    vec3 tundra = srgb(vec3(0.42, 0.40, 0.36));
    vec3 redRock = srgb(mix(vec3(0.55, 0.28, 0.16), vec3(0.70, 0.40, 0.24), detail));
    vec3 ground = mix(rock, sand, dry);
    ground = mix(ground, redRock, dry * smoothstep(0.35, 0.65, fbm4(b * 3.0 + 9.0)) * 0.7);
    ground = mix(ground, veg, green * (1.0 - smoothstep(0.08, 0.25, height)));
    ground = mix(ground, tundra, (1.0 - green) * (1.0 - dry) * 0.3);
    ground *= 0.8 + 0.5 * smoothstep(0.0, 0.25, height);
    // hot rock darkens and reddens
    ground = mix(ground, srgb(vec3(0.20, 0.12, 0.10)), smoothstep(0.55, 0.75, tn));
    // snow settles first on high ground, then spreads
    float snowN = 0.12 + 0.75 * fbm4(b * 7.0 + vec3(5.0)) - 0.55 * clamp((e - max(uSea, 0.5)) * 4.0, 0.0, 1.0) * clamp(snow * 3.0, 0.0, 1.0);
    float snowMask = snow > 0.97 ? 1.0 : smoothstep(snowN - 0.04, snowN + 0.04, snow);
    ground = mix(ground, srgb(vec3(0.92, 0.94, 0.97)), snowMask * step(0.005, snow));
    ground = mix(ground, srgb(vec3(0.92, 0.88, 0.90)), frost * smoothstep(0.3, 0.6, fbm4(b * 5.0)) * 0.85);

    vec3 surf = mix(ocean, ground, land);
    float isWater = (1.0 - land) * (1.0 - iceMask) * uHasLiquid;

    // ---- lava ----
    vec3 emis = vec3(0.0);
    if (glow > 0.01) {
      float cracks = 1.0 - smoothstep(0.0, 0.06, abs(fbm4(b * 5.0 + uTime * 0.01) - 0.5));
      float plates = smoothstep(0.35, 0.65, fbm(b * 4.0 + vec3(uTime * 0.004)));
      float molten = smoothstep(0.6, 1.0, glow);
      float lava = max(cracks * smoothstep(0.0, 0.4, glow), molten * (1.0 - plates * 0.7));
      surf = mix(surf, srgb(vec3(0.08, 0.05, 0.04)), smoothstep(0.0, 0.3, glow));
      emis = blackbody(glow) * lava * (0.6 + 1.8 * glow);
      isWater = 0.0;
    }

    // ---- lighting ----
    float ndl = dot(n, L);
    float diff = smoothstep(-0.08, 0.25, ndl) * max(ndl, 0.0) * 0.85 + smoothstep(-0.1, 0.4, ndl) * 0.15;
    vec3 sunCol = srgb(uStarCol);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 220.0) * 0.4 + pow(max(dot(n, H), 0.0), 16.0) * 0.025;
    vec3 lit = surf * diff * sunCol + sunCol * spec * isWater * step(0.0, ndl);

    // ---- clouds ----
    vec3 cb;
    if (uLocked > 0.5) {
      // swirl around the substellar point
      float sw = uTime * 0.03 * (1.0 - alpha / 3.14159);
      vec3 axis = uSub;
      vec3 bp = b - axis * dot(b, axis);
      vec3 bq = cross(axis, bp);
      cb = axis * dot(b, axis) + bp * cos(sw) + bq * sin(sw);
    } else {
      float lat = asin(clamp(b.y, -1.0, 1.0));
      float drift = uTime * 0.025 * (1.0 + 0.6 * cos(3.0 * lat));
      cb = rotY(b, drift);
      cb.y *= uZonal;
    }
    float cn = fbm(cb * 2.6 + vec3(fbm4(cb * 1.5 + uTime * 0.01)) * 0.8);
    float cov = clamp(cloudCov, 0.0, 1.0);
    float cmask = smoothstep(1.0 - cov - 0.08, 1.0 - cov + 0.22, cn) * smoothstep(0.0, 0.08, cov);
    float shadow = 1.0 - 0.45 * cmask;
    lit *= shadow;
    vec3 cloudLit = vec3(0.95, 0.96, 0.98) * sunCol * (smoothstep(-0.15, 0.6, ndl) * 0.95 + 0.03);
    lit = mix(lit, cloudLit, cmask * 0.92);
    emis *= 1.0 - cmask * 0.6;

    // ---- thick atmospheres: steam, CO2, sulphuric clouds ----
    if (uVeil > 0.0) {
      float band = fbm(vec3(b.x * 1.5, b.y * 7.0, b.z * 1.5) + vec3(uTime * 0.01, 0.0, 0.0));
      vec3 vc = srgb(uVeilCol) * (0.82 + 0.3 * band);
      vc = mix(vc, vc * vec3(1.05, 0.82, 0.62), smoothstep(0.55, 1.0, tn));
      vec3 veilLit = vc * sunCol * (smoothstep(-0.2, 0.7, ndl) * 0.95 + 0.02);
      lit = mix(lit, veilLit, uVeil);
      emis *= 1.0 - uVeil * 0.75;
    }
    if (uHaze > 0.0) {
      vec3 hz = srgb(uHazeCol) * sunCol * (smoothstep(-0.25, 0.7, ndl) * 0.9 + 0.02);
      lit = mix(lit, hz, uHaze * 0.85);
    }

    // night-side thermal glow of very hot planets
    lit += emis;

    // rim / limb scattering
    float rim = pow(1.0 - n.z, 2.2);
    float rimLight = smoothstep(-0.35, 0.6, dot(n, L));
    lit += srgb(uAtmCol) * rim * uAtm * rimLight * 1.4;
    // limb darkening for thick atmospheres
    lit *= mix(1.0, 0.55 + 0.45 * n.z, clamp(uVeil + uHaze, 0.0, 1.0));
    float edge = smoothstep(1.0, 0.985, sqrt(r2));
    col = mix(col, lit, edge);
  }
  // outer atmospheric halo
  float rr = sqrt(r2);
  if (rr > 0.97 && uAtm > 0.0) {
    vec3 dir = normalize(vec3(pp, 0.0));
    float halo = exp(-(rr - 1.0) * 28.0 / (0.6 + uAtm)) * smoothstep(0.97, 1.0, rr);
    float lightSide = smoothstep(-0.5, 0.7, dot(dir, L));
    col += srgb(uAtmCol) * halo * uAtm * (0.15 + 1.1 * lightSide);
  }

  // tone map + gamma
  col = vec3(1.0) - exp(-col * 1.35);
  col = pow(col, vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

  // ---- JS twin of the shader noise, used to map land fraction to sea level ----
  function fract(x) { return x - Math.floor(x); }
  function hash(x, y, z) {
    x = fract(x * 0.3183099 + 0.1) * 17; y = fract(y * 0.3183099 + 0.1) * 17; z = fract(z * 0.3183099 + 0.1) * 17;
    return fract(x * y * z * (x + y + z));
  }
  function noise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
      l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
  }
  function fbmN(x, y, z, oct, mul, ox, oy, oz) {
    let a = 0.5, s = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x, y, z); x = x * mul + ox; y = y * mul + oy; z = z * mul + oz; a *= 0.5; }
    return s;
  }
  function elevation(x, y, z) {
    const qx = x * 1.7 + 3.1, qy = y * 1.7 + 7.4, qz = z * 1.7 + 1.9;
    const f4 = (a, b, c) => fbmN(a, b, c, 4, 2.07, 4.1, 1.3, 7.7);
    const wx = f4(qx, qy + 1.3, qz + 2.1), wy = f4(qx + 5.2, qy + 0.7, qz + 3.3), wz = f4(qx + 1.1, qy + 4.4, qz + 0.6);
    return fbmN(qx + 0.9 * (wx - 0.5), qy + 0.9 * (wy - 0.5), qz + 0.9 * (wz - 0.5), 6, 2.03, 1.7, 9.2, 3.1);
  }
  let seaTable = null;
  function buildSeaTable() {
    const n = 6000, v = new Float64Array(n);
    for (let i = 0; i < n; i++) {   // Fibonacci sphere
      const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      v[i] = elevation(r * Math.cos(th), y, r * Math.sin(th));
    }
    v.sort();
    seaTable = v;
  }
  function seaLevel(oceanFrac) {
    if (!seaTable) buildSeaTable();
    const f = Math.min(Math.max(oceanFrac, 0), 1);
    const idx = Math.min(seaTable.length - 1, Math.max(0, Math.floor(f * (seaTable.length - 1))));
    if (f <= 0) return seaTable[0] - 0.05;
    if (f >= 1) return seaTable[seaTable.length - 1] + 0.05;
    return seaTable[idx];
  }

  // ---- renderer ----
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false }) ||
        canvas.getContext('experimental-webgl');
      this.gl = gl;
      this.ok = !!gl;
      this.spin = 0;
      this.cam = 0;
      this.scaleRes = 1;
      this.frameTimes = [];
      if (!gl) return;
      const prog = this.program(VERT, FRAG);
      if (!prog) { this.ok = false; return; }
      this.prog = prog;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      ['uRes', 'uTime', 'uRot', 'uRotT', 'uLight', 'uSub', 'uLocked', 'uBandA', 'uBandB', 'uSea', 'uHasOcean', 'uHasLiquid',
        'uAtmCol', 'uAtm', 'uVeilCol', 'uVeil', 'uHazeCol', 'uHaze', 'uStarCol', 'uZonal', 'uScale', 'uStarSize']
        .forEach((k) => { this.u[k] = gl.getUniformLocation(prog, k); });
      this.texA = this.makeTex(0);
      this.texB = this.makeTex(1);
      gl.uniform1i(this.u.uBandA, 0);
      gl.uniform1i(this.u.uBandB, 1);
      this.dataA = new Uint8Array(36 * 4);
      this.dataB = new Uint8Array(36 * 4);
    }

    program(vs, fs) {
      const gl = this.gl;
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
        return s;
      };
      const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) return null;
      const p = gl.createProgram();
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
      return p;
    }

    makeTex(unit) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 36, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    }

    resize() {
      const c = this.canvas;
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.scaleRes;
      const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }

    // Visual state derived from the model (computed on the CPU each frame).
    visuals(model) {
      const d = model.diag, p = model.p, Cl = root.Climate;
      const N = Cl.N;
      for (let i = 0; i < N; i++) {
        const bd = d.bands[i];
        const T = bd.T;
        const glow = Cl.smooth(800, 2000, T);
        const wet = d.liquidArea > 0 ? 1 : 0;
        const green = wet * Cl.smooth(272, 285, T) * (1 - Cl.smooth(310, 330, T)) * Math.min(1, model.rh0 / 0.6);
        const dry = Cl.clamp(1 - model.rh0 / 0.7, 0, 1) * 0.8 + Cl.smooth(320, 420, T) * 0.4;
        const k = 4 * i;
        this.dataA[k] = 255 * Cl.clamp(bd.ice, 0, 1);
        this.dataA[k + 1] = 255 * Cl.clamp(bd.snow, 0, 1);
        this.dataA[k + 2] = 255 * Cl.clamp(bd.cloud * 1.35, 0, 1);
        this.dataA[k + 3] = 255 * glow;
        this.dataB[k] = 255 * Cl.clamp(green, 0, 1);
        this.dataB[k + 1] = 255 * Cl.clamp(dry, 0, 1);
        this.dataB[k + 2] = 255 * (bd.co2ice ? 1 : 0);
        this.dataB[k + 3] = 255 * Cl.clamp((T - 150) / 500, 0, 1);
      }
      // atmosphere colour from composition
      const g = p.gas, P = d.Ptot;
      const mix = [0, 0, 0];
      let wsum = 0;
      const add = (c, w) => { mix[0] += c[0] * w; mix[1] += c[1] * w; mix[2] += c[2] * w; wsum += w; };
      add([0.35, 0.6, 1.0], g.N2 + g.O2 + 1e-9);
      add([0.95, 0.85, 0.7], g.CO2 * 0.6);
      add([0.92, 0.94, 0.98], d.pv * 1.5);
      add([0.6, 0.85, 1.0], g.H2 * 0.8);
      add([0.95, 0.6, 0.25], d.haze * P * 2);
      const atmCol = wsum > 0 ? mix.map((v) => v / wsum) : [0.4, 0.6, 1];
      const atm = P < 1e-4 ? 0 : Cl.clamp(0.22 * Math.log10(P / 0.003), 0.03, 1.3);
      // opaque veil for steam / Venus-like atmospheres
      const steam = Cl.smooth(4, 150, d.pv);
      const venus = Cl.smooth(5, 40, g.CO2) * (d.liquidArea > 0 ? 0.3 : 1) * Cl.smooth(330, 450, d.Tmean);
      const sulph = g.SO2 > 1e-4 && d.Tmean > 400 ? 1 : 0;
      const veil = Cl.clamp(Math.max(steam * 0.95, venus * 0.9, sulph * 0.97), 0, 0.98);
      let veilCol;
      if (sulph && venus > steam) veilCol = [0.93, 0.83, 0.55];
      else if (steam >= venus) veilCol = [0.86, 0.87, 0.88];
      else veilCol = [0.88, 0.78, 0.62];
      return { atmCol, atm, veil, veilCol, haze: Cl.clamp(d.haze * 0.9, 0, 0.9) };
    }

    render(model, dt, opts) {
      if (!this.ok) return;
      const gl = this.gl;
      this.resize();
      const p = model.p, d = model.diag;
      // adaptive resolution: keep the frame cheap on slow GPUs
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 40) {
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.frameTimes.length = 0;
        if (avg > 1 / 40 && this.scaleRes > 0.5) this.scaleRes = Math.max(0.5, this.scaleRes - 0.15);
        else if (avg < 1 / 58 && this.scaleRes < 1) this.scaleRes = Math.min(1, this.scaleRes + 0.05);
      }
      const v = this.visuals(model);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texA);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 36, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.dataA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 36, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.dataB);

      // Visual spin: faster for short days, but always gentle. Independent of
      // frame rate because it integrates real elapsed time.
      const rotDays = p.rotationHours / 24;
      const spinRate = p.locked ? 0 : 0.22 / Math.pow(Math.max(rotDays, 0.05), 0.35);
      this.spin += spinRate * dt;   // keeps turning while paused, like a globe on a stand
      this.cam += (opts.dragging ? 0 : 0.04) * dt * (p.locked ? 1 : 0);
      const camYaw = (opts.yaw || 0) + (p.locked ? this.cam - 0.9 : 0);
      const camPitch = opts.pitch || 0;

      // body -> view rotation
      let R;
      let light;
      const tilt = (p.locked ? 0 : Math.min(p.obliquity, 90)) * Math.PI / 180;
      const Ry = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];   // column-major
      const Rz = (a) => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
      const Rx = (a) => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
      const mul = (a, b) => {   // column-major 3x3 multiply a*b
        const r = new Array(9);
        for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) {
          r[c * 3 + rr] = a[rr] * b[c * 3] + a[3 + rr] * b[c * 3 + 1] + a[6 + rr] * b[c * 3 + 2];
        }
        return r;
      };
      const apply = (M, v3) => [M[0] * v3[0] + M[3] * v3[1] + M[6] * v3[2], M[1] * v3[0] + M[4] * v3[1] + M[7] * v3[2], M[2] * v3[0] + M[5] * v3[1] + M[8] * v3[2]];
      const view = mul(Rx(camPitch + 0.18), Ry(camYaw));
      if (p.locked) {
        R = view;
        light = apply(view, [1, 0, 0]);   // the substellar point is +x in the body frame
      } else {
        R = mul(view, mul(Rz(-tilt * 0.6), Ry(this.spin)));
        light = apply(view, [-0.82, 0.25, 0.52]);
      }
      const RT = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
      const star = root.Climate.STAR[p.star];
      const u = this.u;
      gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.uTime, opts.visualTime);
      gl.uniformMatrix3fv(u.uRot, false, new Float32Array(R));
      gl.uniformMatrix3fv(u.uRotT, false, new Float32Array(RT));
      gl.uniform3fv(u.uLight, new Float32Array(light));
      gl.uniform3f(u.uSub, 1, 0, 0);
      gl.uniform1f(u.uLocked, p.locked ? 1 : 0);
      const hasOcean = d.condensedOceans > 1e-6 && (d.fOcean > 0.03 || (d.fOcean > 0.002 && d.liquidArea > 0));
      gl.uniform1f(u.uSea, seaLevel(hasOcean ? d.fOcean : 0));
      gl.uniform1f(u.uHasOcean, hasOcean ? 1 : 0);
      gl.uniform1f(u.uHasLiquid, d.liquidArea > 0.0005 || d.iceArea > 0 ? 1 : 0);
      gl.uniform3fv(u.uAtmCol, new Float32Array(v.atmCol));
      gl.uniform1f(u.uAtm, v.atm);
      gl.uniform3fv(u.uVeilCol, new Float32Array(v.veilCol));
      gl.uniform1f(u.uVeil, v.veil);
      gl.uniform3f(u.uHazeCol, 0.82, 0.55, 0.25);
      gl.uniform1f(u.uHaze, v.haze);
      gl.uniform3fv(u.uStarCol, new Float32Array(star.color));
      gl.uniform1f(u.uZonal, p.locked ? 1 : Math.min(3.5, 1 + 1.2 / Math.pow(Math.max(rotDays, 0.1), 0.6)));
      const scale = opts.scale || 0.7;
      gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uStarSize, Math.min(1.6, 0.4 + 0.6 * Math.sqrt(model.diag.fluxRel)));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  root.PlanetRenderer = { Renderer, seaLevel };
})(window);

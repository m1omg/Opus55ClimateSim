/*
 * Planetary climate model.
 *
 * A 36-band energy-balance model (latitude bands, or rings around the
 * substellar point for tidally locked planets) coupled to slow volatile
 * reservoirs: the ocean / water-vapour inventory, the carbonate-silicate
 * cycle, CO2 frost, hydrogen escape, bulk atmospheric escape and stellar
 * brightening.
 *
 * Temperatures are integrated with a linearised backward-Euler step, so the
 * model stays stable whether a step is one month or ten million years. The
 * latent heat needed to move water between ocean and atmosphere is part of
 * each band's effective heat capacity; that is what stretches a runaway
 * greenhouse over thousands of years instead of making it instantaneous.
 */
(function (root) {
  'use strict';

  const SIGMA = 5.670374e-8;
  const S0 = 1361;            // W/m2, solar constant at Earth
  const LV = 2.45e6;          // J/kg, latent heat of vaporisation
  const LCO2 = 5.9e5;         // J/kg, latent heat of CO2 sublimation
  const YR = 3.15576e7;       // s
  const OCEAN_KG = 1.4e21;    // kg, one Earth ocean
  const RE = 6.371e6;         // m
  const GE = 9.81;            // m/s2
  const PC = 22.064e6;        // Pa, critical pressure of water
  const TC = 647.096;         // K, critical temperature of water
  const N = 36;
  const DALPHA = Math.PI / N;

  // Band geometry. alpha runs 0..pi (south pole -> north pole, or substellar
  // point -> antistellar point). Weights sum to 2.
  const W = new Float64Array(N);
  const EDGE = new Float64Array(N + 1);
  const ALPHA = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    W[i] = Math.cos(i * DALPHA) - Math.cos((i + 1) * DALPHA);
    ALPHA[i] = (i + 0.5) * DALPHA;
  }
  for (let k = 0; k <= N; k++) EDGE[k] = Math.sin(k * DALPHA);

  const STAR = {
    F: { name: 'F-type', teff: 6700, iceAdj: -0.03, ray: 1.25, nir: -0.02, evo: 2.5, color: [1.0, 0.97, 0.92] },
    G: { name: 'G-type (Sun-like)', teff: 5780, iceAdj: 0.0, ray: 1.0, nir: 0.0, evo: 1.0, color: [1.0, 0.94, 0.84] },
    K: { name: 'K-type', teff: 4600, iceAdj: 0.07, ray: 0.7, nir: 0.025, evo: 0.4, color: [1.0, 0.8, 0.6] },
    M: { name: 'M-dwarf', teff: 3200, iceAdj: 0.16, ray: 0.35, nir: 0.06, evo: 0.03, color: [1.0, 0.6, 0.38] }
  };

  const GASES = ['N2', 'O2', 'CO2', 'CH4', 'H2', 'SO2'];
  const CP = { N2: 1040, O2: 920, CO2: 850, CH4: 2200, H2: 14300, SO2: 640, H2O: 1900 };

  // ---------- helpers ----------
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function smin(a, b, k) {
    if (a <= 0 || b <= 0) return Math.max(0, Math.min(a, b));
    const r = Math.min(a, b) / Math.max(a, b);
    return Math.min(a, b) * Math.pow(1 + Math.pow(r, k), -1 / k);
  }

  // Saturation vapour pressure of water (Pa): Murphy & Koop over ice,
  // Wagner & Pruss over liquid, smooth exponential continuation past the
  // critical point (where every drop of water ends up in the atmosphere).
  function psat(T) {
    if (T < 273.16) {
      const t = Math.max(T, 90);
      return Math.exp(9.550426 - 5723.265 / t + 3.53068 * Math.log(t) - 0.00728332 * t);
    }
    if (T >= TC) return PC * Math.exp(0.15 * (T - TC));   // beyond the critical point all water is 'vapour'
    const tau = 1 - T / TC;
    const s = -7.85951783 * tau + 1.84408259 * Math.pow(tau, 1.5) - 11.7866497 * tau * tau * tau +
      22.6807411 * Math.pow(tau, 3.5) - 15.9618719 * Math.pow(tau, 4) + 1.80122502 * Math.pow(tau, 7.5);
    return PC * Math.exp((TC / T) * s);
  }

  // CO2 frost point (K) for a partial pressure in Pa.
  function co2Frost(pPa) {
    if (pPa < 1e-2) return 0;
    return 3182.48 / (23.3494 - Math.log(pPa / 100));
  }

  // Temperature at which water boils / ocean vanishes for a total pressure.
  function boilT(Pbar) {
    const P = Pbar * 1e5;
    if (P >= PC) return TC;
    let lo = 200, hi = TC;
    for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (psat(m) > P) hi = m; else lo = m; }
    return 0.5 * (lo + hi);
  }

  // ---------- parameters ----------
  function defaultParams() {
    return {
      flux: 1.0, star: 'G', xuv: 1.0, stellarEvolution: false,
      mass: 1.0, rotationHours: 24, locked: false, obliquity: 23.4,
      water: 1.0,
      gas: { N2: 0.78, O2: 0.21, CO2: 4e-4, CH4: 1.8e-6, H2: 0, SO2: 0 },
      carbonCycle: true, volcanism: 1.0, escape: true, carbonate: 60
    };
  }

  function planetGeometry(mass) {
    const R = Math.pow(mass, 0.27);           // rocky mass-radius relation
    const g = mass / (R * R);
    return {
      R, g,
      vesc: 11.186 * Math.sqrt(mass / R),       // km/s
      area: 4 * Math.PI * (R * RE) * (R * RE)   // m2
    };
  }

  // Annual-mean insolation per band as a fraction of the stellar flux S
  // (global mean = 1/4).
  function insolationProfile(locked, obliqDeg) {
    const q = new Float64Array(N);
    const sub = 16;
    if (locked) {
      for (let i = 0; i < N; i++) {
        let s = 0, ws = 0;
        for (let k = 0; k < sub; k++) {
          const a = (i + (k + 0.5) / sub) * DALPHA;
          const w = Math.sin(a);
          s += w * Math.max(0, Math.cos(a)); ws += w;
        }
        q[i] = s / ws;
      }
    } else {
      const eps = obliqDeg * Math.PI / 180;
      const NL = 96;
      for (let i = 0; i < N; i++) {
        let s = 0, ws = 0;
        for (let k = 0; k < sub; k++) {
          const a = (i + (k + 0.5) / sub) * DALPHA;
          const phi = a - Math.PI / 2;
          const w = Math.cos(phi);
          let acc = 0;
          for (let l = 0; l < NL; l++) {
            const lam = (l + 0.5) / NL * 2 * Math.PI;
            const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
            const x = -Math.tan(phi) * Math.tan(dec);
            const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
            acc += (h0 * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(h0)) / Math.PI;
          }
          s += w * acc / NL; ws += w;
        }
        q[i] = s / ws;
      }
    }
    let mean = 0;
    for (let i = 0; i < N; i++) mean += W[i] * q[i];
    mean /= 2;
    for (let i = 0; i < N; i++) q[i] *= 0.25 / mean;
    return q;
  }

  // Ocean area fraction from the global-equivalent water depth (m) and the
  // topographic relief, which scales inversely with gravity.
  function oceanFraction(depthM, g) {
    if (depthM <= 0) return 0;
    const x = depthM / (3800 / g);
    const land = Math.exp(-1.72 * x) * Math.max(0, 1 - Math.pow(x / 4, 3));
    return clamp(1 - land, 0, 1);
  }

  // ---------- model ----------
  class Model {
    constructor(params) {
      this.p = params || defaultParams();
      this.reset();
    }

    reset(initT) {
      const p = this.p;
      this.geo = planetGeometry(p.mass);
      this.T = new Float64Array(N).fill(initT || 288);
      if (typeof initT === 'function') for (let i = 0; i < N; i++) this.T[i] = initT(ALPHA[i], p.locked);
      this.co2Ice = new Float64Array(N);   // bar (global-mean equivalent) of CO2 frost in each band
      this.time = 0;                       // years
      this.nightIce = 0;                   // Earth oceans trapped in nightside glaciers
      this.abioticO2 = 0;                  // bar of O2 left behind by hydrogen escape
      this.dtNext = 0.05;
      this.lostWater = 0;
      this.co2Trend = 0;
      this.fOcean = 0.7; this.rh0 = 0.7; this.snowMax = 1; this.globalColumn = 0;
      this._qKey = '';
      this.diag = null;
      this.rates = {};
      this.updateDerived();
      this.globalColumn = 0;
      this.refreshWater(this.T[0]);
    }

    // Recompute anything that depends only on parameters.
    updateDerived() {
      const p = this.p;
      this.geo = planetGeometry(p.mass);
      const key = (p.locked ? 'L' : 'R') + p.obliquity.toFixed(2);
      if (key !== this._qKey) { this.q = insolationProfile(p.locked, p.obliquity); this._qKey = key; }
    }

    luminosityFactor() {
      if (!this.p.stellarEvolution) return 1;
      const k = STAR[this.p.star].evo;
      const tg = this.time / 1e9;
      return 1 / Math.max(0.25, 1 - 0.0875 * k * tg);
    }

    // Build the per-step context that does not depend on band temperature.
    context() {
      const p = this.p, geo = this.geo, star = STAR[p.star];
      const g = geo.g;
      const gs = p.gas;
      const Pbg = Math.max(1e-9, gs.N2 + gs.O2 + this.abioticO2 + gs.CO2 + gs.CH4 + gs.H2 + gs.SO2);
      const mobile = Math.max(0, p.water - this.nightIce);
      const mw = mobile * OCEAN_KG / geo.area;    // kg/m2 of exchangeable water
      const Pw = mw * g * GE;                     // Pa if all of it were vapour
      const S = S0 * p.flux * this.luminosityFactor();
      const O2 = gs.O2 + this.abioticO2;
      const ratio = gs.CH4 / Math.max(gs.CO2, 1e-9);
      const haze = smooth(0.08, 0.6, ratio) * smooth(-4.5, -2.5, Math.log10(gs.CH4 + 1e-12)) * (O2 > 1e-3 ? 0 : 1);
      const rotDays = p.rotationHours / 24;
      const rotBoost = smooth(Math.log(4), Math.log(40), Math.log(Math.max(rotDays, 0.01)));
      // Snow is spread over the coldest bands first (cold-trapping), limited
      // by how much water the planet has.
      let snowAlloc = null;
      if (this.snowMax < 1) {
        snowAlloc = new Float64Array(N);
        let tmin = Infinity;
        for (let i = 0; i < N; i++) tmin = Math.min(tmin, this.T[i]);
        let tot = 0;
        for (let i = 0; i < N; i++) { const k = smooth(272, 262, this.T[i]) * Math.exp(-(this.T[i] - tmin) / 12); snowAlloc[i] = k; tot += W[i] / 2 * k; }
        for (let i = 0; i < N; i++) snowAlloc[i] = tot > 0 ? clamp(this.snowMax * snowAlloc[i] / tot, 0, 1) / Math.max(smooth(272, 262, this.T[i]), 1e-6) : 0;
        for (let i = 0; i < N; i++) snowAlloc[i] = clamp(snowAlloc[i], 0, 1);
      }
      return {
        snowAlloc,
        g, S, Pbg, Pw, mw, star, haze, rotBoost, O2,
        uN2: gs.N2 / g, uO2: O2 / g, uCO2: gs.CO2 / g, uCH4: gs.CH4 / g, uH2: gs.H2 / g, uSO2: gs.SO2 / g,
        xCO2: gs.CO2 / Pbg,
        rh0: this.rh0, fOcean: this.fOcean,
        geoFlux: 0.09 * Math.sqrt(p.mass),
        colBg: Pbg * 1e5 / (g * GE),
        cpBg: (gs.N2 * CP.N2 + O2 * CP.O2 + gs.CO2 * CP.CO2 + gs.CH4 * CP.CH4 + gs.H2 * CP.H2 + gs.SO2 * CP.SO2) / Pbg
      };
    }

    vapor(T, c) {        // surface water-vapour partial pressure (Pa)
      if (c.Pw <= 0) return 0;
      const rh = c.rh0 + (1 - c.rh0) * smooth(TC - 60, TC, T);
      return smin(rh * psat(T), c.Pw, 4);
    }

    columnWater(pv, c) { // kg/m2 of vapour in the column
      if (pv <= 0) return 0;
      const x = pv / (pv + c.Pbg * 1e5);
      const m0 = x + (1 - x) * 0.174;          // vapour confined to the lower troposphere
      const f = c.Pw > 0 ? Math.min(1, pv / c.Pw) : 0;
      return pv / (c.g * GE) * (m0 + (1 - m0) * f * f);   // -> whole inventory when fully evaporated
    }

    opticalDepth(T, pv, c) {
      const pvb = pv / 1e5;
      const Pb = Math.max(c.Pbg + pvb, 1e-6);
      const sq = Math.sqrt(Pb);
      const pb4 = Math.pow(Pb, 0.25);
      let tau = 0;
      tau += (0.036 * Math.log(1 + c.uCO2 / 1e-5)) * Math.min(pb4, 1.6) + 0.11 * c.uCO2 * sq;
      tau += 0.03 * Math.log(1 + c.uCH4 / 2e-6) * Math.min(pb4, 1.6) + 0.4 * c.uCH4 * sq;
      tau += 0.9 * c.uH2 * sq * (1 + 6 * c.xCO2);
      tau += 0.008 * c.uN2 * Pb;
      tau += 0.02 * Math.log(1 + c.uSO2 / 1e-6);
      if (pvb > 0) {
        const uw = pvb / c.g;
        const r = uw / 0.0131;
        // Weak-line (Earth-like) term, plus a pressure-broadened continuum that
        // makes thick, unsaturated steam atmospheres extremely opaque. While an
        // ocean keeps the air saturated, emission is pinned at the radiation
        // limit instead (see olr()).
        const ps = psat(T);
        const sat = smooth(0.35, 0.6, ps > 0 ? pv / ps : 0);
        tau += (0.42 * Math.pow(r, 0.3) + 0.01 * r * (1 - sat)) * Math.pow(Pb, 0.4);
        tau += 0.078 * smooth(230, 270, T) * smooth(0, 0.002, pvb);    // water clouds
      }
      tau -= 0.12 * c.haze;
      return Math.max(0, tau);
    }

    // The tropospheric (Simpson-Nakajima) radiation limit of a moist
    // atmosphere: ~282 W/m2 for Earth (Goldblatt et al. 2013), weakly
    // increasing with gravity (Kopparapu et al. 2014) and higher when the air
    // is unsaturated (dry/land planets, Abe et al. 2011; Leconte et al. 2013).
    radLimit(T, pv, c) {
      const ps = psat(T);
      const rh = ps > 0 ? pv / ps : 0;
      return 282 * Math.pow(c.g, 0.1) * Math.pow(0.75 / Math.max(rh, 0.01), 0.45);
    }

    olr(T, pv, c) {
      const grey = SIGMA * T * T * T * T / (1 + this.opticalDepth(T, pv, c));
      if (pv <= 0) return grey;
      const o = smin(grey, this.radLimit(T, pv, c), 10);
      // While water dominates the upper atmosphere, emission comes from the
      // saturated layers and stays pinned near the limit until the surface is
      // hot enough to leak through near-IR windows.
      const pvb = pv / 1e5;
      const xv = pvb / (pvb + c.Pbg);
      const floor = 282 * Math.pow(c.g, 0.1) * smooth(0.02, 0.3, pvb) * smooth(0.05, 0.5, xv);
      return o >= floor ? o : floor;
    }

    // Planetary albedo of a band.
    albedo(i, T, pv, c, out) {
      const p = this.p, star = c.star;
      const lat = p.locked ? 0 : (ALPHA[i] - Math.PI / 2);
      const fO = c.fOcean, fL = 1 - fO;
      const ice = smooth(268, 257, T);
      const snow = smooth(272, 262, T) * (c.snowAlloc ? c.snowAlloc[i] : 1);
      // Bare subtropical sea ice (the "Jormungand" mechanism, Abbot et al. 2011)
      const jorm = p.locked ? 0 : Math.exp(-Math.pow((Math.abs(lat) * 57.3 - 20) / 11, 2));
      let aIce = 0.58 - star.iceAdj;
      aIce = aIce * (1 - 0.7 * jorm) + (0.45 - 0.7 * star.iceAdj) * 0.7 * jorm;
      const dryness = 1 - c.rh0 / 0.8;
      let aLand = 0.2 + 0.12 * clamp(dryness, 0, 1);
      aLand = aLand * (1 - smooth(600, 1000, T)) + 0.12 * smooth(600, 1000, T);
      let As = fO * ((1 - ice) * 0.07 + ice * aIce) + fL * (snow * (0.68 - star.iceAdj) + (1 - snow) * aLand);
      if (this.co2Ice[i] > 0) As = As + (0.62 - As) * Math.min(1, this.co2Ice[i] / (W[i] * 1e-4));

      // water clouds
      const wet = c.Pw > 0 ? smooth(0, 0.3, c.rh0) * smooth(0, 5, c.mw) : 0;
      let cf = 0.6 * (0.35 + 0.65 * Math.min(1, c.rh0 / 0.8)) * smooth(215, 268, T) * wet;
      let rc = cf * 0.3 * (1 - 0.62 * smooth(300, 385, T)) * (1 - smooth(450, 600, T));
      // Slow rotators build a thick reflective cloud deck under the
      // substellar point (Yang et al. 2013, 2014).
      let sun;
      if (p.locked) sun = Math.max(0, Math.cos(ALPHA[i]));
      else sun = this.q[i] / 0.42;
      const boost = c.rotBoost * 0.5 * Math.sqrt(clamp(sun, 0, 1)) * smooth(250, 290, T) * (1 - smooth(500, 650, T)) * wet;
      rc = 1 - (1 - rc) * (1 - boost);
      // Rayleigh scattering, reduced where water vapour / CO2 soak up the near-IR
      const pvb = pv / 1e5;
      const Ptot = c.Pbg + pvb;
      const xv = pvb / Math.max(Ptot, 1e-9);
      const Ps = (this.p.gas.N2 + 0.9 * c.O2 + 2.5 * this.p.gas.CO2 + 0.25 * this.p.gas.H2 + 1.5 * this.p.gas.CH4 + 0.1 * pvb) / c.g;
      const rr = 0.75 * Ps / (Ps + 10) * star.ray * (1 - 0.75 * xv) * (1 - 0.6 * c.haze) * (1 - 0.5 * c.xCO2 * smooth(1, 30, this.p.gas.CO2));
      const rh = 0.12 * c.haze;
      // sulphate aerosol (wet) or sulphuric-acid cloud deck (hot and dry)
      const so2 = this.p.gas.SO2;
      const hotDry = smooth(350, 450, T) * (1 - smooth(0, 0.05, c.fOcean));
      const rs = (1 - hotDry) * 0.25 * (1 - Math.exp(-so2 / 1e-5)) + hotDry * 0.6 * (1 - Math.exp(-so2 / 1e-3));
      const Ra = 1 - (1 - rc) * (1 - rr) * (1 - rh) * (1 - rs);
      // thick steam / CO2 absorbs sunlight before it reaches the (bright) ground
      const tr = Math.exp(-0.03 * Math.sqrt(pvb / c.g) - 0.01 * Math.sqrt(c.uCO2));
      const Ae = As * tr * tr;
      let A = Ra + (1 - Ra) * (1 - Ra) * Ae / (1 - Ra * Ae);
      A -= star.nir * (1 - Ra) * smooth(0, 0.02, pvb);   // stronger NIR absorption for red stars
      if (out) { out.cloud = 1 - (1 - rc) * (1 - rs); out.ice = ice; out.snow = snow; out.As = As; }
      return clamp(A, 0.02, 0.95);
    }

    // Net TOA flux and OLR of band i at temperature T.
    bandFlux(i, T, c) {
      const pv = this.vapor(T, c);
      const A = this.albedo(i, T, pv, c);
      const asr = c.S * this.q[i] * (1 - A);
      const olr = this.olr(T, pv, c);
      return { net: asr - olr + c.geoFlux, asr, olr, pv, A };
    }

    heatCapacity(T, pv, c) {
      const fO = c.fOcean;
      const ice = smooth(268, 257, T);
      const condensed = Math.max(0, c.mw - this.globalColumn) / 1000;  // m of liquid/ice
      const hmix = 70 + 2500 * smooth(305, 420, T);
      const Cocean = 4.2e6 * Math.min(condensed, hmix);
      const Cland = 2.5e6;
      const colV = this.columnWater(pv, c);
      const Catm = c.colBg * c.cpBg + colV * CP.H2O;
      const Csurf = fO * (1 - ice) * Cocean + (1 - fO * (1 - ice)) * Cland;
      // latent heat taken up by evaporating the ocean as the surface warms
      let Clat = 0;
      if (c.Pw > 0) {
        const w1 = this.columnWater(this.vapor(T + 0.5, c), c), w0 = this.columnWater(this.vapor(T - 0.5, c), c);
        Clat = LV * Math.max(0, w1 - w0);
      }
      return Csurf + Catm + Clat;
    }

    diffusivity(c) {
      const p = this.p;
      const pvMean = this.diag ? this.diag.pv * 1e5 : 1300;
      const col = (c.Pbg + pvMean / 1e5) / c.g;
      const rf = clamp(Math.pow(p.rotationHours / 24, 0.6), 0.25, 25);
      const mf = 0.6 + 0.4 * Math.min(8, Math.sqrt(Math.max(pvMean, 0) / 1300));
      const lockFac = p.locked ? 1.6 : 1;
      return clamp(0.32 * Math.pow(col, 0.7) * rf * mf * lockFac, 0.004, 120);
    }

    // One implicit step of dt years. Returns false (and changes nothing) if
    // the step was too large.
    tryStep(dt) {
      const c = this.context();
      const T = this.T, q = this.q;
      const n = N;
      const F = new Float64Array(n), B = new Float64Array(n), C = new Float64Array(n);
      // global column water for ocean bookkeeping
      let colSum = 0;
      for (let i = 0; i < n; i++) colSum += W[i] * this.columnWater(this.vapor(T[i], c), c);
      this.globalColumn = colSum / 2;

      for (let i = 0; i < n; i++) {
        const f0 = this.bandFlux(i, T[i], c);
        const f1 = this.bandFlux(i, T[i] + 0.5, c);
        F[i] = f0.net;
        B[i] = Math.max(-(f1.net - f0.net) / 0.5, 0.15);
        C[i] = this.heatCapacity(T[i], f0.pv, c);
      }
      const D = this.diffusivity(c);
      const dts = dt * YR;
      // tridiagonal system
      const a = new Float64Array(n), b = new Float64Array(n), cc = new Float64Array(n), r = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const kl = i > 0 ? D * EDGE[i] / DALPHA : 0;
        const kr = i < n - 1 ? D * EDGE[i + 1] / DALPHA : 0;
        const m = C[i] * W[i] / dts;
        a[i] = -kl; cc[i] = -kr;
        b[i] = m + W[i] * B[i] + kl + kr;
        r[i] = m * T[i] + W[i] * (F[i] + B[i] * T[i]);
      }
      // Thomas algorithm
      for (let i = 1; i < n; i++) {
        const w = a[i] / b[i - 1];
        b[i] -= w * cc[i - 1];
        r[i] -= w * r[i - 1];
      }
      const Tn = new Float64Array(n);
      Tn[n - 1] = r[n - 1] / b[n - 1];
      for (let i = n - 2; i >= 0; i--) Tn[i] = (r[i] - cc[i] * Tn[i + 1]) / b[i];

      let maxd = 0;
      for (let i = 0; i < n; i++) {
        if (!isFinite(Tn[i])) return false;
        Tn[i] = clamp(Tn[i], 20, 4000);
        const lim = Math.max(3, 0.015 * T[i]);
        maxd = Math.max(maxd, Math.abs(Tn[i] - T[i]) / lim);
      }
      if (maxd > 1 && dt > 1e-4) return false;

      // CO2 frost: condense where colder than the frost point, sublimate
      // where frost sits on a band that has warmed.
      const p = this.p;
      const gfac = c.g * GE / 1e5;    // bar per kg/m2
      let co2 = p.gas.CO2;
      const co2Before = co2 + this.co2Ice.reduce((s, v) => s + v, 0);
      const newIce = Float64Array.from(this.co2Ice);
      for (let i = 0; i < n; i++) {
        const Tf = co2Frost(co2 * 1e5);
        if (Tf <= 0) continue;
        if (Tn[i] < Tf && co2 > 1e-7) {
          const E = C[i] * (Tf - Tn[i]);
          let dp = W[i] / 2 * E / LCO2 * gfac;
          dp = Math.min(dp, co2 * 0.9);
          newIce[i] += dp; co2 -= dp;
          Tn[i] = Tf - (1 - dp / (W[i] / 2 * E / LCO2 * gfac + 1e-30)) * (Tf - Tn[i]);
        } else if (newIce[i] > 0 && Tn[i] > Tf) {
          const E = C[i] * (Tn[i] - Tf);
          const dpMax = W[i] / 2 * E / LCO2 * gfac;
          const dp = Math.min(newIce[i], dpMax);
          newIce[i] -= dp; co2 += dp;
          Tn[i] -= dp / (W[i] / 2) / gfac * LCO2 / C[i];
        }
      }
      if (co2Before > 0 && Math.abs(co2 - p.gas.CO2) > 0.4 * p.gas.CO2 + 0.01 * co2Before + 1e-6 && dt > 1e-3) return false;

      // ---- slow processes ----
      const slow = this.slowProcesses(dt, c, Tn, co2);
      if (!slow) return false;

      const co2Prev = p.gas.CO2;
      this.T = Tn;
      this.co2Ice = newIce;
      this.commitSlow(slow, c);
      // smoothed trend of atmospheric CO2 (bar/yr), used to spot collapse
      const tr = (p.gas.CO2 - co2Prev) / dt;
      const k = Math.min(1, dt / 100);
      this.co2Trend = (this.co2Trend || 0) * (1 - k) + tr * k;
      this.time += dt;
      return true;
    }

    // Slow volatile processes over dt years. Pure: returns the new values
    // (or null if dt is too large) without touching the model.
    slowProcesses(dt, c, Tn, co2) {
      const p = this.p, geo = this.geo;
      const g = c.g;
      const gfac = g * GE / 1e5;    // bar per kg/m2
      const rates = {};
      const out = {
        co2, water: p.water, H2: p.gas.H2, abioticO2: this.abioticO2, carbonate: p.carbonate,
        nightIce: this.nightIce, lost: 0, bulkFrac: 0, rates, stratH2O: 0
      };
      let Tm = 0, pvm = 0;
      for (let i = 0; i < N; i++) { Tm += W[i] * Tn[i]; pvm += W[i] * this.vapor(Tn[i], c); }
      Tm /= 2; pvm /= 2;
      const Ptot = c.Pbg + pvm / 1e5;
      const fluxRel = c.S / S0;

      // --- hydrogen escape (diffusion- or energy-limited) ---
      let dWater = 0, dO2 = 0;
      rates.waterLoss = 0;
      if (p.escape) {
        const x = pvm / 1e5 / Ptot;
        const fs = Math.min(x, 0.29 * Math.pow(x, 2.58) + 0.71 * Math.pow(x, 6));
        const xH2 = p.gas.H2 / Ptot;
        const ftot = fs + xH2;
        out.stratH2O = fs;
        if (ftot > 0) {
          const phiDL = 2.6e-2 * ftot * g;   // kg H /m2 /yr
          const phiEL = 0.15 * 4.6e-3 * p.xuv * fluxRel / (4 * g * GE * geo.R * RE) * YR;
          const phi = smin(phiDL, phiEL, 3);
          rates.hEscape = phi;
          rates.escapeLimited = phiDL < phiEL ? 'diffusion' : 'energy';
          const hW = phi * fs / ftot * dt;
          const hH = phi * xH2 / ftot * dt;
          dWater = 9 * hW * geo.area / OCEAN_KG;
          dO2 = 8 * hW * gfac;
          out.H2 = Math.max(0, p.gas.H2 - hH * gfac);
          rates.waterLoss = 9 * phi * fs / ftot * geo.area / OCEAN_KG * 1e9;   // oceans per Gyr
        }
      }

      // --- bulk atmospheric escape (small planets, active stars) ---
      rates.bulkLoss = 0;
      if (p.escape) {
        const rate = 3e-7 * p.xuv * fluxRel * Math.exp(clamp(-(geo.vesc - 5.0) / 1.0, -40, 6));  // kg/m2/yr
        const bulk = rate * dt * gfac;
        out.bulkFrac = 1 - Math.exp(-bulk / c.Pbg);
        if (out.bulkFrac > 0.25 && c.Pbg > 1e-3 && dt > 1e-3) return null;
        rates.bulkLoss = rate * gfac * 1e9;
        dWater += bulk / gfac * geo.area / OCEAN_KG * 0.05;
      }

      // --- carbonate-silicate cycle ---
      if (p.carbonCycle) {
        const V = 6e-8 * p.volcanism * g;   // bar/yr
        let wsum = 0;
        if (c.mw > 0 && c.fOcean > 0) {
          const Tb = this.diag ? this.diag.boilT : 373;
          for (let i = 0; i < N; i++) {
            const liquid = smooth(271, 276, Tn[i]) * (1 - smooth(Tb - 5, Tb + 5, Tn[i]));
            wsum += W[i] / 2 * liquid * Math.exp((Math.min(Tn[i], 380) - 288) / 13.7);
          }
        }
        const fLand = 1 - c.fOcean;
        const landFac = (c.mw > 0 && fLand > 1e-3 ? Math.pow(Math.min(1.5, fLand / 0.29), 0.3) : 0) +
          0.1 * (this.hpIce ? 0 : 1) * (c.fOcean > 0 ? 1 : 0);
        const Wc0 = 6e-8 * g * Math.min(wsum / 1.67, 400) * landFac / 1.1;
        const Bf = 1 + 60 * c.fOcean * Math.min(1, Math.sqrt(4e-4 / Math.max(co2, 1e-9)));
        const p0 = Math.max(co2, 1e-9);
        const Wc = Wc0 * Math.pow(p0 / 4e-4, 0.3);
        let y = p0;
        for (let it = 0; it < 10; it++) {
          const Wy = Wc * Math.pow(y / p0, 0.3);
          const f = y - p0 - dt / Bf * (V - Wy);
          const fp = 1 + dt / Bf * Wc * 0.3 * Math.pow(y / p0, -0.7) / p0;
          y = Math.max(y - f / fp, p0 * 0.02, 1e-9);
        }
        y = clamp(y, p0 * 0.5, p0 * 2 + V * dt);
        const weathered = Math.max(0, Wc * Math.pow(y / p0, 0.3) * dt / Bf);
        out.carbonate += weathered;
        out.co2 = y;
        rates.outgas = V; rates.weather = Wc;
        // carbonate decomposition on very hot surfaces (Urey equilibrium)
        if (Tm > 600 && out.carbonate > 0) {
          const tau = Math.max(1e3, 1e6 * Math.exp(-(Tm - 600) / 80));
          const rel = out.carbonate * (1 - Math.exp(-dt / tau));
          if (rel > 0.5 * out.co2 + 0.5 && dt > 1e-3) return null;
          out.carbonate -= rel; out.co2 += rel;
          rates.decomp = rel / dt;
        }
      }

      // --- water inventory ---
      if (dWater > 0) {
        const mobile = Math.max(0, p.water - this.nightIce);
        const lose = mobile * (1 - Math.exp(-dWater / Math.max(mobile, 1e-30)));
        if (lose > 0.2 * mobile && mobile > 1e-4 && dt > 1e-3) return null;
        out.water = Math.max(0, p.water - lose);
        if (out.water < 1e-10) out.water = 0;
        out.lost = lose;
      }
      // abiotic O2 builds up from photolysed water; crustal oxidation removes it
      const tauOx = Tm > 1300 ? 1e4 : 3e6;
      out.abioticO2 = (this.abioticO2 + dO2) * Math.exp(-dt / tauOx);
      if (out.abioticO2 < 1e-12) out.abioticO2 = 0;

      // --- water cold-trapping on the nightside of locked planets ---
      if (p.locked && out.water > 0) {
        let frozen = 0;
        for (let i = N / 2; i < N; i++) if (Tn[i] < 255) frozen += W[i] / 2;
        const capOceans = 2500 / g * frozen * 1000 * geo.area / OCEAN_KG;
        const target = Math.min(capOceans, out.water * 0.995);
        out.nightIce = this.nightIce + (target - this.nightIce) * (1 - Math.exp(-dt / 2e4));
      } else out.nightIce = 0;
      out.Tm = Tm;
      return out;
    }

    commitSlow(s, c) {
      const p = this.p, g = c.g;
      p.gas.CO2 = Math.max(0, s.co2);
      p.gas.H2 = s.H2;
      p.water = s.water;
      p.carbonate = s.carbonate;
      this.abioticO2 = s.abioticO2;
      this.nightIce = Math.min(s.nightIce, p.water);
      this.lostWater += s.lost;
      this.stratH2O = s.stratH2O;
      this.rates = s.rates;
      if (s.bulkFrac > 0) {
        for (const k of GASES) p.gas[k] *= (1 - s.bulkFrac);
        this.abioticO2 *= (1 - s.bulkFrac);
        for (let i = 0; i < N; i++) this.co2Ice[i] *= (1 - s.bulkFrac * 0.2);
      }
      this.refreshWater(s.Tm);
    }

    // Ocean area, humidity and snow availability from the water inventory
    // (lagged by one step; used by the next step).
    refreshWater(Tm) {
      const p = this.p, g = this.geo.g;
      const mobile = Math.max(0, p.water - this.nightIce) * OCEAN_KG / this.geo.area;
      const condensed = Math.max(0, mobile - (this.globalColumn || 0));
      const depth = condensed / 1000;
      this.oceanDepth = depth;
      this.fOcean = oceanFraction(depth, g);
      this.rh0 = mobile > 0 ? 0.12 + 0.68 * Math.sqrt(this.fOcean) : 0.05;
      this.snowMax = clamp(depth / 1500, 0, 1);
      this.hpIce = depth * 1000 * g * GE > 1.0e9;
    }

    // Advance the simulation by `years`, using as many adaptive steps as
    // needed (up to maxSteps). Returns the number of years actually advanced.
    advance(years, maxSteps, deadline) {
      this.updateDerived();
      let remaining = years, done = 0, steps = 0;
      maxSteps = maxSteps || 400;
      const clock = typeof performance !== 'undefined' ? performance : Date;
      while (remaining > 1e-12 && steps < maxSteps) {
        if (deadline && (steps & 7) === 7 && clock.now() > deadline) break;
        const limited = remaining < this.dtNext;
        const dt = Math.min(this.dtNext, remaining);
        const ok = this.tryStep(dt);
        steps++;
        if (!ok) { this.dtNext = Math.max(dt / 3, 1e-5); continue; }
        remaining -= dt; done += dt;
        if (!limited) this.dtNext = Math.min(dt * 1.6, 2e7);
      }
      this.computeDiagnostics();
      return done;
    }

    // Integrate the fast temperature field only (used to settle presets).
    spinUp(years) {
      const save = { cc: this.p.carbonCycle, es: this.p.escape, ev: this.p.stellarEvolution };
      this.p.carbonCycle = false; this.p.escape = false; this.p.stellarEvolution = false;
      const t0 = this.time;
      this.advance(years, 4000);
      this.time = t0;
      this.p.carbonCycle = save.cc; this.p.escape = save.es; this.p.stellarEvolution = save.ev;
      this.dtNext = 0.05;
      this.lostWater = 0;
      this.computeDiagnostics();
    }

    computeDiagnostics() {
      const c = this.context();
      const p = this.p;
      const d = { bands: [] };
      let Tm = 0, Tmin = 1e9, Tmax = 0, asr = 0, olr = 0, pv = 0, iceA = 0, liqA = 0, cloud = 0, alb = 0, lim = 0;
      let colSum = 0;
      for (let i = 0; i < N; i++) colSum += W[i] * this.columnWater(this.vapor(this.T[i], c), c);
      this.globalColumn = colSum / 2;
      const condensed = Math.max(0, c.mw - this.globalColumn);
      const hasCondensed = condensed > 1;   // > 1 mm global layer
      const tmp = {};
      let nightT = 0, nightW = 0, dayT = 0, dayW = 0, subT = this.T[0];
      for (let i = 0; i < N; i++) {
        const T = this.T[i];
        const f = this.bandFlux(i, T, c);
        this.albedo(i, T, f.pv, c, tmp);
        const w = W[i] / 2;
        Tm += w * T; Tmin = Math.min(Tmin, T); Tmax = Math.max(Tmax, T);
        asr += w * f.asr; olr += w * f.olr; pv += w * f.pv; alb += w * f.A;
        lim += w * this.radLimit(T, f.pv, c);
        const oceanIce = hasCondensed ? c.fOcean * tmp.ice : 0;
        const landSnow = (1 - c.fOcean) * tmp.snow;
        iceA += w * (oceanIce + landSnow);
        const liquid = hasCondensed && T > 271 && T < TC ? c.fOcean * (1 - tmp.ice) : 0;
        liqA += w * liquid;
        cloud += w * tmp.cloud;
        if (p.locked) {
          if (ALPHA[i] > Math.PI / 2) { nightT += w * T; nightW += w; } else { dayT += w * T; dayW += w; }
        }
        d.bands.push({ T, ice: hasCondensed ? tmp.ice : 0, snow: tmp.snow * (c.mw > 0 ? 1 : 0), cloud: tmp.cloud, liquid: liquid > 0 ? 1 : 0, co2ice: this.co2Ice[i] > 0 ? 1 : 0, A: f.A, asr: f.asr, olr: f.olr });
      }
      const pvb = pv / 1e5;
      const Ptot = c.Pbg + pvb;
      d.Tmean = Tm; d.Tmin = Tmin; d.Tmax = Tmax;
      d.asr = asr; d.olr = olr + c.geoFlux * 0; d.imbalance = asr - olr + c.geoFlux;
      d.olrLimit = lim; d.albedo = alb;
      d.pv = pvb; d.Ptot = Ptot; d.Pbg = c.Pbg;
      d.vaporFrac = pvb / Math.max(Ptot, 1e-12);
      d.iceArea = iceA; d.liquidArea = liqA; d.cloud = cloud;
      d.fOcean = hasCondensed ? c.fOcean : 0; d.fLand = 1 - d.fOcean;
      d.oceanDepth = condensed / 1000;
      d.water = p.water; d.nightIce = this.nightIce;
      d.vaporOceans = this.globalColumn * this.geo.area / OCEAN_KG;
      d.condensedOceans = condensed * this.geo.area / OCEAN_KG;
      d.S = c.S; d.fluxRel = c.S / S0;
      d.haze = c.haze;
      d.stratH2O = this.stratH2O || 0;
      d.co2Ice = this.co2Ice.reduce((s, v) => s + v, 0);
      d.co2Frost = co2Frost(p.gas.CO2 * 1e5);
      d.abioticO2 = this.abioticO2;
      d.hpIce = !!this.hpIce;
      d.D = this.diffusivity(c);
      d.rotBoost = c.rotBoost;
      d.nightT = nightW ? nightT / nightW : null;
      d.dayT = dayW ? dayT / dayW : null;
      d.subT = subT;
      d.boilT = boilT(Ptot);
      d.rates = this.rates;
      d.carbonate = p.carbonate;
      d.lostWater = this.lostWater;
      // ice-line latitude (rotating planets): lowest |lat| that is >50% ice-covered
      if (!p.locked) {
        let line = 90;
        for (let i = 0; i < N; i++) {
          const lat = Math.abs(ALPHA[i] - Math.PI / 2) * 180 / Math.PI;
          if (d.bands[i].ice > 0.5 && lat < line) line = lat;
        }
        d.iceLine = hasCondensed ? line : null;
      }
      this.diag = d;
      return d;
    }

    // Global-mean OLR and absorbed flux for a planet with a uniform surface
    // temperature T (used for the runaway diagram).
    curveAt(T) {
      const c = this.context();
      const pv = this.vapor(T, c);
      let asr = 0;
      for (let i = 0; i < N; i++) asr += W[i] / 2 * c.S * this.q[i] * (1 - this.albedo(i, T, pv, c));
      return { olr: this.olr(T, pv, c), asr: asr + c.geoFlux, lim: this.radLimit(T, pv, c) };
    }
  }

  const api = { Model, defaultParams, planetGeometry, psat, co2Frost, STAR, GASES, N, ALPHA, W, S0, OCEAN_KG, smooth, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Climate = api;
})(typeof window !== 'undefined' ? window : globalThis);

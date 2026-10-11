/*
 * UI, game loop, atlas and missions.
 */
(function () {
  'use strict';
  const Cl = window.Climate, St = window.ClimateStates, Ch = window.Charts;
  const $ = (id) => document.getElementById(id);
  const YR = 3.15576e7;

  // ------------------------------------------------------------ formatting
  function sig(v, d) {
    d = d || 3;
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(d - 1).replace('e+', 'e');
    return Number(v.toPrecision(d)).toString();
  }
  function fmtP(bar) {
    if (!(bar > 0)) return '0';
    if (bar >= 100) return bar.toFixed(0) + ' bar';
    if (bar >= 1) return bar.toFixed(2) + ' bar';
    if (bar >= 1e-3) return Number((bar * 1e3).toPrecision(3)) + ' mbar';
    if (bar >= 1e-6) return Number((bar * 1e6).toPrecision(3)) + ' µbar';
    return Number((bar * 1e9).toPrecision(3)) + ' nbar';
  }
  function fmtOceans(o) {
    if (!(o > 0)) return 'none';
    if (o >= 10) return o.toFixed(0) + ' oceans';
    if (o >= 0.995) return o.toFixed(2) + ' oceans';
    if (o >= 1e-3) return Number(o.toPrecision(2)) + ' ocean';
    return Number((o * 1e3).toPrecision(2)) + '‰ ocean';
  }
  function gelMetres(o, mass) {
    const g = Cl.planetGeometry(mass);
    return o * Cl.OCEAN_KG / g.area / 1000;
  }
  function fmtDepth(m) {
    if (m >= 1000) return (m / 1000).toFixed(m >= 1e4 ? 0 : 1) + ' km';
    if (m >= 1) return m.toFixed(0) + ' m';
    if (m >= 0.001) return (m * 100).toFixed(1) + ' cm';
    return '< 1 mm';
  }
  function fmtDay(h) {
    if (h < 48) return h.toFixed(h < 10 ? 1 : 0) + ' h';
    const d = h / 24;
    return (d < 10 ? d.toFixed(1) : d.toFixed(0)) + ' days';
  }
  const fmtT = (K) => `${K.toFixed(0)} K`;
  const fmtC = (K) => `${(K - 273.15).toFixed(0)} °C`;
  const fmtTime = Ch.fmtTime;

  // ------------------------------------------------------------- the model
  const model = new Cl.Model(Cl.defaultParams());
  let presetId = 'earth';

  // ------------------------------------------------------------- controls
  const GAS_LABEL = { N2: 'N₂ nitrogen', O2: 'O₂ oxygen', CO2: 'CO₂ carbon dioxide', CH4: 'CH₄ methane', H2: 'H₂ hydrogen', SO2: 'SO₂ sulphur dioxide' };
  const GAS_RANGE = { N2: [1e-4, 100], O2: [1e-4, 30], CO2: [1e-7, 300], CH4: [1e-8, 1], H2: [1e-4, 100], SO2: [1e-9, 0.1] };

  const CONTROLS = [
    { title: 'Star & orbit', items: [
      { key: 'flux', label: 'Starlight', type: 'log', min: 0.005, max: 5,
        fmt: (v) => sig(v, 3) + ' S⊕',
        sub: (v) => `${(v * 1361).toFixed(0)} W/m² · ${model.p.star === 'G' ? '≈' + (1 / Math.sqrt(v)).toFixed(2) + ' AU from a Sun' : Cl.STAR[model.p.star].name}` },
      { key: 'star', label: 'Star type', type: 'seg', options: ['F', 'G', 'K', 'M'],
        sub: (v) => `${Cl.STAR[v].name}, ~${Cl.STAR[v].teff} K` },
      { key: 'xuv', label: 'Stellar activity (XUV)', type: 'log', min: 0.1, max: 1000,
        fmt: (v) => sig(v, 2) + '× Sun', sub: () => 'powers hydrogen and atmospheric escape' },
      { key: 'stellarEvolution', label: 'Star brightens with age', type: 'check' }
    ] },
    { title: 'Planet', items: [
      { key: 'mass', label: 'Mass', type: 'log', min: 0.01, max: 10, fmt: (v) => sig(v, 3) + ' M⊕',
        sub: (v) => { const g = Cl.planetGeometry(v); return `R ${g.R.toFixed(2)} R⊕ · g ${(g.g * 9.81).toFixed(1)} m/s² · vₑₛₑ ${g.vesc.toFixed(1)} km/s`; } },
      { key: 'rotationHours', label: 'Day length', type: 'log', min: 2, max: 12000, fmt: fmtDay,
        sub: (v) => model.p.locked ? 'orbital period (locked)' : v > 24 * 16 ? 'slow rotator: broad circulation' : v < 12 ? 'fast rotator: banded, weak heat transport' : '' },
      { key: 'locked', label: 'Tidally locked', type: 'check' },
      { key: 'obliquity', label: 'Obliquity (axial tilt)', type: 'lin', min: 0, max: 90, step: 0.5, fmt: (v) => v.toFixed(1) + '°' }
    ] },
    { title: 'Water', items: [
      { key: 'water', label: 'Water inventory', type: 'log0', min: 1e-5, max: 100, fmt: fmtOceans, live: true,
        sub: (v) => v > 0 ? `${fmtDepth(gelMetres(v, model.p.mass))} global layer · 1 ocean = Earth’s` : 'a completely dry planet' }
    ] },
    { title: 'Atmosphere', items: Cl.GASES.map((g) => ({
      key: 'gas.' + g, label: GAS_LABEL[g], type: 'log0', min: GAS_RANGE[g][0], max: GAS_RANGE[g][1], fmt: fmtP, live: true,
      sub: (v) => {
        const P = model.diag ? model.diag.Ptot : 1;
        if (!(v > 0)) return '';
        const f = v / Math.max(P, 1e-12);
        return f >= 0.01 ? `${(f * 100).toFixed(f > 0.1 ? 0 : 1)}% of the atmosphere` : `${sig(f * 1e6, 3)} ppm`;
      }
    })) },
    { title: 'Geology & space', items: [
      { key: 'carbonCycle', label: 'Carbonate–silicate cycle', type: 'check' },
      { key: 'volcanism', label: 'Volcanic outgassing', type: 'lin', min: 0, max: 10, step: 0.01, fmt: (v) => v.toFixed(2) + '× Earth',
        sub: () => model.p.carbonCycle ? 'CO₂ source; weathering is the sink' : 'only acts with the carbon cycle on' },
      { key: 'escape', label: 'Escape to space', type: 'check' }
    ] }
  ];

  const ctlByKey = {};
  let locks = new Set();

  function getVal(key) {
    if (key.startsWith('gas.')) return model.p.gas[key.slice(4)];
    return model.p[key];
  }
  function setVal(key, v) {
    if (key.startsWith('gas.')) model.p.gas[key.slice(4)] = v;
    else model.p[key] = v;
  }
  function toPos(c, v) {
    if (c.type === 'lin') return (v - c.min) / (c.max - c.min) * 1000;
    const lo = Math.log10(c.min), hi = Math.log10(c.max);
    if (c.type === 'log0') {
      if (!(v >= c.min * 0.999)) return 0;
      return 20 + (Math.log10(v) - lo) / (hi - lo) * 980;
    }
    return (Math.log10(Math.max(v, c.min)) - lo) / (hi - lo) * 1000;
  }
  function fromPos(c, pos) {
    if (c.type === 'lin') { const v = c.min + pos / 1000 * (c.max - c.min); return c.step ? Math.round(v / c.step) * c.step : v; }
    const lo = Math.log10(c.min), hi = Math.log10(c.max);
    if (c.type === 'log0') { if (pos < 10) return 0; return Math.pow(10, lo + Math.max(0, pos - 20) / 980 * (hi - lo)); }
    return Math.pow(10, lo + pos / 1000 * (hi - lo));
  }

  function buildControls() {
    const root = $('controls');
    root.innerHTML = '';
    for (const sec of CONTROLS) {
      const det = document.createElement('details');
      det.className = 'ctl-section'; det.open = true;
      det.innerHTML = `<summary>${sec.title}</summary>`;
      const body = document.createElement('div');
      body.className = 'ctl-body';
      for (const c of sec.items) {
        const row = document.createElement('div');
        row.className = 'ctl' + (c.live ? ' live-capable' : '');
        c.row = row;
        if (c.type === 'check') {
          row.innerHTML = `<label class="check"><input type="checkbox"><span>${c.label}</span></label>`;
          c.input = row.querySelector('input');
          c.input.addEventListener('change', () => { setVal(c.key, c.input.checked); onUserChange(c, c.input.checked); });
        } else if (c.type === 'seg') {
          row.innerHTML = `<div class="ctl-top"><span class="ctl-label">${c.label}</span><span class="ctl-value"></span></div>
            <div class="seg-select">${c.options.map((o) => `<button data-v="${o}">${o}</button>`).join('')}</div><div class="ctl-sub"></div>`;
          c.buttons = [...row.querySelectorAll('button')];
          c.buttons.forEach((b) => b.addEventListener('click', () => { if (locks.has(c.key)) return; setVal(c.key, b.dataset.v); onUserChange(c, b.dataset.v); }));
        } else {
          row.innerHTML = `<div class="ctl-top"><span class="ctl-label">${c.label}</span><span class="ctl-value"></span></div>
            <input type="range" min="0" max="1000" step="1"><div class="ctl-sub"></div>`;
          c.input = row.querySelector('input');
          c.input.addEventListener('pointerdown', () => { c.dragging = true; });
          window.addEventListener('pointerup', () => { c.dragging = false; });
          c.input.addEventListener('input', () => {
            const v = fromPos(c, +c.input.value);
            setVal(c.key, v);
            if (c.key === 'water') model.nightIce = Math.min(model.nightIce, v);
            refreshControl(c, true);
            paramsChanged();
          });
          c.input.addEventListener('change', () => onUserChange(c, getVal(c.key)));
        }
        c.valueEl = row.querySelector('.ctl-value');
        c.subEl = row.querySelector('.ctl-sub');
        ctlByKey[c.key] = c;
        body.appendChild(row);
      }
      det.appendChild(body);
      root.appendChild(det);
    }
  }

  function refreshControl(c, fromUser) {
    const v = getVal(c.key);
    if (c.type === 'check') { c.input.checked = !!v; }
    else if (c.type === 'seg') { c.buttons.forEach((b) => b.classList.toggle('on', b.dataset.v === v)); c.valueEl.textContent = ''; }
    else {
      if (!fromUser && !c.dragging && document.activeElement !== c.input) c.input.value = toPos(c, v);
      c.input.style.setProperty('--fill', (+c.input.value / 10) + '%');
      c.valueEl.textContent = c.fmt(v);
    }
    if (c.subEl && c.sub) c.subEl.textContent = c.sub(v);
    const locked = locks.has(c.key);
    c.row.classList.toggle('locked', locked);
    if (c.input) c.input.disabled = locked;
    if (c.buttons) c.buttons.forEach((b) => { b.disabled = locked; });
  }

  // Values the simulation changes by itself are highlighted.
  const liveSnap = {};
  function refreshControls() {
    for (const k in ctlByKey) {
      const c = ctlByKey[k];
      if (c.live) {
        const v = getVal(k), prev = liveSnap[k];
        const changing = prev !== undefined && Math.abs(v - prev) > 1e-6 * Math.max(Math.abs(prev), 1e-12) && !c.dragging;
        c.row.classList.toggle('live', changing);
        liveSnap[k] = v;
      }
      refreshControl(c, false);
    }
  }

  const changeLog = {};
  function onUserChange(c, v) {
    paramsChanged();
    refreshControl(c, true);
    const now = performance.now();
    const label = c.label.replace(/ (nitrogen|oxygen|carbon dioxide|methane|hydrogen|sulphur dioxide)$/, '');
    const text = c.type === 'check' ? `${label}: ${v ? 'on' : 'off'}` : `${label} → ${c.fmt ? c.fmt(v) : v}`;
    if (changeLog[c.key] && now - changeLog[c.key].at < 1500) {
      changeLog[c.key].entry.text = text;
      renderEvents();
    } else {
      const entry = logEvent(text, '#7cc4ff', true);
      changeLog[c.key] = { at: now, entry };
    }
  }

  function paramsChanged() {
    model.updateDerived();
    model.dtNext = Math.min(model.dtNext, 0.5);
    model.computeDiagnostics();
    runawayCache.at = 0;
  }

  // ------------------------------------------------------------- events
  const events = [];
  function logEvent(text, color, user) {
    const e = { t: model.time, text, color: color || '#888', user: !!user };
    events.unshift(e);
    if (events.length > 80) events.pop();
    renderEvents();
    return e;
  }
  function renderEvents() {
    $('events').innerHTML = events.map((e) =>
      `<li><span class="t">${fmtTime(e.t)}</span><span class="d" style="background:${e.color}"></span><span>${e.text}</span></li>`).join('');
  }

  function toast(title, text, color) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeftColor = color || 'var(--accent)';
    el.innerHTML = `<b>${title}</b><span>${text}</span>`;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 5200);
  }

  // ------------------------------------------------------------- atlas
  const STORE_KEY = 'worldsmith.v1';
  let saved = { atlas: {}, missions: {} };
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) saved = Object.assign(saved, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ } }

  function discover(id) {
    if (saved.atlas[id]) return;
    const preset = St.PRESETS.find((p) => p.id === presetId);
    saved.atlas[id] = { t: model.time, world: preset ? preset.name : 'custom' };
    persist();
    const s = St.STATES[id];
    toast('New climate state: ' + s.name, s.blurb, s.color);
    renderAtlas();
  }

  const openCards = new Set();
  function renderAtlas() {
    const groups = ['Habitable', 'Cold', 'Hot'];
    const n = Object.keys(saved.atlas).length, tot = St.ORDER.length;
    $('atlasCount').textContent = `${n}/${tot}`;
    let html = '';
    for (const g of groups) {
      html += `<div class="atlas-group"><h3>${g}</h3><div class="atlas-grid">`;
      for (const id of St.ORDER) {
        const s = St.STATES[id];
        if (s.group !== g) continue;
        const found = saved.atlas[id];
        const cls = ['atlas-card', found ? '' : 'unknown', openCards.has(id) ? 'open' : '', currentState === id ? 'current' : ''].join(' ');
        if (found) {
          html += `<div class="${cls}" data-id="${id}"><div class="nm"><i style="background:${s.color}"></i>${s.name}</div>
            <div class="hint">found at ${fmtTime(found.t)} · ${found.world}</div>
            <div class="more"><p>${s.blurb}</p><p>${s.science}</p></div></div>`;
        } else {
          html += `<div class="${cls}" data-id="${id}"><div class="nm"><i style="background:#333a52"></i>Undiscovered</div>
            <div class="hint">${s.hint}</div></div>`;
        }
      }
      html += '</div></div>';
    }
    html += `<p class="note" style="margin-top:14px"><button class="btn small ghost" id="resetAtlas">Forget discoveries</button></p>`;
    $('atlas').innerHTML = html;
    $('atlas').querySelectorAll('.atlas-card').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (!saved.atlas[id]) return;
      if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
      renderAtlas();
    }));
    $('resetAtlas').addEventListener('click', () => {
      if (!confirm('Forget all discovered states and completed missions?')) return;
      saved = { atlas: {}, missions: {} }; persist(); renderAtlas(); renderMissions();
    });
  }

  // ------------------------------------------------------------- missions
  let mission = null;
  const LOCK_MAP = { flux: 'flux', star: 'star', mass: 'mass', water: 'water', locked: 'locked', obliquity: 'obliquity', rotationHours: 'rotationHours', stellarEvolution: 'stellarEvolution' };

  function renderMissions() {
    $('missions').innerHTML = St.MISSIONS.map((m) => {
      const done = saved.missions[m.id];
      const active = mission && mission.def.id === m.id;
      return `<div class="mission ${done ? 'done' : ''}">
        <h4><span>${m.name}</span>${done ? `<span class="done-mark">✓ done at ${fmtTime(done.t)}</span>` : ''}</h4>
        <p>${m.text}</p>
        <div class="hud-row"><span class="tip">${active ? 'In progress…' : 'Start: ' + St.PRESETS.find((p) => p.id === m.preset).name}</span>
        <button class="btn small" data-m="${m.id}">${active ? 'Restart' : 'Start'}</button></div></div>`;
    }).join('');
    $('missions').querySelectorAll('button[data-m]').forEach((b) => b.addEventListener('click', () => startMission(b.dataset.m)));
  }

  function startMission(id) {
    const def = St.MISSIONS.find((m) => m.id === id);
    loadPreset(def.preset, true);
    if (def.setup) { def.setup(model.p); paramsChanged(); model.spinUp(30); }
    mission = { def, holdStart: null, progress: 0, done: false, failed: false };
    locks = new Set(def.locked.map((k) => LOCK_MAP[k]).filter(Boolean));
    refreshControls();
    logEvent('Mission started: ' + def.name, '#ffcf5c');
    renderMissions();
    renderHud();
    setPaused(false);
  }

  function endMission() {
    mission = null; locks = new Set();
    $('missionHud').hidden = true;
    refreshControls(); renderMissions();
  }

  function evalMission(cls) {
    if (!mission || mission.done || mission.failed) return;
    const def = mission.def;
    const s = { id: currentState, tags: cls.tags };
    if (def.failIf && model.time > 2e3 && def.failIf(s, model)) {
      mission.failed = true;
      toast('Mission failed: ' + def.name, `The planet became a ${St.STATES[currentState].name.toLowerCase()} at ${fmtTime(model.time)}.`, '#ff7a59');
      logEvent('Mission failed', '#ff7a59');
      renderHud();
      return;
    }
    if (def.goal(s, model)) {
      if (mission.holdStart === null) mission.holdStart = model.time;
      const held = model.time - mission.holdStart;
      mission.progress = def.hold ? Math.min(1, held / def.hold) : 1;
      if (def.id === 'future') mission.progress = Math.min(1, model.time / 2e9);
      if (mission.progress >= 1) {
        mission.done = true;
        saved.missions[def.id] = { t: model.time }; persist();
        toast('Mission complete: ' + def.name, 'Well done. Try another mission or keep exploring.', '#57d9a3');
        logEvent('Mission complete: ' + def.name, '#57d9a3');
        renderMissions();
      }
    } else {
      mission.holdStart = null;
      mission.progress = def.id === 'future' ? Math.min(1, model.time / 2e9) : 0;
    }
  }

  function renderHud() {
    const hud = $('missionHud');
    if (!mission) { hud.hidden = true; return; }
    hud.hidden = false;
    const def = mission.def;
    const status = mission.done ? '<b style="color:var(--good)">Complete!</b>' : mission.failed ? '<b style="color:var(--bad)">Failed</b>' :
      def.hold && mission.holdStart !== null ? `holding: ${fmtTime(model.time - mission.holdStart)} / ${fmtTime(def.hold)}` :
      def.id === 'future' ? `${fmtTime(model.time)} / 2 Gyr` : 'goal not met yet';
    hud.innerHTML = `<h4>${def.name}</h4><p>${def.text}</p>
      <div class="progress"><div style="width:${(mission.progress * 100).toFixed(1)}%"></div></div>
      <div class="hud-row"><span>${status}</span><span><button class="btn small ghost" id="hudTip">Hint</button> <button class="btn small ghost" id="hudQuit">Leave</button></span></div>`;
    $('hudQuit').onclick = endMission;
    $('hudTip').onclick = () => toast('Hint', def.tip, '#ffcf5c');
  }

  // ------------------------------------------------------------- presets
  function buildPresets() {
    const sel = $('presetSelect');
    sel.innerHTML = St.PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.addEventListener('change', () => { if (mission) endMission(); loadPreset(sel.value); });
  }

  function loadPreset(id, keepMission) {
    const pr = St.PRESETS.find((p) => p.id === id) || St.PRESETS[0];
    presetId = pr.id;
    $('presetSelect').value = pr.id;
    if (!keepMission && mission) endMission();
    model.p = pr.params();
    model.reset(pr.T0);
    model.spinUp(30);
    history.clear();
    events.length = 0;
    currentState = null; pending = null;
    logEvent(`Loaded ${pr.name}. ${pr.note}`, '#9aa6c8');
    setSpeed(pr.rate);
    runawayCache.at = 0;
    for (const k in liveSnap) delete liveSnap[k];
    refreshControls();
  }

  // ------------------------------------------------------------- time
  let paused = false;
  let speedExp = 2;
  function setPaused(p) {
    paused = p;
    $('playBtn').innerHTML = p ? '<span class="ico-play"></span>' : '<span class="ico-pause"></span>';
    $('playBtn').setAttribute('aria-label', p ? 'Play' : 'Pause');
  }
  function setSpeed(e) {
    speedExp = Math.min(9, Math.max(-1, e));
    $('speed').value = speedExp;
    $('speed').style.setProperty('--fill', ((speedExp + 1) / 10 * 100) + '%');
    $('speedLabel').textContent = fmtTime(Math.pow(10, speedExp)) + ' / s';
  }

  // ------------------------------------------------------------- state tracking
  let currentState = null, pending = null, pendingAt = 0, pendingSim = 0, lastCls = null;
  function trackState(now) {
    const cls = St.classify(model);
    lastCls = cls;
    if (currentState === null) {
      currentState = cls.id;
      logEvent(St.STATES[cls.id].name, St.STATES[cls.id].color);
      discover(cls.id);
    } else if (cls.id !== currentState) {
      if (pending !== cls.id) { pending = cls.id; pendingAt = now; pendingSim = model.time; }
      else if (now - pendingAt > 300 || (paused && now - pendingAt > 100)) {
        currentState = cls.id; pending = null;
        logEvent('→ ' + St.STATES[cls.id].name, St.STATES[cls.id].color);
        discover(cls.id);
        if ($('tab-atlas').hidden === false) renderAtlas();
      }
    } else pending = null;
    return cls;
  }

  // ------------------------------------------------------------- status panel
  function renderStatus(cls) {
    const s = St.STATES[currentState];
    const d = model.diag, p = model.p;
    $('stateName').textContent = s.name;
    $('stateGroup').textContent = s.group;
    $('stateDot').style.background = s.color; $('stateDot').style.color = s.color;
    $('stateBadge').style.borderColor = s.color + '66';
    $('stateTags').innerHTML = cls.tags.map((t) => `<span class="tag">${t}</span>`).join('');

    $('stateCard').style.borderLeftColor = s.color;
    $('stateCard').innerHTML = `<div class="state-group">${s.group}</div><h2>${s.name}</h2><p>${s.blurb}</p><p class="sci">${s.science}</p>`;
    $('narrative').innerHTML = narrative(cls).map((t) => `<p>${t}</p>`).join('');

    const imb = d.imbalance;
    const waterTot = d.water;
    const vapF = waterTot > 0 ? d.vaporOceans / waterTot : 0, iceF = waterTot > 0 ? d.nightIce / waterTot : 0;
    const condF = Math.max(0, 1 - vapF - iceF);
    const metric = (k, v, s2, wide, extra) => `<div class="metric${wide ? ' wide' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s2 ? `<div class="s">${s2}</div>` : ''}${extra || ''}</div>`;
    const rates = d.rates || {};
    let html = '';
    html += metric('Mean surface', `${fmtT(d.Tmean)} · ${fmtC(d.Tmean)}`, `range ${fmtC(d.Tmin)} to ${fmtC(d.Tmax)}`);
    html += metric('Surface pressure', fmtP(d.Ptot), d.pv > 1e-3 ? `water vapour ${fmtP(d.pv)}` : `boiling point ${fmtC(d.boilT)}`);
    html += metric('Energy balance', `${imb >= 0 ? '+' : ''}${imb.toFixed(1)} W/m²`, `in ${d.asr.toFixed(0)} · out ${d.olr.toFixed(0)} · limit ${(282 * Math.pow(model.geo.g, 0.1)).toFixed(0)}`);
    html += metric('Bond albedo', d.albedo.toFixed(2), `star ${d.fluxRel.toFixed(3)} S⊕`);
    html += metric('Liquid water', `${(d.liquidArea * 100).toFixed(1)}% of surface`, `ocean area ${(d.fOcean * 100).toFixed(0)}%`);
    html += metric('Ice & snow', `${(d.iceArea * 100).toFixed(0)}% of surface`, d.iceLine != null && d.iceLine < 90 ? `ice edge at ${d.iceLine.toFixed(0)}°` : (d.co2Ice > 1e-4 ? `CO₂ frost ${fmtP(d.co2Ice)}` : ''));
    html += metric('Water inventory', fmtOceans(waterTot),
      waterTot > 0 ? `${(condF * 100).toFixed(0)}% surface · ${(vapF * 100).toFixed(0)}% vapour${iceF > 0.005 ? ` · ${(iceF * 100).toFixed(0)}% nightside ice` : ''}` : (d.lostWater > 0 ? `${fmtOceans(d.lostWater)} lost to space` : ''),
      true, waterTot > 0 ? `<div class="bar"><i style="width:${condF * 100}%;background:#3a8dde"></i><i style="width:${vapF * 100}%;background:#e9eef7"></i><i style="width:${iceF * 100}%;background:#9fc9e8"></i></div>` : '');
    html += metric('Stratospheric H₂O', d.stratH2O > 0 ? sig(d.stratH2O, 2) : '—', d.stratH2O > 3e-3 ? 'above the 3×10⁻³ moist-greenhouse threshold' : 'cold-trapped');
    html += metric('Water escape', rates.waterLoss > 1e-4 ? `${sig(rates.waterLoss, 2)} oceans/Gyr` : 'negligible', rates.escapeLimited ? `${rates.escapeLimited}-limited` : (p.escape ? '' : 'escape off'));
    html += metric('CO₂', fmtP(p.gas.CO2), p.carbonCycle && rates.outgas ? `outgassing ${sig(rates.outgas * 1e6, 2)} · weathering ${sig(rates.weather * 1e6, 2)} bar/Myr` : 'carbon cycle off');
    html += metric('Carbonate rocks', fmtP(p.carbonate), rates.decomp ? 'decomposing on a hot surface' : 'locked-up CO₂ (bar-equivalent)');
    if (d.abioticO2 > 1e-5) html += metric('Abiotic O₂', fmtP(d.abioticO2), 'oxygen left behind by escaping hydrogen');
    if (p.locked) html += metric('Day / night side', `${fmtC(d.dayT)} / ${fmtC(d.nightT)}`, `substellar ${fmtC(d.subT)}`, true);
    $('metrics').innerHTML = html;
  }

  function narrative(cls) {
    const d = model.diag, p = model.p, out = [];
    const r = d.rates || {};
    const id = currentState;
    const area = model.geo.area;
    if (id === 'wetRunaway') {
      const cond = d.condensedOceans;
      const kgm2 = cond * Cl.OCEAN_KG / area;
      const E = kgm2 * (2.4e6 + 4200 * Math.max(0, 600 - d.Tmean)) + 2000 * (d.Ptot * 1e5 / (model.geo.g * 9.81)) * Math.max(0, 1500 - d.Tmean);
      const t = d.imbalance > 0.5 ? E / (d.imbalance * YR) : Infinity;
      const pct = 100 * d.vaporOceans / Math.max(d.water, 1e-12);
      out.push(`The oceans are boiling off: ${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}% of the water is already vapour (${fmtP(d.pv)} of steam). ` +
        (isFinite(t) ? `With a surplus of ${d.imbalance.toFixed(0)} W/m² above the radiation limit, finishing the job and heating the steam takes roughly <b>${fmtTime(t)}</b>.` : 'The surplus is tiny, so this will be very slow.'));
    } else if (id === 'steam' || id === 'magma') {
      if (r.waterLoss > 1e-4) out.push(`Hydrogen escape is removing ${sig(r.waterLoss, 2)} oceans per Gyr (${r.escapeLimited}-limited): the remaining ${fmtOceans(d.water)} last ~<b>${fmtTime(d.water / r.waterLoss * 1e9)}</b>. Raise XUV activity to mimic a young, active star.`);
      else if (d.water > 0) out.push(p.escape ? 'Escape is very slow here.' : 'Escape is switched off, so this steam atmosphere will not dry out.');
      if (id === 'magma' && d.water > 0.01) out.push('If the star dimmed, the steam would condense into oceans within thousands to millions of years (a “type I” planet). Here it cannot — a “type II” planet.');
    } else if (id === 'moist') {
      if (r.waterLoss > 0) out.push(`The stratosphere is wet. Hydrogen escape removes ${sig(r.waterLoss, 2)} oceans per Gyr, so the oceans last ~<b>${fmtTime(d.water / r.waterLoss * 1e9)}</b> while still liquid.`);
    } else if (id === 'snowball') {
      if (p.carbonCycle && r.outgas) {
        const B = 1 + 60 * d.fOcean * Math.min(1, Math.sqrt(4e-4 / Math.max(p.gas.CO2, 1e-9)));
        const rate = (r.outgas - r.weather) / B;
        if (rate > 0) {
          const need = Math.max(0, 0.15 - p.gas.CO2);
          out.push(`Weathering has stopped under the ice while volcanoes keep venting. CO₂ rises by ${sig(rate * 1e6, 2)} bar/Myr; at ~0.1–0.3 bar the equator should thaw (~${fmtTime(need / rate)} from now).`);
        }
      } else out.push('With the carbon cycle off, nothing will rescue this snowball unless you change the atmosphere or the star.');
    } else if (id === 'collapse') {
      out.push(`CO₂ is snowing out onto the cold traps: ${fmtP(d.co2Ice)} is now frost and ${fmtP(p.gas.CO2)} is left in the air.`);
    } else if (id === 'nightTrap' || (p.locked && d.nightIce > 0.05 * d.water && d.water > 0)) {
      out.push(`${(100 * d.nightIce / Math.max(d.water, 1e-12)).toFixed(0)}% of the water is locked in nightside glaciers.`);
    }
    if (['temperate', 'hothouse', 'glacial', 'ocean', 'desert', 'cloudShield', 'eyeball', 'waterbelt'].includes(id)) {
      if (d.imbalance > 3) out.push(`Absorbing ${d.imbalance.toFixed(0)} W/m² more than it emits: warming.`);
      else if (d.imbalance < -3) out.push(`Emitting ${(-d.imbalance).toFixed(0)} W/m² more than it absorbs: cooling.`);
      const lim = 282 * Math.pow(model.geo.g, 0.1);
      if (d.asr > 0.93 * lim && d.asr < lim) out.push(`Absorbed sunlight is ${(100 * d.asr / lim).toFixed(0)}% of the runaway limit: close to the inner edge.`);
      if (p.carbonCycle && r.outgas && r.weather) {
        const ratio = r.weather / r.outgas;
        if (ratio > 1.3) out.push('Weathering outpaces volcanism: CO₂ is being drawn down.');
        else if (ratio < 0.7) out.push('Volcanism outpaces weathering: CO₂ is building up.');
      }
    }
    if (p.stellarEvolution) out.push(`The star is now ${((model.luminosityFactor() - 1) * 100).toFixed(1)}% brighter than at the start.`);
    return out;
  }

  function renderQuick() {
    const d = model.diag;
    $('quickStats').innerHTML = `
      <span class="k">Surface</span><span class="v">${fmtC(d.Tmean)}</span>
      <span class="k">Pressure</span><span class="v">${fmtP(d.Ptot)}</span>
      <span class="k">Liquid water</span><span class="v">${(d.liquidArea * 100).toFixed(0)}%</span>
      <span class="k">Ice</span><span class="v">${(d.iceArea * 100).toFixed(0)}%</span>
      <span class="k">Balance</span><span class="v" style="color:${Math.abs(d.imbalance) < 1 ? 'inherit' : d.imbalance > 0 ? 'var(--accent2)' : 'var(--accent)'}">${d.imbalance >= 0 ? '+' : ''}${d.imbalance.toFixed(1)} W/m²</span>`;
  }

  // ------------------------------------------------------------- charts
  const history = new Ch.History(2400);
  let histSpan = 0;
  const runawayCache = { at: 0, curve: [] };
  function renderCharts(now) {
    if ($('tab-charts').hidden) return;
    const pts = history.window(histSpan);
    Ch.drawHistory($('chartHistory'), pts, St.STATES);
    Ch.drawVolatiles($('chartVolatiles'), pts);
    Ch.drawProfile($('chartProfile'), model);
    if (now - runawayCache.at > 700) { runawayCache.curve = Ch.runawayCurve(model); runawayCache.at = now; }
    Ch.drawRunaway($('chartRunaway'), model, runawayCache);
  }

  // ------------------------------------------------------------- tabs
  function setupTabs() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $('helpBtn').addEventListener('click', () => showTab('science'));
    $('histWindow').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      histSpan = +b.dataset.span;
      $('histWindow').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    }));
  }
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-body').forEach((b) => { b.hidden = b.id !== 'tab-' + name; });
    if (name === 'atlas') renderAtlas();
    if (name === 'missions') renderMissions();
    if (name === 'charts') runawayCache.at = 0;
  }

  // ------------------------------------------------------------- planet view
  const view = { yaw: 0, pitch: 0, scale: 0.68, dragging: false };
  function setupView(canvas) {
    let lx = 0, ly = 0, id = null;
    canvas.addEventListener('pointerdown', (e) => { id = e.pointerId; lx = e.clientX; ly = e.clientY; view.dragging = true; canvas.setPointerCapture(id); canvas.classList.add('dragging'); });
    canvas.addEventListener('pointermove', (e) => {
      if (!view.dragging || e.pointerId !== id) return;
      view.yaw += (e.clientX - lx) * 0.008;
      view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
    });
    const up = () => { view.dragging = false; canvas.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.scale = Math.max(0.35, Math.min(0.95, view.scale * Math.exp(-e.deltaY * 0.001))); }, { passive: false });
  }

  // ------------------------------------------------------------- main loop
  let renderer = null;
  let last = performance.now();
  let visualTime = 0, uiAt = 0, achieved = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(Math.max(dt, 0), 0.1);      // tab switches / hiccups never cause a jump
    if (!paused) {
      const want = Math.pow(10, speedExp) * dt;
      const done = model.advance(want, 600, performance.now() + 9);
      achieved = achieved * 0.9 + (dt > 0 ? done / dt : 0) * 0.1;
    } else achieved = 0;
    visualTime += dt;
    const cls = trackState(now);
    history.push({ t: model.time, Tmean: model.diag.Tmean, Tmin: model.diag.Tmin, Tmax: model.diag.Tmax, water: model.diag.water, P: model.diag.Ptot, CO2: model.p.gas.CO2, state: currentState });
    evalMission(cls);
    if (renderer && renderer.ok) renderer.render(model, dt, { visualTime, paused, yaw: view.yaw, pitch: view.pitch, scale: view.scale, dragging: view.dragging });

    $('simTime').textContent = 't = ' + fmtTime(model.time);
    if (now - uiAt > 220) {
      uiAt = now;
      const wantRate = Math.pow(10, speedExp);
      $('rateInfo').textContent = paused ? 'paused' : achieved < 0.6 * wantRate ? `running at ${fmtTime(achieved)}/s (model-limited)` : 'step ' + fmtTime(model.dtNext);
      renderStatus(cls);
      renderQuick();
      refreshControls();
      renderCharts(now);
      if (mission) renderHud();
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------- boot
  function boot() {
    buildControls();
    buildPresets();
    setupTabs();
    $('science').innerHTML = window.SCIENCE_HTML;
    $('playBtn').addEventListener('click', () => setPaused(!paused));
    $('speed').addEventListener('input', () => setSpeed(+$('speed').value));
    $('resetBtn').addEventListener('click', () => { if (mission) startMission(mission.def.id); else loadPreset(presetId); });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range' || e.target.tagName === 'SELECT')) return;
      if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
      if (e.key === ']') setSpeed(speedExp + 0.5);
      if (e.key === '[') setSpeed(speedExp - 0.5);
    });
    const canvas = $('planet');
    renderer = new window.PlanetRenderer.Renderer(canvas);
    if (!renderer.ok) $('noGL').hidden = false;
    setupView(canvas);
    loadPreset('earth');
    renderAtlas();
    renderMissions();
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  }
  boot();
})();

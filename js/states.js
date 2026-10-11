/*
 * Climate-state classification, the state atlas, presets and missions.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ atlas
  const STATES = {
    temperate: {
      name: 'Temperate habitable world', color: '#4fc3a1', group: 'Habitable',
      blurb: 'Liquid oceans over most of the surface, ice confined to high latitudes. The carbon-silicate thermostat can keep it here for billions of years.',
      science: 'Planets like modern Earth sit in a stable basin: warmer surfaces weather silicate rock faster, drawing down CO₂ (Walker, Hays & Kasting 1981). That feedback works on 10⁵–10⁶-year timescales.',
      hint: 'Start from Modern Earth.'
    },
    hothouse: {
      name: 'Hothouse (ice-free, humid)', color: '#e8b44c', group: 'Habitable',
      blurb: 'No permanent ice anywhere, a moist and warm atmosphere, weak equator-to-pole contrast. Earth was like this in the Cretaceous and the PETM.',
      science: 'Water-vapour feedback strengthens as the surface warms. Still well short of the stratosphere getting wet, so water loss stays negligible.',
      hint: 'Warm a temperate world a little: more CO₂ or a few % more sunlight.'
    },
    glacial: {
      name: 'Glacial (ice-age) world', color: '#9cc7e6', group: 'Cold',
      blurb: 'Sea ice and snow reach into the mid-latitudes. Still habitable, but the ice-albedo feedback is close to running away.',
      science: 'Budyko–Sellers models show the ice edge becomes unstable once it passes roughly 30° latitude; beyond that the planet slides into a snowball within decades to centuries.',
      hint: 'Dim the star slightly or remove CO₂.'
    },
    waterbelt: {
      name: 'Waterbelt (Jormungand)', color: '#7fb3d5', group: 'Cold',
      blurb: 'Ice reaches the tropics yet a narrow belt of open water survives at the equator.',
      science: 'Bare, snow-free sea ice in the dry subtropics is much darker than snow, which can halt the ice edge short of the equator (Abbot, Voigt & Koll 2011). Whether this state is robust in fully coupled models is still debated.',
      hint: 'Cool a world very slowly from a glacial state.'
    },
    snowball: {
      name: 'Snowball', color: '#e6f2ff', group: 'Cold',
      blurb: 'Oceans frozen pole to pole. Bright ice reflects most sunlight; it is self-sustaining even under today’s Sun.',
      science: 'Escape needs volcanic CO₂ to build up (~0.1 bar) while silicate weathering is shut off — roughly 1–30 million years (Hoffman & Schrag 2002). The exit is abrupt and overshoots into a hot, high-CO₂ aftermath.',
      hint: 'Cool Earth below ~0.95 S⊕ or remove most CO₂.'
    },
    moist: {
      name: 'Moist greenhouse', color: '#f39c6b', group: 'Hot',
      blurb: 'Oceans persist, but the stratosphere is wet enough (H₂O > 3×10⁻³) for sunlight to split water and hydrogen to escape to space.',
      science: 'Kasting (1988) showed a planet can lose its oceans while they are still liquid. Diffusion-limited escape removes an Earth ocean in ~10⁸–10⁹ years. More N₂ dilutes stratospheric water and slows the loss.',
      hint: 'Very high CO₂ at Earth-like sunlight, or a world close to its runaway limit.'
    },
    wetRunaway: {
      name: 'Wet runaway greenhouse (in progress)', color: '#ff7043', group: 'Hot',
      blurb: 'Absorbed sunlight exceeds what a saturated steam atmosphere can radiate (~282 W/m²). The oceans are boiling off into the atmosphere.',
      science: 'Above the Simpson–Nakajima limit there is no equilibrium with a liquid ocean. Evaporating ~1.4×10²¹ kg of water and heating it takes ~10¹³ J/m², so with a 10–100 W/m² surplus the transition lasts ~10³–10⁵ years (Goldblatt et al. 2013; Leconte et al. 2013 put the trigger near 1.1 S⊕ for Earth).',
      hint: 'Push an ocean world past ~1.1 S⊕.'
    },
    steam: {
      name: 'Steam atmosphere (post-runaway)', color: '#ffd1b3', group: 'Hot',
      blurb: 'Every ocean is now vapour: hundreds of bar of supercritical steam over a red-hot surface.',
      science: 'Once the ocean is gone the radiation limit no longer caps cooling; the surface heats until near-infrared windows open at ~1400–2000 K (Boukrouche et al. 2021). Hydrogen escape then slowly dries the planet over 10⁷–10⁹ years.',
      hint: 'Let a wet runaway finish.'
    },
    magma: {
      name: 'Magma-ocean surface', color: '#ff3d00', group: 'Hot',
      blurb: 'The surface is molten rock glowing through a thick atmosphere.',
      science: 'Hamano et al. (2013): planets inside a critical orbital distance (“type II”) keep a magma ocean until their water escapes, ~10⁸ years; farther out (“type I”) steam condenses into oceans within ~1 Myr.',
      hint: 'A post-runaway steam world, or a young planet starting hot.'
    },
    dryRunaway: {
      name: 'Dry runaway (desiccated hot world)', color: '#d4a373', group: 'Hot',
      blurb: 'A planet with little water pushed beyond even the land-planet limit: its scant water evaporates in centuries and the surface bakes dry.',
      science: 'Land planets radiate more (unsaturated air) and resist the runaway up to ~1.7 S⊕ (Abe et al. 2011). Past that, with so little water to evaporate, the transition is fast — there is no ocean heat sink to slow it.',
      hint: 'A desert planet with very strong sunlight, or a steam world that has lost its water.'
    },
    venus: {
      name: 'Venus-like CO₂ hothouse', color: '#e9c46a', group: 'Hot',
      blurb: 'Bone-dry, with tens of bar of CO₂ and a crushing, opaque atmosphere. Surface hot enough to glow faintly.',
      science: 'Without liquid water, silicate weathering stops and carbonates break down (the Urey reaction), so outgassed and crustal CO₂ accumulate. Venus’ D/H ratio (~120× Earth) records the water it lost.',
      hint: 'Follow a runaway to completion with escape on, or bake a dry world.'
    },
    desert: {
      name: 'Habitable desert (land planet)', color: '#d9b26f', group: 'Habitable',
      blurb: 'Mostly land with lakes or shallow seas. Dry air means a weak water-vapour greenhouse and few clouds.',
      science: 'Land planets have a wider habitable zone than aqua planets: they stay habitable up to ~1.7 S⊕ and freeze later on the cold side (Abe et al. 2011; Kodama et al. 2018).',
      hint: 'Reduce the water inventory to ~1–5% of an Earth ocean.'
    },
    ocean: {
      name: 'Ocean world', color: '#3a7bd5', group: 'Habitable',
      blurb: 'A global ocean with no exposed continents.',
      science: 'Without land, only seafloor weathering regulates CO₂, which is weaker and less temperature-sensitive (Abbot, Cowan & Ciesla 2012).',
      hint: 'Add a few Earth oceans of water.'
    },
    deepOcean: {
      name: 'Deep water world (high-pressure ice)', color: '#2b4c9b', group: 'Habitable',
      blurb: 'An ocean so deep that high-pressure ice forms on the seafloor, cutting the water off from rock.',
      science: 'Once the seafloor exceeds ~1 GPa, ice VI/VII separates ocean from crust; the carbonate-silicate thermostat stops working (Kitzmann et al. 2015; Noack et al. 2016).',
      hint: 'Tens of Earth oceans of water.'
    },
    eyeball: {
      name: 'Eyeball world', color: '#5ad1e6', group: 'Habitable',
      blurb: 'A tidally locked planet with an open ocean under its sun and ice everywhere else — an iris of water in a white eye.',
      science: 'Pierrehumbert (2011) coined “eyeball Earth”; Yang, Cowan & Abbot (2013) showed the substellar cloud deck lets such planets stay habitable at twice the flux 1-D models allow.',
      hint: 'Tidally lock a temperate planet around an M dwarf.'
    },
    nightTrap: {
      name: 'Nightside glacier world', color: '#a7c4d8', group: 'Cold',
      blurb: 'Most of the water has migrated to the frozen nightside and is trapped there as kilometres-thick ice; the dayside is a dry desert.',
      science: 'On locked planets with limited water, ice sheets on the cold nightside can trap the entire inventory unless geothermal flux melts their base (Leconte et al. 2013; Menou 2013).',
      hint: 'A locked planet with a cold nightside and modest water.'
    },
    cloudShield: {
      name: 'Cloud-shielded slow rotator', color: '#cfd8dc', group: 'Habitable',
      blurb: 'A slowly rotating world beyond the classical inner edge, kept cool by a permanent bright cloud deck under the star.',
      science: 'With weak Coriolis forces, convection concentrates under the substellar point and builds thick reflective clouds (Yang et al. 2014; Way et al. 2016 applied this to early Venus).',
      hint: 'Slow the rotation to tens of days and raise the sunlight.'
    },
    h2World: {
      name: 'Hydrogen-greenhouse world', color: '#80deea', group: 'Habitable',
      blurb: 'Kept warm far from its star by collision-induced absorption in a thick H₂ envelope.',
      science: 'Pierrehumbert & Gaidos (2011): tens of bar of primordial H₂ can keep liquid water out to many AU; in CO₂ atmospheres a few % H₂ adds strong CO₂–H₂ absorption (Wordsworth et al. 2017).',
      hint: 'Very low sunlight plus bars of H₂.'
    },
    coldDesert: {
      name: 'Cold desert (Mars-like)', color: '#c1440e', group: 'Cold',
      blurb: 'A thin atmosphere, frozen water hiding in polar caps and the subsurface, and dust everywhere else.',
      science: 'Thin atmospheres transport little heat and add little greenhouse warming. Liquid water is unstable when pressure is near water’s triple point (6 mbar).',
      hint: 'A small planet with a thin atmosphere.'
    },
    collapse: {
      name: 'Atmospheric collapse', color: '#b39ddb', group: 'Cold',
      blurb: 'CO₂ is snowing out onto the coldest regions faster than it can return — the atmosphere is freezing out.',
      science: 'Lower pressure means less heat transport and less greenhouse warming, so cold traps get colder still. Forget et al. (2013) found early Mars collapses below ~0.5–1 bar; tidally locked nightsides are vulnerable too.',
      hint: 'A thin CO₂ atmosphere with very cold poles or nightside.'
    },
    titan: {
      name: 'Cryogenic methane world (Titan-like)', color: '#e0a458', group: 'Cold',
      blurb: 'A thick nitrogen atmosphere at ~90 K, orange organic haze, and methane in the role water plays on Earth.',
      science: 'Titan’s haze acts as an anti-greenhouse (−9 K) while CH₄–N₂ and H₂–N₂ collision-induced absorption warm it (+21 K) (McKay et al. 1991).',
      hint: 'Very faint sunlight, ~1.5 bar N₂ and a few % CH₄.'
    },
    frozen: {
      name: 'Frozen world', color: '#90a4ae', group: 'Cold',
      blurb: 'Too cold for liquid water anywhere, but the atmosphere holds.',
      science: 'Beyond the maximum-greenhouse limit even thick CO₂ cannot keep surface water liquid, because CO₂ clouds and Rayleigh scattering win (Kopparapu et al. 2013).',
      hint: 'Move a planet far from its star.'
    },
    airless: {
      name: 'Airless rock', color: '#9e9e9e', group: 'Cold',
      blurb: 'Essentially no atmosphere: extreme day/night swings, no weather, no liquids.',
      science: 'Small, low-gravity bodies lose their atmospheres to thermal and XUV-driven escape over billions of years.',
      hint: 'A Moon-mass body with an active star.'
    }
  };

  const ORDER = ['temperate', 'hothouse', 'desert', 'ocean', 'deepOcean', 'eyeball', 'cloudShield', 'h2World',
    'glacial', 'waterbelt', 'snowball', 'nightTrap', 'coldDesert', 'collapse', 'titan', 'frozen', 'airless',
    'moist', 'wetRunaway', 'steam', 'magma', 'dryRunaway', 'venus'];

  // ------------------------------------------------------------- classifier
  function classify(model) {
    const d = model.diag, p = model.p, g = model.geo.g;
    const tags = [];
    const liquid = d.liquidArea > 0.002;
    const lim = 282 * Math.pow(g, 0.1);
    let id;

    if (d.Ptot < 1e-4) id = 'airless';
    else if (d.Tmax > 1450) id = 'magma';
    else if (d.water > 0.02 && d.vaporFrac > 0.5 && d.condensedOceans < 0.02 * d.water + 1e-4 && d.Tmean > 450) id = 'steam';
    else if (d.condensedOceans > 1e-4 && d.imbalance > 1.5 && d.pv > 0.2 && d.olr > 0.9 * lim) id = 'wetRunaway';
    else if (!liquid && d.Tmean > 380) id = (p.gas.CO2 > 10 && p.gas.CO2 > 0.5 * d.Pbg) ? 'venus' : 'dryRunaway';
    else if (liquid) {
      const ocean = Math.max(d.fOcean, 1e-6);
      const oceanIce = 1 - d.liquidArea / ocean;
      if (d.stratH2O > 3e-3) id = 'moist';
      else if (p.locked && d.nightIce > 0.5 * d.water && d.water > 0) id = 'nightTrap';
      else if (p.locked && d.nightT !== null && d.nightT < 255 && oceanIce > 0.35) id = 'eyeball';
      else if (!p.locked && d.iceLine !== null && d.iceLine < 25) id = 'waterbelt';
      else if (!p.locked && d.iceLine !== null && d.iceLine < 47) id = 'glacial';
      else if (p.gas.H2 > 0.3) id = 'h2World';
      else if (d.rotBoost > 0.5 && d.fluxRel > 1.1) id = 'cloudShield';
      else if (d.hpIce) id = 'deepOcean';
      else if (d.fLand < 0.01) id = 'ocean';
      else if (d.fLand > 0.85) id = 'desert';
      else if (d.Tmean > 303 && d.iceArea < 0.01) id = 'hothouse';
      else id = 'temperate';
    } else {
      const co2Atm = p.gas.CO2;
      if (d.co2Ice > 1e-3 && d.co2Ice > 0.5 * co2Atm && model.co2Trend < 0) id = 'collapse';
      else if (p.locked && d.nightIce > 0.5 * d.water && d.water > 1e-4) id = 'nightTrap';
      else if (d.Tmean < 150 && p.gas.CH4 > 1e-3 && d.Ptot > 0.3) id = 'titan';
      else if (d.condensedOceans > 0.01 && d.fOcean > 0.05 && d.iceArea > 0.9) id = 'snowball';
      else if (d.Ptot < 0.1) id = 'coldDesert';
      else id = 'frozen';
    }

    // secondary tags
    if (p.locked) tags.push('Tidally locked');
    else if (p.rotationHours > 24 * 20) tags.push('Slow rotator');
    if (d.haze > 0.3) tags.push('Organic haze');
    if (d.abioticO2 > 0.02) tags.push('Abiotic O₂ build-up');
    if (d.rates && d.rates.waterLoss > 0.05) tags.push('Losing water to space');
    if (d.Tmean > 647 && d.water > 0.01) tags.push('Supercritical water');
    if (d.hpIce && id !== 'deepOcean') tags.push('High-pressure seafloor ice');
    if (d.co2Ice > 1e-4) tags.push('CO₂ ice caps');
    if (d.nightIce > 0.05 * Math.max(d.water, 1e-9) && id !== 'nightTrap') tags.push('Water cold-trapped on nightside');
    if (d.stratH2O > 3e-3 && id !== 'moist') tags.push('Wet stratosphere');
    if (p.gas.SO2 > 1e-4 && d.Tmean > 400) tags.push('Sulphuric clouds');
    if (d.water === 0 || d.water < 1e-6) tags.push('Waterless');
    return { id, state: STATES[id], tags };
  }

  // ----------------------------------------------------------------- presets
  const base = () => root.Climate.defaultParams();
  function preset(over, gas) {
    const p = base();
    Object.assign(p, over);
    p.gas = Object.assign({ N2: 0, O2: 0, CO2: 0, CH4: 0, H2: 0, SO2: 0 }, gas || p.gas);
    return p;
  }

  const PRESETS = [
    { id: 'earth', name: 'Modern Earth', note: 'Present-day Earth: 1 S⊕, 1 bar, 400 ppm CO₂.', T0: 288, rate: 2,
      params: () => base() },
    { id: 'futureEarth', name: 'Future Earth (brightening Sun)', note: 'Stellar evolution on: the Sun brightens ~9% per Gyr. Watch the thermostat draw CO₂ down, then fail.', T0: 288, rate: 7.3,
      params: () => preset({ stellarEvolution: true }) },
    { id: 'snowballEarth', name: 'Neoproterozoic snowball', note: '~700 Ma: Sun 6% fainter, Earth frozen. Volcanic CO₂ slowly builds up.', T0: 225, rate: 6,
      params: () => preset({ flux: 0.94, rotationHours: 22 }, { N2: 0.78, O2: 0.05, CO2: 2e-4, CH4: 1e-6 }) },
    { id: 'archean', name: 'Archean Earth (hazy)', note: '~3 Ga: Sun 20% fainter, no oxygen, CH₄-rich with an organic haze.', T0: 285, rate: 3,
      params: () => preset({ flux: 0.8, rotationHours: 15, water: 1.1, volcanism: 2.5 }, { N2: 0.9, CO2: 0.05, CH4: 0.005, H2: 0.001 }) },
    { id: 'hadean', name: 'Hadean steam atmosphere', note: 'A young Earth right after a giant impact: all water in a hot steam atmosphere. Does it condense into oceans?', T0: 2200, rate: 3.5,
      params: () => preset({ flux: 0.75, water: 1.2, carbonate: 0, rotationHours: 6, escape: true, xuv: 30 }, { N2: 1.0, CO2: 30 }) },
    { id: 'venus', name: 'Venus today', note: '92 bar CO₂, H₂SO₄ clouds, almost no water, rotation 243 days (retrograde).', T0: 735, rate: 5,
      params: () => preset({ flux: 1.91, mass: 0.815, rotationHours: 5832, obliquity: 177, water: 2e-5, carbonate: 0, volcanism: 0.2 }, { N2: 3.2, CO2: 89, SO2: 0.014 }) },
    { id: 'earlyVenus', name: 'Early Venus (wet, slow)', note: '~3 Ga: Venus with an Earth-like ocean and slow rotation. Can its cloud shield hold?', T0: 300, rate: 4,
      params: () => preset({ flux: 1.91 * 0.8, mass: 0.815, rotationHours: 5832, obliquity: 3, water: 0.6 }, { N2: 1.0, CO2: 4e-4, CH4: 0 }) },
    { id: 'mars', name: 'Mars today', note: '6 mbar CO₂, water locked in ice.', T0: 205, rate: 3,
      params: () => preset({ flux: 0.431, mass: 0.107, rotationHours: 24.6, obliquity: 25.2, water: 2.3e-3, volcanism: 0.003 }, { N2: 1.6e-4, CO2: 0.0058 }) },
    { id: 'earlyMars', name: 'Early Mars (3.8 Ga)', note: 'Faint Sun, 1.5 bar CO₂, a few hundred metres of water. Cold and icy — unless something else helps.', T0: 230, rate: 3,
      params: () => preset({ flux: 0.431 * 0.75, mass: 0.107, rotationHours: 24.6, obliquity: 25, water: 0.02, volcanism: 0.1 }, { N2: 0.05, CO2: 1.5 }) },
    { id: 'titan', name: 'Titan', note: '1.5 bar N₂, 5% CH₄, at 9.5 AU.', T0: 94, rate: 3,
      params: () => preset({ flux: 0.011, mass: 0.0225, rotationHours: 383, obliquity: 0.3, water: 0, carbonCycle: false }, { N2: 1.42, CH4: 0.075, H2: 0.001 }) },
    { id: 'proxima', name: 'Proxima b (locked)', note: 'Tidally locked around an M dwarf at 0.65 S⊕.', T0: 250, rate: 3,
      params: () => preset({ flux: 0.65, star: 'M', locked: true, rotationHours: 11.2 * 24, obliquity: 0, mass: 1.17, xuv: 30 }, { N2: 1.0, CO2: 1e-3 }) },
    { id: 'trappist', name: 'TRAPPIST-1e-like', note: 'A locked 0.7 M⊕ world around an ultracool dwarf, 0.66 S⊕.', T0: 250, rate: 3,
      params: () => preset({ flux: 0.66, star: 'M', locked: true, rotationHours: 6.1 * 24, obliquity: 0, mass: 0.69, water: 1.0, xuv: 50 }, { N2: 1.0, CO2: 0.01 }) },
    { id: 'desert', name: 'Desert world', note: 'An Earth-size land planet with 1% of an ocean, at 1.45 S⊕ — beyond the aqua-planet inner edge.', T0: 300, rate: 3,
      params: () => preset({ flux: 1.45, water: 0.01, rotationHours: 22 }, { N2: 0.8, O2: 0.2, CO2: 4e-4 }) },
    { id: 'oceanWorld', name: 'Ocean world', note: 'Five Earth oceans of water: no continents.', T0: 288, rate: 3,
      params: () => preset({ water: 5 }) },
    { id: 'deepWater', name: 'Deep water world', note: '60 Earth oceans: high-pressure ice on the seafloor.', T0: 288, rate: 3,
      params: () => preset({ water: 60, mass: 1.5 }) },
    { id: 'superEarth', name: 'Super-Earth (5 M⊕)', note: '5 M⊕ with a proportionally bigger atmosphere and ocean.', T0: 288, rate: 3,
      params: () => preset({ mass: 5, water: 3 }, { N2: 2.0, O2: 0, CO2: 1e-3 }) },
    { id: 'h2world', name: 'Hydrogen wanderer', note: 'A super-Earth far from its star, wrapped in 30 bar of primordial H₂.', T0: 300, rate: 3,
      params: () => preset({ flux: 0.02, mass: 3, water: 1, carbonCycle: false, escape: false }, { N2: 0.5, H2: 30 }) },
    { id: 'steamworld', name: 'Runaway in progress', note: 'Earth moved to 1.3 S⊕. The oceans are starting to boil away.', T0: 300, rate: 2.5,
      params: () => preset({ flux: 1.3, xuv: 10 }) },
    { id: 'moon', name: 'Moon-mass rock', note: 'A Moon-sized body given a thin atmosphere and an active young star.', T0: 250, rate: 7,
      params: () => preset({ flux: 1.0, mass: 0.0123, rotationHours: 655, water: 1e-4, xuv: 50, volcanism: 0 }, { N2: 0.05, CO2: 0.01 }) }
  ];

  // ---------------------------------------------------------------- missions
  const MISSIONS = [
    { id: 'thaw', name: 'Break the snowball', preset: 'snowballEarth',
      text: 'Earth is frozen solid. Bring back a temperate or hothouse climate and hold it for 1 Myr — without touching the Sun or the planet.',
      locked: ['flux', 'star', 'mass', 'water', 'locked', 'obliquity', 'rotationHours'],
      goal: (s) => s.id === 'temperate' || s.id === 'hothouse' || s.id === 'glacial', hold: 1e6,
      tip: 'The carbonate-silicate cycle is your friend. Or be impatient and add greenhouse gases.' },
    { id: 'earlyMars', name: 'Rivers on early Mars', preset: 'earlyMars',
      text: 'Valley networks show early Mars had flowing water. Find an atmosphere that keeps at least 20% of the surface above freezing with liquid water for 100 kyr.',
      locked: ['flux', 'star', 'mass', 'water', 'locked'],
      goal: (s, m) => m.diag.liquidArea > 0.02 && fractionAbove(m, 273) > 0.2, hold: 1e5,
      tip: 'CO₂ alone cannot do it — it scatters too much light. Try CO₂ with a few % H₂.' },
    { id: 'future', name: 'The long goodbye', preset: 'futureEarth',
      text: 'The Sun is brightening. Keep Earth habitable (liquid water, mean below 320 K) for 2 billion years. You may not dim the star.',
      locked: ['flux', 'star', 'stellarEvolution'],
      goal: (s, m) => m.time >= 2e9 && habitable(s.id), hold: 0, failIf: (s) => !habitable(s.id),
      tip: 'Slow rotators grow a substellar cloud shield. Dry worlds resist the runaway. Both are research results.' },
    { id: 'venus', name: 'Make a Venus', preset: 'earth',
      text: 'Turn Modern Earth into a dry, CO₂-choked Venus analogue.',
      locked: [],
      goal: (s) => s.id === 'venus', hold: 0,
      tip: 'Push past the runaway limit, let the oceans escape (raise XUV to hurry), and let the carbonates cook.' },
    { id: 'eyeball', name: 'Open the eye', preset: 'trappist',
      text: 'Create a stable eyeball world: open ocean under the star, ice on the far side, held for 100 kyr.',
      locked: ['star', 'locked'],
      goal: (s) => s.id === 'eyeball', hold: 1e5,
      tip: 'Adjust the sunlight or the CO₂.' },
    { id: 'witness', name: 'Witness the runaway', preset: 'steamworld',
      text: 'Follow a wet runaway greenhouse until the surface melts. Note how long it took.',
      locked: ['flux', 'water', 'mass'],
      goal: (s) => s.id === 'magma', hold: 0,
      tip: 'Use 10–100 yr/s to see the ocean boil away, then speed up.' },
    { id: 'desert', name: 'Desert refuge', preset: 'earth',
      text: 'Earth has been moved to 1.6 S⊕ and its oceans are starting to boil. Find a world that keeps liquid water somewhere on its surface for 1 Myr at this sunlight.',
      locked: ['flux', 'star'], setup: (p) => { p.flux = 1.6; },
      goal: (s, m) => m.diag.liquidArea > 0.001 && !['wetRunaway', 'steam', 'magma', 'dryRunaway', 'venus', 'moist'].includes(s.id), hold: 1e6,
      tip: 'Abe et al. (2011): dry land planets radiate more. Slow rotation helps too.' },
    { id: 'titanize', name: 'Make a Titan', preset: 'mars',
      text: 'Turn Mars into a hazy, methane-rich cryogenic world.',
      locked: ['mass'],
      goal: (s) => s.id === 'titan', hold: 0,
      tip: 'Move it far out, give it a thick N₂ atmosphere and a few % methane.' }
  ];

  function habitable(id) {
    return ['temperate', 'hothouse', 'glacial', 'waterbelt', 'desert', 'ocean', 'deepOcean', 'eyeball', 'cloudShield', 'h2World'].includes(id);
  }

  function fractionAbove(m, T) {
    let f = 0;
    for (let i = 0; i < root.Climate.N; i++) if (m.T[i] > T) f += root.Climate.W[i] / 2;
    return f;
  }

  root.ClimateStates = { STATES, ORDER, classify, PRESETS, MISSIONS, habitable };
})(typeof window !== 'undefined' ? window : globalThis);

# Worldsmith — planetary climate sandbox

A browser game for shaping the climate of a rocky planet. Change the starlight,
star type, planet mass, day length, tilt, water inventory and six atmospheric
gases, then run time anywhere from a tenth of a year to a billion years per
second and watch the planet find (or lose) its way to one of 23 climate states.

Open `index.html` in a browser. There is no build step and nothing to install;
it also works from `file://`. Any static host (GitHub Pages included) can serve
the folder as-is.

## What you can do

- **Controls:** starlight (0.005–5 S⊕), F/G/K/M star, XUV activity, stellar
  brightening, mass (0.01–10 M⊕), day length (2 h – 500 days), tidal locking,
  obliquity, water (0 – 100 Earth oceans), N₂, O₂, CO₂, CH₄, H₂, SO₂, the
  carbonate–silicate cycle, volcanism and escape to space.
- **Time:** an adaptive implicit solver means each frame advances
  `real elapsed time × speed` of simulated time. Results do not depend on the
  screen's refresh rate, and a hidden tab does not cause a jump.
- **Atlas:** every state you reach is recorded (saved in your browser).
- **Missions:** eight challenges with locked controls, such as thawing the
  Neoproterozoic snowball, warming early Mars, keeping Earth habitable for
  2 Gyr under a brightening Sun, or making a Venus.
- **Charts:** temperature history with a state ribbon, volatile inventories,
  the temperature profile across the planet, and a live runaway diagram (OLR
  and absorbed sunlight against surface temperature).
- Drag the planet to rotate, scroll to zoom, <kbd>Space</kbd> to pause,
  <kbd>[</kbd>/<kbd>]</kbd> for speed.

## Climate states

| Habitable | Cold | Hot |
|---|---|---|
| Temperate | Glacial (ice age) | Moist greenhouse |
| Hothouse (ice-free) | Waterbelt / Jormungand | Wet runaway (in progress) |
| Habitable desert (land planet) | Snowball | Steam atmosphere (post-runaway) |
| Ocean world | Nightside glacier world | Magma-ocean surface |
| Deep water world (high-pressure ice) | Cold desert (Mars-like) | Dry runaway |
| Eyeball world | Atmospheric collapse | Venus-like CO₂ hothouse |
| Cloud-shielded slow rotator | Titan-like methane world | |
| Hydrogen-greenhouse world | Frozen world, airless rock | |

## The model

`js/physics.js` is a 36-band annual-mean energy-balance model. On a tidally
locked planet the bands become rings around the substellar point. It includes:

- grey greenhouse optical depths for CO₂ (with pressure broadening), H₂O,
  CH₄, collision-induced H₂–N₂/H₂–CO₂ and N₂–N₂ absorption, and SO₂, plus
  anti-greenhouse organic haze when CH₄/CO₂ ≳ 0.1 in anoxic air;
- the moist-atmosphere radiation limit (~282 W/m², rising weakly with gravity
  and strongly for unsaturated, dry planets);
- albedo from ocean, land, snow, sea ice (darker bare ice in the dry
  subtropics), CO₂ frost, clouds, a substellar cloud deck on slow rotators,
  Rayleigh scattering, haze and sulphur aerosols, adjusted for the star's
  spectrum;
- a single water inventory shared by ocean, ice, vapour and nightside
  glaciers, with the latent heat of evaporation in each band's heat capacity;
- the carbonate–silicate cycle, carbonate breakdown on hot surfaces, CO₂
  condensation, diffusion- or energy-limited hydrogen escape (with abiotic O₂
  left behind), bulk escape from small planets, and stellar brightening.

It is calibrated to reproduce Earth (~287 K), Venus (~735 K), Mars (~205 K),
Titan (~90 K), snowball hysteresis, and a runaway threshold near 1.1 S⊕. It is
a teaching model, not a GCM.

## How long does a runaway take?

There is no equilibrium with a liquid ocean once absorbed sunlight exceeds the
radiation limit, but the planet still has to pay for the transition. Evaporating
an Earth ocean (1.4×10²¹ kg) and heating it takes about 10¹³ J per m² of
surface. A surplus of 10–100 W/m² supplies that in roughly 10³–10⁵ years: slow
near the threshold, fast at Venus-like sunlight. The model handles this directly,
because evaporated water carries its latent heat. Once the ocean is vapour, the
surface heats to ~1500–2000 K within thousands of years. Hydrogen escape then
dries the planet over 10⁷–10⁹ years, depending on stellar activity.

| Process | Timescale in the model |
|---|---|
| Surface temperature adjusts | years – decades |
| Wet runaway: ocean evaporates | ~10³–10⁵ yr |
| Steam atmosphere condenses (type I planet) | ~10³–10⁶ yr |
| Moist greenhouse removes an ocean | ~10⁸–10⁹ yr |
| Post-runaway water loss, active star | ~10⁷–10⁸ yr |
| Carbonate–silicate thermostat | ~10⁵–10⁶ yr |
| Snowball escape via volcanic CO₂ | ~10⁷ yr |
| Sun brightens enough to trigger a runaway on Earth | ~1.3 Gyr |

## Main sources

- Goldblatt & Watson (2012), *The runaway greenhouse* — arXiv:1201.1593
- Goldblatt et al. (2013), *Low simulated radiation limit for runaway greenhouse climates*, Nature Geoscience
- Leconte et al. (2013), *Increased insolation threshold for runaway greenhouse processes on Earth-like planets* — arXiv:1312.3337
- Chaverot, Bolmont & Turbet (2023), *First exploration of the runaway greenhouse transition with a GCM* — arXiv:2309.05449
- Boukrouche, Lichtenberg & Pierrehumbert (2021), *Beyond runaway* — arXiv:2107.14150
- Kasting (1988), *Runaway and moist greenhouse atmospheres and the evolution of Earth and Venus*, Icarus
- Hamano, Abe & Genda (2013), *Emergence of two types of terrestrial planet on solidification of magma ocean*, Nature
- Abe et al. (2011), *Habitable zone limits for dry planets*, Astrobiology
- Kopparapu et al. (2014), *Habitable zones around main-sequence stars: dependence on planetary mass* — arXiv:1404.5292
- Yang, Cowan & Abbot (2013), *Stabilizing cloud feedback dramatically expands the habitable zone of tidally locked planets* — arXiv:1307.0515
- Yang et al. (2014), *Strong dependence of the inner edge of the habitable zone on planetary rotation rate*, ApJL
- Abbot, Voigt & Koll (2011), *The Jormungand global climate state*, JGR
- Abbot, Cowan & Ciesla (2012), *Insensitivity of planetary weathering to land fraction* — arXiv:1208.1760
- Turbet et al. (2021), *Day–night cloud asymmetry prevents early oceans on Venus but not on Earth*, Nature
- Forget et al. (2013), *3D modelling of the early martian climate under a denser CO₂ atmosphere*, Icarus
- Wordsworth et al. (2017), *Transient reducing greenhouse warming on early Mars*, GRL
- Pierrehumbert & Gaidos (2011), *Hydrogen greenhouse planets beyond the habitable zone*, ApJL
- Hoffman & Schrag (2002), *The snowball Earth hypothesis*, Terra Nova

## Files

```
index.html        page layout
css/style.css     styles
js/physics.js     climate model (also runs under Node: require('./js/physics.js'))
js/states.js      state classifier, atlas text, presets, missions
js/renderer.js    WebGL planet shader
js/charts.js      canvas charts
js/science.js     in-game science & help text
js/main.js        UI and game loop
```

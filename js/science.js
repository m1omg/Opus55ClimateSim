/* Static "Science & help" content. */
(function (root) {
  'use strict';
  root.SCIENCE_HTML = `
<div class="science">
<h2>How to play</h2>
<ul>
  <li>Pick a <b>world</b> at the top, or start from Modern Earth and change anything on the left: sunlight, star type, mass, day length, water and each gas.</li>
  <li>The <b>speed</b> slider runs from a tenth of a year to a billion years per second. Climate settles in decades; oceans boil away over millennia; planets dry out over hundreds of millions of years.</li>
  <li>Drag the planet to turn it, scroll to zoom. <kbd>Space</kbd> pauses, <kbd>[</kbd> and <kbd>]</kbd> change the speed.</li>
  <li>Values in orange on the left are being changed by the simulation itself (CO₂ by volcanoes and weathering, water by escape to space, and so on).</li>
  <li>Every climate state you reach is added to the <b>Atlas</b>. <b>Missions</b> set specific goals from specific starting worlds.</li>
</ul>

<h2>What the model is</h2>
<p>An annual-mean energy-balance model with 36 bands from pole to pole, or rings around the substellar point on a tidally locked planet. Each band balances absorbed starlight against outgoing infrared and exchanges heat with its neighbours. Heat transport grows with atmospheric mass and slower rotation.</p>
<ul>
  <li><b>Greenhouse:</b> grey optical depths for CO₂ (with pressure broadening), H₂O, CH₄, collision-induced H₂ and N₂ absorption, and SO₂. Organic haze forms when CH₄/CO₂ exceeds ~0.1 in O₂-free air and acts as an anti-greenhouse.</li>
  <li><b>Radiation limit:</b> a moist atmosphere cannot emit more than ~282 W/m² (Simpson–Nakajima limit). The limit rises slightly with gravity and a lot when the air is unsaturated (dry land planets).</li>
  <li><b>Albedo:</b> ocean, land, snow, sea ice (darker bare ice in the dry subtropics), CO₂ frost, water clouds, a substellar cloud deck on slow rotators, Rayleigh scattering, haze and sulphur aerosols. Red stars give darker ice and weaker scattering.</li>
  <li><b>Water:</b> one inventory shared between ocean, ice, vapour and nightside glaciers. Ocean area follows from the water depth relative to topography, which scales with 1/gravity. Evaporating water takes its latent heat into account, so a runaway greenhouse has to pay for every kilogram it boils.</li>
  <li><b>Slow processes:</b> the carbonate–silicate cycle (volcanic outgassing vs. temperature-dependent weathering, buffered by the ocean), carbonate breakdown on very hot surfaces, CO₂ condensation and sublimation, diffusion- or energy-limited hydrogen escape (leaving abiotic O₂ behind), bulk escape from small planets, nightside water trapping and stellar brightening.</li>
</ul>
<p>Temperatures are advanced with an implicit solver and an adaptive step, so the same model runs stably at one month or ten million years per step. Results do not depend on your screen’s refresh rate: each frame advances simulated time by real elapsed time × speed.</p>
<p>It is a teaching model calibrated to reproduce Earth (~287 K), Venus (~735 K), Mars (~205 K), Titan (~90 K), snowball hysteresis and a runaway threshold near 1.1 S⊕. It is not a GCM: treat numbers as order-of-magnitude.</p>

<h2>How long things take</h2>
<table>
  <tr><th>Process</th><th>Timescale</th><th>Why</th></tr>
  <tr><td>Surface temperature adjusts</td><td>years–decades</td><td>Heat capacity of the ocean mixed layer</td></tr>
  <tr><td>Ice-albedo collapse into a snowball</td><td>decades–centuries</td><td>Fast positive feedback once ice passes ~30°</td></tr>
  <tr><td><b>Wet runaway: oceans evaporate</b></td><td><b>~10³–10⁵ yr</b></td><td>~10¹³ J/m² of latent and sensible heat paid from a surplus of 10–100 W/m² above the radiation limit</td></tr>
  <tr><td>Post-runaway heating to ~1500–2000 K</td><td>~10³–10⁴ yr</td><td>Heating hundreds of bar of steam</td></tr>
  <tr><td>Steam atmosphere condenses into oceans (type I planet)</td><td>~10³–10⁶ yr</td><td>Radiating away the stored heat at the radiation limit</td></tr>
  <tr><td>Moist greenhouse removes an Earth ocean</td><td>~10⁸–10⁹ yr</td><td>Diffusion-limited hydrogen escape</td></tr>
  <tr><td>Post-runaway water loss (active young star)</td><td>~10⁷–10⁸ yr</td><td>Energy-limited (XUV-driven) escape</td></tr>
  <tr><td>Carbonate–silicate thermostat</td><td>~10⁵–10⁶ yr</td><td>Weathering vs. a large ocean carbon reservoir</td></tr>
  <tr><td>Snowball escape</td><td>~10⁶–10⁷ yr</td><td>Waiting for volcanoes to supply ~0.1 bar CO₂</td></tr>
  <tr><td>Nightside water trapping</td><td>~10⁴–10⁵ yr</td><td>Ice-sheet build-up on the cold side</td></tr>
  <tr><td>Sun brightening to the runaway threshold</td><td>~1–1.5 Gyr from now</td><td>~9% more light per Gyr</td></tr>
</table>
<p class="note">The runaway is not a switch: once absorbed sunlight exceeds the limit, the surplus can only go into heating and evaporating the ocean, so the transition takes as long as the energy budget demands. Near the threshold the surplus is small and the transition is slow; at Venus-like sunlight it is fast.</p>

<h2>The climate states</h2>
<p>Habitable: temperate, hothouse, glacial, waterbelt, land/desert, ocean, deep-water, eyeball, cloud-shielded slow rotator and hydrogen-greenhouse worlds. Cold: snowball, nightside glacier, Mars-like cold desert, atmospheric collapse, Titan-like methane world, frozen and airless worlds. Hot: moist greenhouse, wet runaway, steam atmosphere, magma ocean, dry runaway and Venus-like. Each has its own entry in the Atlas once you find it.</p>

<h2>Selected references</h2>
<ul class="refs">
  <li>Abbot, Voigt &amp; Koll (2011) The Jormungand global climate state. <i>JGR</i>.</li>
  <li>Abbot, Cowan &amp; Ciesla (2012) Indication of insensitivity of planetary weathering behavior and habitable zone to surface land fraction. <a href="https://arxiv.org/abs/1208.1760" target="_blank" rel="noopener">arXiv:1208.1760</a></li>
  <li>Abe, Abe-Ouchi, Sleep &amp; Zahnle (2011) Habitable zone limits for dry planets. <i>Astrobiology</i> 11, 443. <a href="https://vpl.uw.edu/publication/habitable-zone-limits-for-dry-planets-astrobiology-2011" target="_blank" rel="noopener">link</a></li>
  <li>Boukrouche, Lichtenberg &amp; Pierrehumbert (2021) Beyond runaway: initiation of the post-runaway greenhouse state on rocky exoplanets. <a href="https://arxiv.org/abs/2107.14150" target="_blank" rel="noopener">arXiv:2107.14150</a></li>
  <li>Chaverot, Bolmont &amp; Turbet (2023) First exploration of the runaway greenhouse transition with a GCM. <a href="https://arxiv.org/abs/2309.05449" target="_blank" rel="noopener">arXiv:2309.05449</a></li>
  <li>Forget et al. (2013) 3D modelling of the early martian climate under a denser CO₂ atmosphere. <i>Icarus</i>.</li>
  <li>Goldblatt &amp; Watson (2012) The runaway greenhouse: implications for future climate change, geoengineering and planetary atmospheres. <a href="https://arxiv.org/abs/1201.1593" target="_blank" rel="noopener">arXiv:1201.1593</a></li>
  <li>Goldblatt, Robinson, Zahnle &amp; Crisp (2013) Low simulated radiation limit for runaway greenhouse climates. <i>Nature Geoscience</i>.</li>
  <li>Hamano, Abe &amp; Genda (2013) Emergence of two types of terrestrial planet on solidification of magma ocean. <i>Nature</i>.</li>
  <li>Hoffman &amp; Schrag (2002) The snowball Earth hypothesis. <i>Terra Nova</i>. <a href="https://snowballearth.org/end.html" target="_blank" rel="noopener">snowballearth.org</a></li>
  <li>Kasting (1988) Runaway and moist greenhouse atmospheres and the evolution of Earth and Venus. <i>Icarus</i>.</li>
  <li>Kopparapu et al. (2014) Habitable zones around main-sequence stars: dependence on planetary mass. <a href="https://arxiv.org/abs/1404.5292" target="_blank" rel="noopener">arXiv:1404.5292</a></li>
  <li>Leconte, Forget, Charnay, Wordsworth &amp; Pottier (2013) Increased insolation threshold for runaway greenhouse processes on Earth-like planets. <a href="https://arxiv.org/abs/1312.3337" target="_blank" rel="noopener">arXiv:1312.3337</a></li>
  <li>Pierrehumbert &amp; Gaidos (2011) Hydrogen greenhouse planets beyond the habitable zone. <i>ApJL</i>.</li>
  <li>Turbet et al. (2021) Day–night cloud asymmetry prevents early oceans on Venus but not on Earth. <i>Nature</i> 598, 276.</li>
  <li>Walker, Hays &amp; Kasting (1981) A negative feedback mechanism for the long-term stabilization of Earth’s surface temperature. <i>JGR</i>.</li>
  <li>Way et al. (2016) Was Venus the first habitable world of our solar system? <i>GRL</i>.</li>
  <li>Wordsworth et al. (2017) Transient reducing greenhouse warming on early Mars. <i>GRL</i>.</li>
  <li>Yang, Cowan &amp; Abbot (2013) Stabilizing cloud feedback dramatically expands the habitable zone of tidally locked planets. <a href="https://arxiv.org/abs/1307.0515" target="_blank" rel="noopener">arXiv:1307.0515</a></li>
  <li>Yang, Boué, Fabrycky &amp; Abbot (2014) Strong dependence of the inner edge of the habitable zone on planetary rotation rate. <i>ApJL</i>.</li>
</ul>
</div>`;
})(window);

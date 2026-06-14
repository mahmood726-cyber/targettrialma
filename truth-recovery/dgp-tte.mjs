// dgp-tte.mjs — Standalone seeded known-truth DGP for the Target Trial
// Emulation (TTE) confounding scenario.
//
// Truth model: there is one true UNCONFOUNDED log-effect mu_true that every
// honest estimator must recover. Two kinds of studies observe it:
//   - RCT studies: unbiased, yi ~ N(mu_true, se^2) (+ between-study tau).
//   - TTE studies: residually CONFOUNDED, so their expectation is shifted by a
//     known bias delta (immortal-time / unmeasured-confounding signature):
//         yi ~ N(mu_true + delta, se^2) (+ tau).
//
// The engine's only lever against this is ROBINS-I MULTIPLICATIVE down-weighting
// of 1/se^2. Down-weighting changes the WEIGHTS of a biased study; it does not
// subtract delta. So the question this DGP answers is: can multiplicative
// down-weighting of a biased TTE arm recover the true unconfounded mu? (Pure
// inverse-variance theory says: no — it only attenuates, never removes, bias.)
//
// Seeded mulberry32 + Box-Muller, identical generator family to _kit/dgp.mjs,
// so streams are reproducible and independent of call interleaving.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng) {
  let u1 = rng(), u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function drawSe(rng, k, seLo, seHi) {
  const out = new Array(k);
  const lo = Math.log(seLo), hi = Math.log(seHi);
  for (let i = 0; i < k; i++) out[i] = Math.exp(lo + (hi - lo) * rng());
  return out;
}

// Generate one mixed meta-analysis of nRct RCTs + nTte confounded TTEs.
// delta = the known residual-confounding bias added to every TTE expectation.
// Returns studies tagged with design + a robinsI grade for the TTE arm.
export function generateTTE(muTrue, tau2, nRct, nTte, delta, rng,
                            { seLo = 0.10, seHi = 0.40, tteRobins = 'serious' } = {}) {
  const sd = Math.sqrt(tau2);
  const studies = [];

  const seR = drawSe(rng, nRct, seLo, seHi);
  for (let i = 0; i < nRct; i++) {
    const theta = muTrue + sd * randn(rng);
    studies.push({
      design: 'RCT', robinsI: 'low',
      logEffect: theta + seR[i] * randn(rng),
      se: seR[i],
    });
  }

  const seT = drawSe(rng, nTte, seLo, seHi);
  for (let i = 0; i < nTte; i++) {
    const theta = (muTrue + delta) + sd * randn(rng);   // confounded mean
    studies.push({
      design: 'TTE', robinsI: tteRobins,
      logEffect: theta + seT[i] * randn(rng),
      se: seT[i],
    });
  }

  return { studies, muTrue };
}

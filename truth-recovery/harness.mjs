// harness.mjs — Truth-recovery harness for targettrialma.
//
// Wires the repo's OWN metaAnalysisDL (DL tau2 + HKSJ, t_{k-1}) and its
// robinsIMultiplier against known-truth DGPs, and measures coverage of the
// true mu. Two experiments:
//
//   A. Coverage of the true mu: the engine's DL+HKSJ vs a plain DL+Wald
//      contrast (same DL tau2, but z-based CI with no HKSJ scaling). At small
//      k, DL+Wald is expected to UNDER-cover; HKSJ should recover ~95%.
//
//   B. ROBINS-I bias adjustment under known residual confounding: a TTE arm
//      whose mean is shifted by a known delta. Measure whether multiplicative
//      down-weighting recovers the true UNCONFOUNDED mu (point bias + coverage),
//      naive (equal weight) vs ROBINS-I-adjusted.

import { metaAnalysisDL, robinsIMultiplier, tQuantile } from './engine.mjs';
import { makeRng, generate } from './dgp-kit.mjs';
import { generateTTE } from './dgp-tte.mjs';

// ---- Plain DL+Wald contrast: reuse the engine's DL tau2, drop HKSJ ----
// (Re-derives DL tau2 the same way the engine does, then a normal-theory CI
//  with seRE = sqrt(1/sumWre) and z=1.96 — i.e. classic DerSimonian-Laird.)
function poolDLWald(studies) {
  const k = studies.length;
  const eff = studies.map(s => s.logEffect);
  const w = studies.map(s => s.weight);
  const sumW = w.reduce((a, b) => a + b, 0);
  const thetaFE = w.reduce((s, wi, i) => s + wi * eff[i], 0) / sumW;
  const Q = w.reduce((s, wi, i) => s + wi * (eff[i] - thetaFE) ** 2, 0);
  const df = k - 1;
  const C = sumW - w.reduce((s, wi) => s + wi * wi, 0) / sumW;
  const tau2 = Math.max(0, (Q - df) / C);
  const reW = studies.map(s => 1 / (1 / s.weight + tau2));
  const sumWre = reW.reduce((a, b) => a + b, 0);
  const thetaRE = reW.reduce((s, wi, i) => s + wi * eff[i], 0) / sumWre;
  const seRE = Math.sqrt(1 / sumWre);
  const z = 1.959964;
  return { theta: thetaRE, ci: [thetaRE - z * seRE, thetaRE + z * seRE] };
}

const covered = (ci, truth) => truth >= ci[0] && truth <= ci[1];

// ================= Experiment A =================
export function experimentCoverage({ mu = 0.40, tau2 = 0.05, k = 5,
                                     nSim = 4000, seed0 = 12345 } = {}) {
  let covHKSJ = 0, covWald = 0;
  let widthHKSJ = 0, widthWald = 0;
  for (let s = 0; s < nSim; s++) {
    const rng = makeRng(seed0 + s * 7919);
    const { yi, vi } = generate(mu, tau2, k, 'none', rng);
    const studies = yi.map((y, i) => ({ logEffect: y, se: Math.sqrt(vi[i]),
                                        weight: 1 / vi[i] }));
    const rH = metaAnalysisDL(studies);
    const rW = poolDLWald(studies);
    if (covered(rH.ci, mu)) covHKSJ++;
    if (covered(rW.ci, mu)) covWald++;
    widthHKSJ += rH.ci[1] - rH.ci[0];
    widthWald += rW.ci[1] - rW.ci[0];
  }
  return {
    k, nSim, muTrue: mu, tau2,
    covHKSJ: covHKSJ / nSim, covWald: covWald / nSim,
    meanWidthHKSJ: widthHKSJ / nSim, meanWidthWald: widthWald / nSim,
  };
}

// ================= Experiment B =================
// Mixed RCT+TTE; TTE mean shifted by known delta (residual confounding).
// "naive" = all studies equal inverse-variance weight (ignores ROBINS-I).
// "adjusted" = TTE down-weighted by robinsIMultiplier(grade).
export function experimentRobinsBias({ muTrue = 0.40, tau2 = 0.02,
                                       nRct = 3, nTte = 3, delta = 0.50,
                                       tteRobins = 'serious',
                                       nSim = 4000, seed0 = 24680 } = {}) {
  let biasNaive = 0, biasAdj = 0;
  let covNaive = 0, covAdj = 0;
  for (let s = 0; s < nSim; s++) {
    const rng = makeRng(seed0 + s * 6271);
    const { studies } = generateTTE(muTrue, tau2, nRct, nTte, delta, rng,
                                    { tteRobins });
    const naive = studies.map(st => ({ ...st, weight: 1 / (st.se * st.se) }));
    const adj = studies
      .filter(st => robinsIMultiplier(st.robinsI) > 0)
      .map(st => ({ ...st,
        weight: (1 / (st.se * st.se)) * robinsIMultiplier(st.robinsI) }));
    const rN = metaAnalysisDL(naive);
    const rA = metaAnalysisDL(adj);
    biasNaive += rN.theta - muTrue;
    biasAdj += rA.theta - muTrue;
    if (covered(rN.ci, muTrue)) covNaive++;
    if (covered(rA.ci, muTrue)) covAdj++;
  }
  return {
    muTrue, delta, nRct, nTte, tteRobins, nSim,
    meanBiasNaive: biasNaive / nSim, meanBiasAdj: biasAdj / nSim,
    covNaive: covNaive / nSim, covAdj: covAdj / nSim,
  };
}

// CLI run
if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('harness.mjs')) {
  console.log('=== Exp A: coverage of true mu, DL+HKSJ vs DL+Wald ===');
  for (const k of [3, 5, 8, 15]) {
    const r = experimentCoverage({ k });
    console.log(`k=${String(k).padStart(2)} | HKSJ cov=${r.covHKSJ.toFixed(3)} ` +
      `(w=${r.meanWidthHKSJ.toFixed(3)}) | Wald cov=${r.covWald.toFixed(3)} ` +
      `(w=${r.meanWidthWald.toFixed(3)})`);
  }
  console.log('\n=== Exp B: ROBINS-I down-weighting vs known confounding bias ===');
  for (const delta of [0.0, 0.30, 0.60]) {
    const r = experimentRobinsBias({ delta });
    console.log(`delta=${delta.toFixed(2)} | naive bias=${r.meanBiasNaive.toFixed(3)} ` +
      `cov=${r.covNaive.toFixed(3)} | ROBINS-adj bias=${r.meanBiasAdj.toFixed(3)} ` +
      `cov=${r.covAdj.toFixed(3)}`);
  }
}

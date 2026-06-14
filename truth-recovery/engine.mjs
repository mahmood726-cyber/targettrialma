// engine.mjs — VERBATIM extraction of the pure statistical core of
// targettrialma/index.html (lines ~203-381), additive, no edits to the
// functions themselves. Provides the DL+HKSJ random-effects pool and the
// ROBINS-I quality-weight multiplier used as the bias-adjustment.
//
// Minimal DOM stub so the file loads standalone (the engine functions
// below do NOT touch the DOM; the host page does).
const document = { getElementById: () => ({ value: '0.05' }) };

function gammln(x) {
  const c = [76.18009172947146,-86.50532032941677,24.01409824083091,
    -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function gammaIncomplete(a, x) {
  // Series expansion for lower incomplete gamma / Gamma(a)
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series
    let sum = 1/a, term = 1/a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammln(a));
  } else {
    // Continued fraction (Lentz) for the upper incomplete gamma Q(a,x),
    // following Numerical Recipes `gcf`; lower regularized = 1 - Q.
    const FPMIN = 1e-300;
    let b = x + 1 - a;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-14) break;
    }
    const Q = h * Math.exp(-x + a * Math.log(x) - gammln(a));
    return 1 - Q;
  }
}

function chi2CDF(x, df) {
  if (x <= 0) return 0;
  return gammaIncomplete(df/2, x/2);
}

// t-distribution CDF via regularized incomplete beta
function betaCF(a, b, x) {
  const maxIter = 200;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1/d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1/d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1/d;
    let delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}

function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammln(a+b) - gammln(a) - gammln(b) + a*Math.log(x) + b*Math.log(1-x));
  if (x < (a+1)/(a+b+2)) {
    return bt * betaCF(a, b, x) / a;
  } else {
    return 1 - bt * betaCF(b, a, 1-x) / b;
  }
}

function tCDF(t, df) {
  const x = df / (df + t*t);
  const ib = betaInc(df/2, 0.5, x);
  return t >= 0 ? 1 - 0.5*ib : 0.5*ib;
}

// Inverse t-distribution (bisection)
function tQuantile(p, df) {
  // For p < 0.5, result is negative
  if (p === 0.5) return 0;
  const sign = p < 0.5 ? -1 : 1;
  const target = p < 0.5 ? p : 1 - p;
  let lo = 0, hi = 1000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const cdf = tCDF(-mid, df); // probability in left tail
    if (cdf < target) hi = mid; else lo = mid;
    if (hi - lo < 1e-10) break;
  }
  return sign * (lo + hi) / 2;
}

/* ========== DerSimonian-Laird RE META-ANALYSIS with HKSJ ========== */
function metaAnalysisDL(studies) {
  // studies: [{logEffect, weight}] where weight = 1/se^2 (or adjusted)
  const k = studies.length;
  if (k === 0) return null;

  const effects = studies.map(s => s.logEffect);
  const weights = studies.map(s => s.weight);

  // Fixed-effect estimate
  const sumW = weights.reduce((a,b) => a+b, 0);
  const thetaFE = weights.reduce((s,w,i) => s + w*effects[i], 0) / sumW;

  if (k === 1) {
    const se = Math.sqrt(1/weights[0]);
    // Use t-distribution with df = k-1 = 0... fallback to normal for k=1
    const z = 1.959964;
    return {
      theta: effects[0], se: se,
      ci: [effects[0] - z*se, effects[0] + z*se],
      tau2: 0, I2: 0, Q: 0, df: 0, pQ: 1, k: 1
    };
  }

  // Q statistic
  const Q = weights.reduce((s,w,i) => s + w*(effects[i]-thetaFE)**2, 0);
  const df = k - 1;
  const pQ = 1 - chi2CDF(Q, df);

  // DL tau2
  const C = sumW - weights.reduce((s,w) => s + w*w, 0)/sumW;
  let tau2 = Math.max(0, (Q - df) / C);

  // RE weights
  const reWeights = studies.map(s => 1/(1/s.weight + tau2));
  const sumWre = reWeights.reduce((a,b) => a+b, 0);
  const thetaRE = reWeights.reduce((s,w,i) => s + w*effects[i], 0) / sumWre;

  // I2
  const I2 = Math.max(0, (Q - df) / Q) * 100;

  // HKSJ adjustment
  // Variance: q* = (1/(k-1)) * sum(w_i * (y_i - theta_RE)^2) / sumW_re
  // But use floor: max(1, Q/(k-1)) scaling
  const qStar = reWeights.reduce((s,w,i) => s + w*(effects[i]-thetaRE)**2, 0) / df;
  // HKSJ floor: if Q < k-1, qStar can be < 1/sumWre, narrowing CI below DL
  // Apply floor: max(1, qStar)
  const hksjFactor = Math.max(1, qStar);
  const seRE = Math.sqrt(hksjFactor / sumWre);

  // t-distribution CI (HKSJ uses t_{k-1})
  const tCrit = -tQuantile(0.025, df); // positive critical value
  const ci = [thetaRE - tCrit * seRE, thetaRE + tCrit * seRE];

  return {
    theta: thetaRE, se: seRE, ci: ci,
    tau2: tau2, I2: I2, Q: Q, df: df, pQ: pQ, k: k,
    weights: reWeights
  };
}

/* ========== ROBINS-I WEIGHT MULTIPLIERS ========== */
function robinsIMultiplier(judgment) {
  const j = judgment.trim().toLowerCase();
  if (j === 'low') return 1.0;
  if (j === 'moderate') return 0.75;
  if (j === 'serious') return 0.50;
  if (j === 'critical') return 0.0;
  return 1.0;
}

export { gammln, gammaIncomplete, chi2CDF, betaCF, betaInc, tCDF, tQuantile,
         metaAnalysisDL, robinsIMultiplier };

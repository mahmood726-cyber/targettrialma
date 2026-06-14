// test-truth.mjs — assertions for the targettrialma truth-recovery harness.
// Run: node truth-recovery/test-truth.mjs   (exit 0 = all pass)

import { experimentCoverage, experimentRobinsBias } from './harness.mjs';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}` + (detail ? ` (${detail})` : '')); }
  else { fail++; console.log(`  FAIL ${name}` + (detail ? ` (${detail})` : '')); }
}

// 1. Engine's DL+HKSJ recovers ~nominal coverage of true mu at small k (>=0.93).
const a5 = experimentCoverage({ k: 5 });
check('DL+HKSJ covers true mu at k=5 (>=0.93)', a5.covHKSJ >= 0.93,
      `cov=${a5.covHKSJ.toFixed(3)}`);

// 2. Plain DL+Wald UNDER-covers at small k, and by a clear margin vs HKSJ.
const a3 = experimentCoverage({ k: 3 });
check('DL+Wald under-covers at k=3 (<0.92)', a3.covWald < 0.92,
      `Wald=${a3.covWald.toFixed(3)} vs HKSJ=${a3.covHKSJ.toFixed(3)}`);
check('HKSJ coverage exceeds Wald at k=3 by >=0.05',
      a3.covHKSJ - a3.covWald >= 0.05,
      `gap=${(a3.covHKSJ - a3.covWald).toFixed(3)}`);

// 3. With no confounding, the pooled estimate is unbiased and well-calibrated.
const b0 = experimentRobinsBias({ delta: 0.0 });
check('unbiased when delta=0 (|bias|<0.02)', Math.abs(b0.meanBiasNaive) < 0.02,
      `bias=${b0.meanBiasNaive.toFixed(3)}`);

// 4. KEY FINDING: ROBINS-I down-weighting ATTENUATES but does NOT remove a
//    known confounding bias — adjusted bias is smaller than naive, yet still
//    materially nonzero (cannot recover the true unconfounded mu).
const b6 = experimentRobinsBias({ delta: 0.60 });
check('ROBINS-adj reduces bias vs naive', b6.meanBiasAdj < b6.meanBiasNaive,
      `adj=${b6.meanBiasAdj.toFixed(3)} < naive=${b6.meanBiasNaive.toFixed(3)}`);
check('ROBINS-adj still leaves material residual bias (>0.10)',
      b6.meanBiasAdj > 0.10,
      `adj bias=${b6.meanBiasAdj.toFixed(3)} (delta=0.60)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

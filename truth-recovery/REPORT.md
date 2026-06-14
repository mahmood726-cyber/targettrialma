# Truth-Recovery Validation — targettrialma

**Engine:** index.html (869 lines), browser meta-analysis combining RCTs with
Target Trial Emulations (TTE). Pure statistical core extracted verbatim into
truth-recovery/engine.mjs.

**Verdict: GENUINE METHODS ENGINE — VALIDATED, with one honest limitation finding.**

## What the engine actually does
- Pool: metaAnalysisDL is DerSimonian-Laird random-effects with the HKSJ
  (Hartung-Knapp-Sidik-Jonkman) variance correction: t_{k-1} critical value
  (tQuantile(0.025, k-1)) and the correct HKSJ floor max(1, qStar).
- Bias adjustment for study quality: robinsIMultiplier multiplicatively
  down-weights 1/se^2 by ROBINS-I grade (low 1.0, moderate 0.75, serious 0.50,
  critical 0.0). This is the engine's only lever against confounding /
  immortal-time bias in the TTE arm.

## Method
Injected known (mu, tau2) truth via seeded DGPs and measured coverage of the
true mu. 4000 sims each, mulberry32 + Box-Muller (seeded, reproducible).
Run: node truth-recovery/harness.mjs ; test: node truth-recovery/test-truth.mjs (6/6 pass).

### Experiment A - coverage of true mu: engine DL+HKSJ vs plain DL+Wald
mu=0.40, tau2=0.05. DL+Wald reuses the engine's identical DL tau2 but a z-based
CI (no HKSJ) - the classic estimator HKSJ is meant to fix.

| k  | DL+HKSJ cov (engine) | DL+Wald cov | width HKSJ / Wald |
|----|----------------------|-------------|-------------------|
| 3  | 0.994                | 0.875       | 1.80 / 0.80       |
| 5  | 0.962                | 0.888       | 0.87 / 0.59       |
| 8  | 0.946                | 0.896       | 0.57 / 0.46       |
| 15 | 0.943                | 0.917       | 0.38 / 0.33       |

Finding: plain DL+Wald UNDER-covers the true mu at small k (87.5% at k=3,
88.8% at k=5). The engine's DL+HKSJ RECOVERS truth (>=0.94, conservative at
k=3) - exactly the documented HKSJ behaviour. The engine uses the right method.

### Experiment B - ROBINS-I down-weighting vs known residual confounding
3 unbiased RCTs + 3 TTEs whose mean is shifted by known bias delta (residual
confounding / immortal-time signature), tau2=0.02, ROBINS-I "serious" (x0.50).
naive = equal inverse-variance weight; adjusted = TTE down-weighted by robinsIMultiplier.

| delta | naive bias | naive cov | ROBINS-adj bias | ROBINS-adj cov |
|-------|-----------|-----------|------------------|----------------|
| 0.00  | 0.000     | 0.971     | 0.001            | 0.976          |
| 0.30  | 0.151     | 0.869     | 0.123            | 0.913          |
| 0.60  | 0.301     | 0.809     | 0.262            | 0.861          |

Finding (honest limitation): ROBINS-I multiplicative down-weighting ATTENUATES
but does NOT remove confounding bias. At delta=0.60 it cuts pooled bias only
from 0.301 to 0.262 and lifts coverage from 0.81 to 0.86 - it never recovers
the true unconfounded mu (would need 0.95). Expected from inverse-variance
theory: scaling a biased study's weight shifts the pooled mean toward the
unbiased arm but cannot subtract the bias delta. Users should read ROBINS-I
down-weighting as sensitivity dampening, NOT confounding removal.

## Recommendation
- Ship. The pooling core is correct: DL tau2 + HKSJ (t_{k-1}, floor 1) recovers
  nominal coverage where plain DL+Wald fails at small k.
- Documentation tweak (not a code bug): add a UI caveat that ROBINS-I
  down-weighting attenuates (does not eliminate) residual confounding /
  immortal-time bias from TTE arms. Genuine de-confounding must happen at the
  estimand stage (e.g. negative-control / E-value bias modelling) before pooling.

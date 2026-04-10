# E156-PROTOCOL: Target Trial Emulation Meta-Analysis

## Project
**TargetTrialMA** — Browser-based stratified meta-analysis combining RCTs with target trial emulations

## Dates
- Created: 2026-04-09
- Last updated: 2026-04-09

## E156 Body (CURRENT)
When randomized trial evidence is supplemented by target trial emulations from observational data, systematic reviewers face the question of whether to pool these designs together or separately. We built TargetTrialMA, a browser-based tool implementing stratified DerSimonian-Laird random-effects meta-analysis with Hartung-Knapp-Sidik-Jonkman adjustment, partitioning studies into RCT and TTE subgroups. The tool computes Q-between interaction tests (Q_total minus Q_within_RCT minus Q_within_TTE, df=1) to formally assess design-type heterogeneity. Applied to 10 SGLT2-inhibitor heart failure studies (4 RCTs, 6 TTEs), the combined HR was 0.79 with no significant interaction (p > 0.05), supporting poolability. ROBINS-I quality weighting (Low=1.0, Moderate=0.75, Serious=0.50, Critical=excluded) and an 8-criterion target trial checklist heatmap provide sensitivity analysis. The tool enables transparent integration of RCT and real-world evidence for living systematic reviews where randomized data alone may be insufficient. Design-type heterogeneity and ROBINS-I quality remain the primary limitations — the interaction test has low power with few studies per subgroup.

## Dashboard
- Local: `C:\Models\TargetTrialMA\index.html`
- GitHub Pages: TBD

## Tests
18 Selenium tests — all passing

# Target Trial Emulation Meta-Analysis

Browser-based dashboard for meta-analyzing studies that combine randomized controlled trials (RCTs) with target trial emulations (TTEs) from observational data.

## Features

- **Stratified Random-Effects MA**: Separate pooling of RCT and TTE studies using DerSimonian-Laird with HKSJ adjustment and t-distribution CIs
- **Interaction Test**: Q_between test for heterogeneity between RCT and TTE subgroups
- **ROBINS-I Quality Weighting**: Sensitivity analysis with weight adjustments (Low: 1.0, Moderate: 0.75, Serious: 0.50, Critical: excluded)
- **Target Trial Checklist Heatmap**: 8-criterion checklist (Hernan & Robins framework) visualized as color-coded grid
- **Effect Measures**: Supports HR, OR, and RR (pooled on log scale, displayed on natural scale)
- **Export**: CSV summary and SVG plots

## Usage

Open `index.html` in any modern browser. No server or CDN required.

1. Paste CSV data or click **Demo Data**
2. Select effect measure (HR/OR/RR)
3. Click **Analyze**

### CSV Format

```
Study,Design,LogEffect,SE,ROBINS_I,C1,C2,C3,C4,C5,C6,C7,C8
```

- **Study**: Study identifier
- **Design**: `RCT` or `TTE`
- **LogEffect**: log(HR), log(OR), or log(RR)
- **SE**: Standard error of log effect
- **ROBINS_I**: `Low` | `Moderate` | `Serious` | `Critical` (optional, defaults to Low for RCTs)
- **C1-C8**: Target trial checklist criteria, 0 or 1 (optional)

## Demo Data

10 studies (4 RCTs + 6 TTEs) on SGLT2 inhibitors in heart failure. Includes DAPA-HF, EMPEROR-Reduced, SOLOIST-WHF, DELIVER (RCTs) plus 6 target trial emulations with varying ROBINS-I quality.

## Statistical Methods

- **Pooling**: DerSimonian-Laird random-effects with HKSJ variance correction
- **CI**: t-distribution with k-1 degrees of freedom
- **HKSJ floor**: Applied when Q < k-1 to prevent CI narrowing below DL
- **Interaction**: Q_between = Q_total - Q_within_RCT - Q_within_TTE, df=1, chi-square test
- **Heterogeneity**: I-squared and tau-squared reported for each subgroup

## Testing

```bash
cd C:\Models\TargetTrialMA
python -m pytest test_app.py -v
```

18 Selenium tests covering pooled estimates, interaction test, ROBINS-I weighting, visualizations, edge cases, and export.

## Author

Mahmood Ahmad, Tahir Heart Institute

## License

MIT

# Engine calculation inventory — Phase 1

Baseline: `index.html` on `main`, blob `c2ade50a605a5d7c32df3e679d02e03e763fd4c4`.

This phase does **not** change `index.html`, Google Sheets loading, the live screener, or Cloudflare routing. It creates a GitHub-only parity layer and tests it against the actual function bodies from the baseline HTML at CI runtime.

## Calculation dependency groups found in the baseline

| Area | Current functions in `index.html` | Phase-1 status |
|---|---|---|
| Price/indicator primitives | `ema`, `sma`, `rsi`, `rsiSeries`, `emaSeries`, `pctChange`, `pctChangeHist`, `barChange` | Mirrored and parity-tested |
| Benchmark-relative RS | `benchPctBetween`, `benchLegPct`, `rsPosition`, `rspHistory`, `rankRS` | Foundation mirrored; `rankRS` remains in baseline pending next phase |
| Weekly transformation | `wkMondayKey`, `wkSundayKey`, `weeklyResample` | Baseline only; next extraction |
| Volume/participation | `volAvg20`, `volSpike`, `thrustDay`, `earlyVolumeTransition`, `avgTradedValue` | Baseline only; next extraction |
| Breakout/price structure | `boPriceFlags`, `breakout`, `pivots`, `pivZone`, `pivMatch`, `hi52`, `lo52` | Baseline only; next extraction |
| Setup / quality | `setupBaseAge`, `squeeze`, `darvasSeries`, `darvasState`, `darvasBox`, `isQualitySetup`, `boxSetup`, `emaConverged`, `weeklyEmaConverged1020`, `hasBreakout` | Baseline only; next extraction |
| VCP / IPO / Momentum Base / SMZ | `vcpPivots`, `vcpContractions`, `vcpDetect`, `ipoBase`, `momentumBase`, `smzPivots`, `smzStructure`, `smzClassify`, `smartMoneyZones` | Mirrored in `frontend-pattern-engine.mjs`; direct parity test added |
| Smart Money Zone | `smzPivots`, `smzStructure`, `smzClassify`, `smartMoneyZones` | Baseline only; next extraction |
| Early breakout | `earlyFinite`, `earlyMinTrigger`, `earlyRSPLead`, `earlyCompression`, `earlyVolumeScore`, `earlyTrendScore`, `earlyStructureScore`, `calcEarlyBreakout` | Baseline only; next extraction |
| Stock row assembly | `computeTech`, `rankRS`, `calcMetrics` | Baseline only; highest-risk extraction after foundations |
| Rotation / leader | `rotV4*`, `rotV5*`, `rotStockState`, `rotLeaderScore`, `mf*` | Existing GitHub analytics plus baseline-specific stock layer; next parity phase |

## Safety rule

Nothing in this branch is wired into the production page. A parity failure is allowed to block the branch without affecting the existing working screener.
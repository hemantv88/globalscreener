# Engine calculation inventory — Phase 1

Baseline: `index.html` on `main`, blob `c2ade50a605a5d7c32df3e679d02e03e763fd4c4`.

This phase does **not** change `index.html`, Google Sheets loading, the live screener, or Cloudflare routing. It creates a GitHub-only parity layer and tests it against the actual function bodies from the baseline HTML at CI runtime.

## Calculation dependency groups found in the baseline

| Area | Current functions in `index.html` | Phase-1 status |
|---|---|---|
| Price/indicator primitives | `ema`, `sma`, `rsi`, `rsiSeries`, `emaSeries`, `pctChange`, `pctChangeHist`, `barChange` | Mirrored and parity-tested |
| Benchmark-relative RS | `benchPctBetween`, `benchLegPct`, `rsPosition`, `rspHistory`, `rankRS` | Foundation mirrored; `rankRS` remains in baseline pending next phase |
| Weekly transformation | `wkMondayKey`, `wkSundayKey`, `weeklyResample` | Mirrored in `frontend-market-structure.mjs`; direct parity test passes |
| Volume/participation | `volAvg20`, `volSpike`, `thrustDay`, `earlyVolumeTransition`, `avgTradedValue` | Mirrored in `frontend-market-structure.mjs`; direct parity test passes |
| Breakout/price structure | `boPriceFlags`, `breakout`, `pivots`, `pivZone`, `pivMatch`, `hi52`, `lo52` | Mirrored in `frontend-market-structure.mjs`; direct parity test passes |
| Setup / quality | `setupBaseAge`, `squeeze`, `darvasSeries`, `darvasState`, `darvasBox`, `isQualitySetup`, `boxSetup`, `emaConverged`, `weeklyEmaConverged1020`, `hasBreakout` | Baseline only; next extraction |
| VCP / IPO / Momentum Base / SMZ | `vcpPivots`, `vcpContractions`, `vcpDetect`, `ipoBase`, `momentumBase`, `smzPivots`, `smzStructure`, `smzClassify`, `smartMoneyZones` | Mirrored in `frontend-pattern-engine.mjs`; direct parity test passes |

| Early breakout | `earlyFinite`, `earlyMinTrigger`, `earlyRSPLead`, `earlyCompression`, `earlyVolumeScore`, `earlyTrendScore`, `earlyStructureScore`, `calcEarlyBreakout` | Mirrored in `frontend-early.mjs`; parity test added |
| Stock row assembly | `computeTech`, `rankRS`, `calcMetrics` | Baseline only; highest-risk extraction after foundations |
| Rotation / leader | `rotV4*`, `rotV5*`, `rotStockState`, `rotLeaderScore`, `mf*` | Existing GitHub analytics plus baseline-specific stock layer; next parity phase |

## Current extraction status

Already mirrored and parity-tested on this branch: calculation foundations, market structure/volume, Setup/Stage-2 structure helpers, VCP/IPO/Momentum Base/SMZ, and Early breakout scoring. The remaining high-risk work is the benchmark attachment (`rankRS`), full `computeTech` row assembly, and the rotation/leader stock layer.

The repository already contains the market-structure and pattern-engine parity modules from earlier Phase 2/3 work; new extraction work must extend those modules or create a genuinely separate dependency group rather than duplicating functions.

## Safety rule

Nothing in this branch is wired into the production page. A parity failure is allowed to block the branch without affecting the existing working screener.
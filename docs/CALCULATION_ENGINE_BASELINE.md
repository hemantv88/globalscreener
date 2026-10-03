# GlobalScreener Calculation Engine Baseline

## Purpose

This branch is the GitHub staging/control environment for extracting the browser-side calculation engine from the current working `index.html`.

**Hard rule:** no calculation is moved to Cloudflare/server-side until the GitHub implementation has passed parity checks against the current Google Sheets/browser implementation.

## Baselines

- Repository: `hemantv88/globalscreener`
- Staging branch: `data-pipeline-v2-2`
- Browser baseline: root `index.html`
- Current baseline file is intentionally left untouched by this work.
- Google Sheets/browser output remains the comparison control.

## Current architecture finding

The current `index.html` is a self-contained application. Its configuration starts around line 2122 and includes the three market CSV sources plus market-cap data. The page also contains the complete calculation engine rather than only presentation logic.

The calculation engine is therefore **not** equivalent to the existing `generator/src/core.mjs`. The generator currently contains the data-pipeline/derived snapshot layer; it does not yet reproduce the full browser screener calculation contract.

## Calculation functions identified in the browser baseline

| Area | Browser baseline |
|---|---|
| Main per-stock engine | `computeTech(C,H,L,V,dates,sym,O,feedStart)` |
| Benchmark-relative RS | `rankRS(market)` |
| Smart Money Zones | `smartMoneyZones(C,H,L,cfg)` |
| VCP | `vcpDetect(C,H,L,V,e50,e200)` |
| IPO base | `ipoBase(C,H,L,V,dates,feedStart)` |
| Momentum Base | `momentumBase(C,H,L,V,dates,ema20Series,cfg)` |
| Lifecycle classification | `lifecycleStage(d)` |
| Table/filter projection | `getRows(market,exclCol)` |
| Early breakout research engine | `calcEarlyBreakout(d,market)` and supporting `early*` functions |
| Stage 2 | existing Stage-2 calculation inside the browser engine |
| Historical/as-of calculations | existing as-of path feeding truncated series back through the engine |

## Important dependency contracts discovered

1. **RS is benchmark-dependent.** The browser engine intentionally produces null RS when benchmark data is unavailable; it does not fall back to raw-return ranking.
2. **RS ranking is cross-sectional.** `rankRS()` calculates benchmark-relative returns first and percentile-ranks `rs55` across the loaded universe.
3. **Stage 2 has an RS-dependent rule.** The benchmark-dependent Stage 2 rule is patched only after `rankRS()` has populated `rs21`.
4. **Early is additive.** It does not replace Setup, Stage 2, MRS, Fresh, Darvas, VCP or Momentum Base.
5. **SMZ has explicit null/state semantics.** Missing structure, no structure and directional structure are distinct outcomes.
6. **Momentum Base returns an all-null object when its minimum data/shape requirements are not satisfied.**
7. **Lifecycle stages are mutually exclusive.** Emerging is carved out of the forming state rather than overlaid on it.
8. **As-of mode must truncate the source series before calculation.** It must not calculate today's indicators and merely relabel them as historical.
9. **Column/filter logic is downstream of the calculation engine.** It must not duplicate engine thresholds except where the existing browser contract explicitly requires a subset filter.
10. **The existing UI must remain unchanged during extraction.**

## Source locations verified

- Browser configuration: approximately lines 2122+
- VCP detector: approximately line 7603
- IPO base: approximately line 8110
- Smart Money Zones: approximately line 8575
- Main calculation engine: approximately line 8694
- RS engine: approximately line 9503
- Lifecycle stage: approximately line 14122
- Table/filter projection: approximately line 14168

## Existing GitHub tests

The branch already has a Phase 1.1 data-pipeline test suite covering syntax, data transformations, benchmark-relative RS in the generator layer, market snapshots, eligibility/classification/group analytics, and QA-page checks.

Those tests are useful infrastructure, but they **do not yet prove parity with the browser calculation engine**. That parity suite is the next task.

## Extraction rule

The first extracted implementation must be a **mechanical/behavior-preserving port**, not a redesign.

No formula, threshold, field name, null behavior, ranking rule, date-alignment rule, or state vocabulary should be changed during extraction.

Any unavoidable adaptation from browser globals to modules must be documented explicitly and tested.

## Required parity gates

Before Cloudflare work begins:

1. Browser baseline and GitHub engine receive the same historical OHLCV fixture.
2. Same configuration is supplied.
3. Per-stock output is compared field-by-field.
4. Benchmark-relative fields are compared after the benchmark is aligned by date.
5. Cross-sectional ranks are compared using the same universe.
6. Historical/as-of mode is compared at multiple dates.
7. India, US and ETF fixtures are compared.
8. Null/missing-history cases are explicitly compared.
9. Filter membership is compared after calculation parity is established.
10. Only then can the GitHub engine become the candidate implementation for Cloudflare.

## Current status

**Phase: calculation-engine inventory and baseline lock.**

No Cloudflare/server-side migration is authorized by this document.

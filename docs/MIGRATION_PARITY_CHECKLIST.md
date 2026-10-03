# GlobalScreener — GitHub-First Migration & Parity Checklist

## Non-negotiable project rule
- [x] Keep current Google Sheets/browser implementation as the control/baseline.
- [x] Keep root `index.html` read-only until parity is proven.
- [x] Do NOT move calculation logic to Cloudflare/server-side before GitHub parity passes.
- [x] Do NOT replace browser formulas with approximations from the existing data generator.
- [ ] Only advance to Cloudflare after all GitHub parity gates below are green.

## 1. Baseline & architecture — COMPLETED
- [x] GitHub staging branch exists: `data-pipeline-v2-2`.
- [x] Current root `index.html` baseline identified and locked (SHA `c2ade50a605a5d7c32df3e679d02e03e763fd4c4`).
- [x] Existing Phase 1.1 data-pipeline architecture reviewed.
- [x] Confirmed existing `generator/src/core.mjs` is NOT the complete browser screener calculation engine.
- [x] Browser calculation boundaries inventoried.
- [x] Calculation-engine manifest created.
- [x] Baseline documentation created.

## 2. Browser calculation-engine extraction — OUTSTANDING
- [ ] Extract shared technical primitives mechanically.
- [ ] Extract Darvas logic.
- [ ] Extract VCP logic.
- [ ] Extract IPO-base logic.
- [ ] Extract Smart Money Zone logic.
- [ ] Extract Momentum Base logic.
- [ ] Extract Stage 2 logic.
- [ ] Extract Early Breakout logic and dependencies.
- [ ] Extract benchmark-relative RS logic.
- [ ] Extract lifecycle logic.
- [ ] Extract `computeTech` orchestration.
- [ ] Keep `getRows`/presentation filtering separate from the calculation engine.
- [ ] Document every browser-global/module adaptation.
- [ ] Preserve formulas, thresholds, field names, null semantics, date alignment and state vocabulary exactly.

## 3. GitHub calculation-engine tests — OUTSTANDING
- [ ] Unit tests for shared primitives.
- [ ] Unit tests for each extracted module.
- [ ] Single-stock deterministic fixture tests.
- [ ] Insufficient-history/null-case tests.
- [ ] Boundary/threshold tests.
- [ ] Regression tests for known signal/state combinations.
- [ ] Existing Phase 1.1 generator test suite remains green.

## 4. Browser-vs-GitHub parity harness — OUTSTANDING
- [ ] Establish identical OHLCV fixture input for browser and GitHub engine.
- [ ] Establish identical configuration/input values.
- [ ] Compare per-stock output field-by-field.
- [ ] Compare benchmark alignment by date.
- [ ] Compare benchmark-relative fields.
- [ ] Compare cross-sectional RS ranks using identical universe.
- [ ] Compare Stage 2 after the post-RS patch.
- [ ] Compare SMZ state, levels and BOS age.
- [ ] Compare VCP state and levels.
- [ ] Compare IPO-base state and levels.
- [ ] Compare Momentum Base state/measurements.
- [ ] Compare Early score/state/components.
- [ ] Compare lifecycle-stage exclusivity.
- [ ] Compare null/missing-history behavior.
- [ ] Compare historical/as-of calculations at multiple dates.
- [ ] Compare India fixtures.
- [ ] Compare US fixtures.
- [ ] Compare ETF fixtures.
- [ ] Compare final filter membership after calculation parity.

## 5. GitHub-hosted staging / browser QA — OUTSTANDING
- [ ] Run the extracted engine through a GitHub-hosted/testable browser path without changing production.
- [ ] Verify current UI remains intact.
- [ ] Verify India/US/ETF tabs.
- [ ] Verify filters and sorting.
- [ ] Verify labels/columns and null display.
- [ ] Verify no calculation regressions in the staging UI.
- [ ] Verify mobile/laptop behavior relevant to the calculation integration.
- [ ] Record defects and fix them on the staging branch only.

## 6. Data-pipeline integration — PARTIALLY COMPLETED
- [x] Phase 1.1 India data pipeline exists.
- [x] NSE primary/fallback acquisition architecture exists.
- [x] Corporate-action/symbol-continuity/indices infrastructure exists.
- [x] Existing generator validation/test infrastructure exists.
- [ ] Prove the extracted browser engine consumes the pipeline data without changing browser semantics.
- [ ] Prove 300-session/required-history assumptions against the real staging dataset.
- [ ] Prove adjusted/raw price handling matches the browser contract wherever relevant.
- [ ] Complete end-to-end India dataset → engine → screener parity.

## 7. Release gates before Cloudflare — OUTSTANDING
- [ ] All existing tests green.
- [ ] All new engine tests green.
- [ ] All parity tests green.
- [ ] No unresolved critical/high calculation defects.
- [ ] India/US/ETF parity signed off.
- [ ] As-of parity signed off.
- [ ] Null/insufficient-history parity signed off.
- [ ] Filter-membership parity signed off.
- [ ] Production `index.html` still unchanged.
- [ ] Baseline SHA and rollback point recorded.
- [ ] Only after these pass: prepare Cloudflare/server-side migration.

## 8. Cloudflare migration — NOT STARTED / BLOCKED BY DESIGN
- [ ] Move the already-tested GitHub engine to Cloudflare.
- [ ] Re-run the same parity suite against GitHub vs Cloudflare.
- [ ] Validate response/schema/cache/error behavior.
- [ ] Validate performance and batch limits.
- [ ] Validate security/proprietary-logic exposure.
- [ ] Validate rollback to GitHub/browser baseline.
- [ ] Only then consider production cutover.

## Current phase
**Phase: GitHub calculation-engine extraction and parity preparation.**

### Current completed checkpoint
- Baseline locked.
- Architecture/inventory documented.
- Manifest committed.
- Existing data pipeline retained.
- Production/browser baseline untouched.

### Immediate next task
**Begin mechanical extraction of the browser calculation engine into isolated GitHub modules, starting with shared technical primitives and their dependencies, then build deterministic tests before moving to the higher-level modules.**

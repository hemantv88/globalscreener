# GlobalScreener — Project Skill / Working Memory

> This file is the durable project playbook for future GlobalScreener work. Treat it as the project source of truth before changing architecture, data, UI, or screening logic.

## 1. Product goal

Build GlobalScreener into a production-grade India + US + ETF market intelligence/screener application while preserving the existing screener UI and proven stock-selection logic.

The long-term architecture is:

Provider acquisition -> persistent historical state -> server-side calculations -> compact validated snapshots -> Cloudflare server layer -> browser UI.

The browser should receive only the data/features required for the requested views. Proprietary calculation logic, provider credentials, raw acquisition state, and internal data-engineering details must stay server-side.

## 2. Current development state (2026-10-02)

- Repository: hemantv88/globalscreener
- Development branch: data-pipeline-v2-2
- Stable rollback checkpoint: phase1-stable-2026-10-02
- Stable checkpoint must NOT be merged/rebased away casually.
- Phase 1 stable PR #1 remains a draft/reference point.
- Existing main index.html is the proven screener UI and has intentionally not been rewritten as part of the Phase 1 data-pipeline work.

Pre-skill checkpoint commit: ee9a968f345f06f937c5594d75c401c5d0333c4c.
Skill/playbook commits: 6e0838e32597f4194f9e487910a270b10a607ffc and c48b6e93a04468439f843e9d94380b7c15a1c8ee.
Latest completed CI before the skill commits: run #77 succeeded with the full Node/Python syntax + fixture suite. CI for the current skill update is tracked separately.

## 3. Existing screener contract — do not regress

Preserve these independent concepts and do not let one overwrite another:

- Setup
- Early / Early Breakout / Prime
- Stage 2
- MRS / relative-strength signals
- Smart Money Zone
- Momentum Base
- VCP / Darvas / IPO base
- Watchlist / review / notes / export
- Sector / Industry / Macro rotation
- Stock leader-hunting views

Context/rotation scoring is display and ranking context only. It must never silently change Setup, Early, Stage2, MRS, or the underlying signal definitions.

## 4. Rotation model

Use a hierarchical model:

Macro -> Sector -> Industry -> Stock.

At group levels use peer-relative context, not absolute RS alone.

Current concepts:
- RS level
- RS momentum direction
- RS acceleration
- percentile rank within comparable peers
- leadership breadth
- flow score
- Powering Up / Turning Up / Cooling / Falling Back
- persistence/event markers

Money-flow vocabulary maps to rotation state:
- Leading <-> Powering Up
- Improving <-> Turning Up
- Weakening <-> Cooling
- Lagging <-> Falling Back

For stocks, keep peer-relative strength/momentum/acceleration separate from absolute RS.

Leader Score is a prioritization/display score only. It must not become a substitute for actual signal logic.

## 5. Relative strength rule

The canonical GlobalScreener RS formula is benchmark-relative percentage change:

RS(N) = stock percentage change over N - benchmark percentage change over N.

Benchmark comparison is mandatory. Do not silently replace it with peer ranking.

Peer percentile ranking may be added as a separate context feature.

## 6. Data constraints

The original Google Sheets backend has about 50 weeks of stock history. Avoid introducing features that require 2Y/3Y/5Y history unless a new provider/history layer has been validated.

Historical OHLC must remain date-aligned. Never invent missing bars or dates.

Corporate actions:
- Prefer actual exchange/reference action evidence.
- Adjust historical prices/volume conservatively.
- Record uncertain actions rather than forcing an unverified adjustment.
- Preserve an audit trail.

Eligibility:
- Rights Entitlement and other temporary/special instruments must not leak into the normal screening universe.
- Screen eligibility is separate from classification.
- Current/latest-session checks must be date-based.

## 7. Current data pipeline

India:
- Direct NSE acquisition path with Full Bhavcopy/Security Deliverable preference and fallback to current CM-UDiFF Common Bhavcopy Final ZIP.
- Delivery percentage is captured where available.
- Corporate-action parsing/adjustment has regression coverage.
- Live validation reached 300 sessions and a multi-thousand-security acquisition.
- Latest successful Phase 1.1 validation reported 300 sessions, 3,669 securities, 2,376 with all 300 sessions, 92.8% delivery coverage, and latest trade date 2026-10-01.

US:
- yfinance-based provider currently used for technical validation/experimental acquisition.
- It is not yet approved as an unrestricted public redistribution source; provider terms/licensing must be reviewed before production public delivery.

ETF:
- Separate ETF universe and snapshot pipeline.
- Full 17-symbol validation has passed with 300 sessions.

Combined:
- GLOBAL snapshot builder and validator combine IN/US/ETF namespaces.
- market:sym identity is required so identical symbols can coexist across markets.
- Combined validation must check namespace collisions, benchmark mapping, date alignment, derived fields, eligibility, schema, and OHLCV integrity.

## 8. Classification policy

Use a versioned, auditable mapping layer.

India target hierarchy:
Macro-Economic Sector -> Sector -> Industry -> Basic Industry.

Do not guess missing classifications.
Preserve exact narrow mappings where already verified.
Store:
- classification source/version
- mapping status
- effective dates
- verification date
- evidence/reference

The repository currently contains the classification contract/schema and a template, not an unrestricted full NSE taxonomy dump.

Do not redistribute proprietary/reference taxonomy data without permission.

## 9. QA rules

Every meaningful change must pass:
1. Static syntax checks.
2. Automated fixture tests.
3. Relevant live validation where data-provider changes are involved.
4. Snapshot/validator checks.
5. Manual UI regression for the existing screener after frontend integration.
6. Regression checks against the stable checkpoint when changing core screening logic.

Before declaring success, verify:
- no runtime errors
- no missing columns
- no value overlap/clipping
- no incorrect market badge
- no broken mobile layout
- no broken sorting/filtering/export
- no cross-market contamination
- no unintended signal changes

For data:
- duplicate dates = 0
- out-of-order dates = 0
- invalid OHLC = 0
- negative volume = 0
- missing close = 0 for required bars
- benchmark overlap valid
- eligibility consistent
- corporate-action audit consistent

## 10. Security / intellectual-property architecture

End goal: private source repository + Cloudflare-hosted application.

Important rule:
- Anything sent to the browser can be inspected and copied by a determined user.
- Therefore proprietary logic must execute server-side.
- Browser JavaScript should be treated as public client code.

Production target:
- GitHub repository private.
- Cloudflare Worker/Pages Functions contains proprietary server-side calculation/orchestration.
- API/provider credentials stored as Cloudflare Secrets, never in frontend code.
- Raw historical provider files/state stored privately (for example, a private object store such as R2).
- Worker returns only required API responses/compact snapshots.
- Do not ship source maps to production unless there is a deliberate reason.
- Do not expose raw provider URLs, credentials, acquisition scripts, or internal snapshot files as public static assets.
- Add authentication/rate limiting/access controls where appropriate.
- Avoid logging raw secrets or provider payloads.
- Keep a clean separation between build-time acquisition and runtime serving.

Making GitHub private protects the repository from new public browsing, but it cannot erase copies of code that may already have been cloned/forked while public. Before privatization, review git history and remove secrets/sensitive data from history as necessary.

## 11. Deployment plan

Phase A — complete data-engineering validation without production integration.
Phase B — prove parity between new snapshots and the existing Google Sheets screener output.
Phase C — move proprietary technical calculations server-side.
Phase D — expose a compact application API to the unchanged UI.
Phase E — regression-test desktop/mobile and signal parity.
Phase F — connect Cloudflare production storage and scheduled acquisition.
Phase G — make GitHub private, harden secrets/access, then deploy production.
Phase H — remove public exposure of internal QA/data artifacts.

Never combine a large backend migration with a simultaneous UI redesign.

## 12. Provider/licensing rule

Technical correctness is not the same as redistribution permission.

Before production:
- document each provider/source
- document allowed use
- document caching/storage rights
- document redistribution/display rights
- keep provider adapters replaceable

Do not assume a public API/library license grants rights to redistribute market data.

## 13. Working method for future changes

1. Establish the current branch/commit and stable checkpoint.
2. Identify exactly which subsystem changes.
3. Preserve all unrelated behavior.
4. Make the smallest targeted change.
5. Add/update regression tests first or alongside the change.
6. Run CI.
7. For data changes, run live validation.
8. Inspect artifacts/QA output.
9. Only then integrate into the main screener UI.
10. Keep rollback points.

Never replace a working file with a speculative rewrite.
Never remove an existing feature merely because a new architecture makes it inconvenient.
Never claim parity without testing it.

## 14. Current next work

Priority order:
1. Finish combined IN/US/ETF validation and artifact inspection.
2. Use the new India parity QA harness to compare the Google Sheets feed with the new NSE raw acquisition on overlapping dates.
3. Build the automated Google Sheets -> new snapshot parity harness using the actual current production CSVs.
4. Complete verified classification mapping strategy without unauthorized taxonomy redistribution.
5. Build server-side calculation/API boundary while keeping the existing UI contract.
6. Add Cloudflare preview deployment for development/staging.
7. Add production security controls and private storage.
8. Migrate to private GitHub + Cloudflare production only after parity and regression testing.

## 15. QA tooling added

- `qa/india-data-qa.html`: snapshot/raw/validation viewer with eligibility and repeatable sampling.
- `qa/india-parity.html`: browser-based parity comparison of the existing Google Sheets India CSV against `state/IN.raw.json`, with tolerance reporting, corporate-action separation, deterministic sampling, ticker drill-down, and mismatch CSV export.
- `functions/api.js`: transitional Cloudflare Pages API boundary using a private R2 binding (`GS_DATA`) and the same `getData` / `getMktCap` contract expected by the existing frontend. It contains no screening logic.
- `generator/src/build-api-snapshots.mjs`: converts private raw market history into compact `sm1` API payloads for later R2 upload; India adds `.NS` to match the existing frontend ticker contract and preserves the configured benchmark ETF tickers when acquired.
- `_routes.json` limits Pages Function invocation to `/api/*` so ordinary static routes remain static.
- Pipeline CI now runs on both `main` and `data-pipeline-v2-2`.

## 16. Definition of “best” for GlobalScreener

The application is considered production-ready only when it is:
- technically reproducible
- data-auditable
- signal-stable
- fast enough for laptop/mobile
- safe from accidental source/credential/data exposure
- provider-compliant
- easy to roll back
- tested automatically and manually
- maintainable without breaking the existing screener

This playbook is authoritative for future GlobalScreener engineering decisions unless the user explicitly changes the product requirement.

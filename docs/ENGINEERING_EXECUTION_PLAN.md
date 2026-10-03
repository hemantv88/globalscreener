# GlobalScreener — Autonomous Engineering Execution Plan

## 1. Single project goal

Move GlobalScreener toward a production-ready architecture **without changing the proven screener behavior**.

The immediate goal is narrower and mandatory:

> **Prove the new data/calculation pipeline on GitHub first, with repeatable automated and browser-based regression tests, before moving any proprietary calculation to Cloudflare/server-side execution.**

The existing Google Sheets screener remains the control/baseline until GitHub staging demonstrates acceptable parity.

## 2. Non-negotiable gates

No step may skip these gates:

1. **Baseline gate**
   - Identify the exact main/stable commit being protected.
   - Confirm `index.html` is unchanged unless the task explicitly requires UI integration.

2. **Plan gate**
   - Identify the subsystem, dependencies, expected inputs/outputs, and regression risks before editing.

3. **Implementation gate**
   - Make the smallest change that advances the current phase.
   - Do not rewrite working formulas for style or convenience.
   - Preserve terminology and output contracts.

4. **Automated test gate**
   - Syntax checks.
   - Existing test suite.
   - New targeted regression tests.
   - Parity tests against the baseline wherever extraction/migration is involved.

5. **CI gate**
   - GitHub Actions must pass for the branch/PR.
   - A failed run is a stop condition, not a result to work around.

6. **Data-validation gate**
   - Required live validation and snapshot validation must pass for data-related changes.
   - Check date alignment, OHLCV integrity, eligibility, benchmarks, and corporate-action behavior.

7. **Browser QA gate**
   - Test the actual GitHub staging page where frontend behavior is involved.
   - Check filters, sorting, calculations, signals, rotation, exports, responsive layout, and runtime errors.

8. **Review gate**
   - Compare the final diff to the baseline.
   - Confirm unrelated files/features were not changed.
   - Confirm the new behavior is isolated and reversible.

9. **Promotion gate**
   - Only after the relevant gates pass may work be promoted to `main`.
   - Only after GitHub staging parity is proven may Cloudflare/server-side migration begin.

## 3. Execution cycle

For every meaningful change, repeat this complete cycle:

`PLAN -> INSPECT -> IMPLEMENT -> TEST -> CI -> QA -> REVIEW -> DECIDE -> REPEAT`

### PLAN
Define:
- exact objective
- affected files/functions
- inputs/outputs
- invariants that must remain unchanged
- tests that will prove success
- rollback point

### INSPECT
Read the current implementation and surrounding dependencies.
Do not infer missing logic.
Use the proven `index.html` as the authority for existing screener behavior.

### IMPLEMENT
Make one coherent, narrowly scoped change.
Prefer extraction over redesign.
Do not wire new modules into the live page until parity is established.

### TEST
Run the smallest relevant targeted test first, then the full suite.
When extracting code, compare the extracted function against the real baseline function rather than checking only a hand-written expected value.

### CI
Use GitHub Actions as the reproducible environment.
A failure starts another cycle:

`FAILURE -> DIAGNOSE -> MINIMAL FIX -> TEST -> CI`

Never mark a failed implementation as complete.

### QA
For browser-facing work, use a dedicated staging route/page.
Compare staging against the existing Google Sheets control where the two systems should behave identically.

### REVIEW
Inspect:
- Git diff
- changed files
- generated artifacts
- test output
- runtime/browser behavior
- unintended feature changes

### DECIDE
There are only three outcomes:
- **PASS** -> move to the next gated phase.
- **FAIL** -> diagnose and repeat the cycle.
- **UNCERTAIN** -> do not promote; add evidence/tests first.

## 4. Current phase roadmap

### Phase 1 — Calculation foundation parity
Extract low-level calculation primitives from the proven frontend without changing formulas.

Target families:
- EMA/SMA
- RSI and RSI series
- percentage-change helpers
- benchmark/date-alignment helpers
- RS position/history foundations

Pass condition:
- extracted functions match the baseline across deterministic fixtures and edge cases.
- CI is green.

### Phase 2 — Indicator parity
Extract and parity-test:
- weekly resampling
- volume metrics
- volatility/ADR
- breakout
- pivots
- 52-week calculations
- Darvas
- VCP
- IPO Base
- Momentum Base
- Smart Money Zone

Pass condition:
- each function has direct baseline parity tests plus boundary/insufficient-history tests.
- no production UI wiring yet.

### Phase 3 — Signal-engine parity
Extract:
- `computeTech`
- RS enrichment/ranking
- Early
- Setup
- Stage 2
- MRS
- derived row assembly

Pass condition:
- representative stock fixtures produce identical fields and states to the baseline.
- special/short-history/rights-entitlement cases are covered.
- benchmark-relative RS remains the canonical rule.

### Phase 4 — Rotation/leader parity
Extract and test:
- Macro/Sector/Industry hierarchy
- rotation state
- money-flow state
- peer-relative stock metrics
- Leader Score

Pass condition:
- context/ranking calculations remain display-only and do not alter Setup/Early/Stage2/MRS.

### Phase 5 — GitHub staged screener
Create a GitHub staging version that uses the new GitHub-tested engine while the current production/control screener remains untouched.

Test:
- India
- US
- ETF
- filters/sorts
- all major signal columns
- rotation/leader views
- export
- desktop/mobile
- loading/errors

Pass condition:
- acceptable functional parity with the control site.
- CI green.
- browser QA complete.

### Phase 6 — GitHub data/engine end-to-end
Run the complete pipeline:

`acquisition -> normalization -> eligibility -> classification -> derived calculations -> snapshots -> staging UI`

Pass condition:
- repeatable CI build.
- validated artifacts.
- no silent degradation when data changes.

### Phase 7 — Server-side migration preparation
Only after Phases 1–6 pass:
- define the server API contract.
- move already-proven calculations behind the API.
- keep formulas unchanged.
- compare server results against the GitHub engine before changing the browser.

### Phase 8 — Cloudflare integration
Only after server-side calculation parity passes:
- connect private storage/API.
- keep credentials and proprietary logic off the browser.
- repeat end-to-end regression.

## 5. Regression strategy

Maintain these references:

- **Control:** current Google Sheets-based production screener.
- **Stable rollback:** `phase1-stable-2026-10-02`.
- **Development:** active feature branch/PR.
- **GitHub staging:** new engine/data pipeline under test.

Never destroy the control or stable checkpoint to make a new architecture convenient.

## 6. Evidence standard

A statement such as "working", "parity achieved", or "ready" requires evidence.

Examples:
- "syntax works" -> syntax check passed.
- "engine is equivalent" -> direct parity test passed.
- "data is valid" -> validation report passed.
- "UI is unchanged" -> diff confirms `index.html` unchanged.
- "staging works" -> browser QA completed.
- "ready for Cloudflare" -> all earlier phase gates passed.

Do not substitute assumptions, visual confidence, or a single successful sample for repeatable evidence.

## 7. Failure-handling rule

When a test fails:

1. Stop promotion.
2. Read the actual failure output.
3. Identify whether the problem is:
   - implementation
   - test harness
   - fixture
   - environment
   - baseline-extraction issue
4. Fix only the identified problem.
5. Re-run the targeted test.
6. Re-run full CI.
7. Review the diff again.
8. Continue only after the gate passes.

A test-harness bug is still a real blocker because the purpose of the project is reproducibility.

## 8. Scope discipline

Do not combine:
- calculation migration + UI redesign
- provider migration + signal redesign
- Cloudflare migration + formula changes
- large refactors + unrelated feature additions

One architectural layer should be proven before the next one begins.

## 9. Current immediate task

Continue **Phase 1** on `engine-parity-phase1`.

Current work already created:
- `generator/src/engine/frontend-foundation.mjs`
- `tests/test-engine-foundation-parity.mjs`
- `docs/ENGINE_CALCULATION_INVENTORY.md`

The parity test has intentionally been wired into CI.

The next cycle is to make this Phase-1 parity harness fully green, then expand coverage one calculation family at a time.

## 10. Completion criterion for the immediate phase

Phase 1 is complete only when:
- the GitHub PR CI is green;
- the extracted foundation functions directly match the baseline;
- edge cases/insufficient history are covered;
- `index.html` remains unchanged;
- no Cloudflare/server-side path is activated;
- the branch is reviewed and suitable as the foundation for Phase 2.


# GlobalScreener Data Pipeline — Phase 1.1 (No R2)

This phase replaces the original India provider with a stronger NSE data layer adapted from the LazyScreen admin's shared data kit, while preserving GlobalScreener's snapshot and validation architecture.

## Source design

India primary market data: current NSE Full Bhavcopy + Security Deliverable data (delivery % included); current NSE CM-UDiFF Common Bhavcopy Final ZIP is the fallback.
Corporate actions: NSE PR/Bc daily corporate-action list.
Indices: NSE daily index close archive (NIFTY 500, NIFTY 50, India VIX).
Symbol continuity: NSE symbol-change list.

The shared kit's adjusted-history engine is retained with its conservative price-confirmation logic and split fallback. Raw prices are never overwritten; adjustment is applied when frames are read.

## Phase 1.1 goal

No Cloudflare R2, no Cloudflare payment method, and no Cloudflare API token. GitHub Actions builds and validates the dataset and stores the result only as a temporary GitHub Actions artifact. The first-run acquisition avoids a second delivery request when Full Bhavcopy already provides DELIV_PER.

## Run locally

From `generator/`:

```bash
npm run check
npm test
BACKFILL_DAYS=300 node src/build-india.mjs
node src/build-snapshot.mjs
MIN_TARGET_SESSIONS=300 MIN_UNIVERSE=1000 MIN_MEDIAN_HISTORY=250 node src/validate.mjs
```

## Important production caveat

NSE's current Data Sharing & Usage Policy states that redistribution is governed by the relevant agreement and that commercial access is subject to applicable fees/terms. This phase therefore treats NSE acquisition as a validation input; production public redistribution must be reviewed separately. See: https://www.nseindia.com/static/market-data/nse-data-policy

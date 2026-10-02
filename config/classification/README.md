# GlobalScreener classification layer

The application uses a four-level classification contract for India:

1. macro_economic_sector
2. sector
3. industry
4. basic_industry

NSE Indices states that its classification is four-tier and currently describes 12 macro-economic sectors, 22 sectors, 59 industries and 197 basic industries. citeturn881694search0turn267076search24

The repository intentionally stores the schema/contract and source metadata rather than reproducing the full NSE classification table, because the NSE Indices document states that the structure is proprietary and that commercial use requires prior consent. citeturn391816view0

## Mapping contract

One row per canonical instrument identity:

- market
- sym
- isin
- classification_source
- classification_version
- macro_economic_sector
- macro_code
- sector
- sector_code
- industry
- industry_code
- basic_industry
- basic_industry_code
- mapping_status
- effective_from
- effective_to
- verified_on
- evidence_ref

mapping_status values:
- verified
- inferred
- unmapped
- historical

Only `verified` mappings may drive production sector/industry rotation by default. `inferred` mappings remain available for research/audit and must never silently override a verified mapping.

## Scope

- Exact narrow mappings should be preserved when a trusted mapping already exists.
- India can evolve toward the NSE four-tier hierarchy without changing the market-data schema.
- US and ETF classifications remain separate adapters; an NSE classification is never automatically applied to them.
- Corporate actions and instrument eligibility remain independent of classification.

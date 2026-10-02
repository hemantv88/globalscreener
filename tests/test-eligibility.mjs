import assert from 'node:assert/strict';
import { classifyInstrument } from '../generator/src/eligibility.mjs';

const current = {ticker:'ABC', series:'EQ', daily:[{date:'2026-10-01',c:100}]};
const stale = {ticker:'ABC', series:'EQ', daily:[{date:'2026-09-30',c:100}]};
const re = {ticker:'ABC_RE', series:'BE', daily:[{date:'2026-10-01',c:1}]};
const special = {ticker:'ABC', series:'SM', daily:[{date:'2026-10-01',c:10}]};

assert.deepEqual(classifyInstrument(current,'2026-10-01'),{
  instrumentType:'LISTED_EQUITY',seriesClass:'EQ',currentOnLatestSession:true,screenEligible:true,eligibilityReason:null
});
assert.deepEqual(classifyInstrument(stale,'2026-10-01'),{
  instrumentType:'LISTED_EQUITY',seriesClass:'EQ',currentOnLatestSession:false,screenEligible:false,eligibilityReason:'NO_TRADE_ON_LATEST_MARKET_SESSION'
});
assert.deepEqual(classifyInstrument(re,'2026-10-01'),{
  instrumentType:'RIGHTS_ENTITLEMENT',seriesClass:'BE',currentOnLatestSession:true,screenEligible:false,eligibilityReason:'RIGHTS_ENTITLEMENT'
});
assert.deepEqual(classifyInstrument(special,'2026-10-01'),{
  instrumentType:'LISTED_EQUITY_SPECIAL_SERIES',seriesClass:'SM',currentOnLatestSession:true,screenEligible:true,eligibilityReason:null
});
console.log('PASS instrument eligibility classification');

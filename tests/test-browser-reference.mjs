import * as ref from '../generator/src/engine/browser-reference.mjs';

const expected = [
  'ema','sma','rsi','rsiSeries','pivots','pivZone','pivMatch','stage2','weeklyResample','emaSeries','barChange','pctChange','pctChangeHist',
  'benchIndex','benchPctBetween','benchLegPct','benchLegPctHist','consolidation','volAvg20','volSpike','volSpike','thrustDay','hi52','lo52','breakout',
  'darvasSeries','darvasState','darvasBox','adrPct','tightness','coilRatio','pctFromEma','pctFromPivot','vcpPivots','vcpContractions','vcpDetect',
  'momentumBase','ipoBase','smartMoneyZones','earlyVolumeTransition','computeTech','benchmarkAvailable','rankRS','earlyFinite','earlyMinTrigger',
  'earlyRSPLead','earlyCompression','earlyVolumeScore','earlyTrendScore','earlyStructureScore','calcEarlyBreakout','setupBaseAge','emasAligned',
  'emaConverged','weeklyEmaConverged1020','lifecycleStage'
].filter((v,i,a)=>a.indexOf(v)===i);

for (const name of expected) {
  if (typeof ref[name] !== 'function') throw new Error(`Missing browser reference export: ${name}`);
}
if (Object.keys(ref).length !== expected.length) {
  throw new Error(`Unexpected export count: got ${Object.keys(ref).length}, expected ${expected.length}`);
}
console.log(`Browser reference extraction OK: ${expected.length} functions`);

/*
 * GlobalScreener GitHub-only stock rotation helper parity layer.
 * Baseline index.html blob: c2ade50a605a5d7c32df3e679d02e03e763fd4c4
 *
 * These are pure helpers used by the Rotation/Leader-Hunt stock layer.
 * No browser globals are used here.
 */

const SECTOR_ROT_LOOKBACK=5;
const ROT_ACCEL_LOOKBACK=3;

export function numOk(v){ return typeof v==='number' && isFinite(v); }

export function rsChangeOf(d){
  const h=d&&d.rsHist;
  if(!Array.isArray(h)||h.length<SECTOR_ROT_LOOKBACK+1) return null;
  const now=h[h.length-1], then=h[h.length-1-SECTOR_ROT_LOOKBACK];
  if(now==null||then==null) return null;
  return +(now-then).toFixed(2);
}

export function stockRsAccelOf(d){
  const h=d&&d.rsHist;
  const L=SECTOR_ROT_LOOKBACK, A=ROT_ACCEL_LOOKBACK;
  if(!Array.isArray(h)||h.length<L+A+1) return null;
  const n=h.length-1;
  const now=h[n], then=h[n-L], priorEnd=n-A, priorStart=priorEnd-L;
  if([now,then,h[priorEnd],h[priorStart]].some(v=>!numOk(v))) return null;
  return +((now-then)-(h[priorEnd]-h[priorStart])).toFixed(2);
}

export function rotPctRank(v,vals){
  if(v==null||!vals||!vals.length) return null;
  return +(100*vals.filter(x=>x<=v).length/vals.length).toFixed(1);
}

export function rotStockState(rsRank,momRank){
  if(rsRank==null||momRank==null) return '—';
  const strong=rsRank>=50, rising=momRank>=50;
  if(strong&&rising) return 'Powering Up';
  if(!strong&&rising) return 'Turning Up';
  if(strong&&!rising) return 'Cooling';
  return 'Falling Back';
}

export function rotLeaderScore(x){
  if(!x) return -Infinity;
  const context=x.contextScore==null?0:x.contextScore;
  const early=x.e&&x.e.score!=null?Math.max(0,Math.min(100,x.e.score)):0;
  const rs=x.peerRsRank==null?50:x.peerRsRank;
  const rsUp=x.peerMomRank==null?50:x.peerMomRank;
  const accel=x.peerAccelRank==null?50:x.peerAccelRank;
  const trigger=x.e&&x.e.triggerDist!=null?Math.max(0,Math.min(100,100-x.e.triggerDist*5)):0;
  const h52=x.h52==null?0:Math.max(0,Math.min(100,(x.h52+30)*(100/30)));
  return +(context*0.25 + early*0.20 + rs*0.15 + rsUp*0.20 + accel*0.05 + trigger*0.10 + h52*0.05).toFixed(2);
}

export function rotV5StateRank(state){
  state=String(state||'').toLowerCase();
  return state==='prime'?5:state==='watch'?4:state==='accumulation'?3:state==='developing'?2:state==='breakout'?4:1;
}

export function rotV5EarlyLabel(state){
  return ({prime:'Prime',watch:'Watch',accumulation:'Accumulation',developing:'Developing',breakout:'Breakout'})[state]||'—';
}

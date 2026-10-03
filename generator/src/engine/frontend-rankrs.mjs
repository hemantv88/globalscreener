/*
 * GlobalScreener GitHub-only benchmark-relative RS attachment.
 *
 * index.html remains the control implementation.
 * The pure function below preserves rankRS() formulas while replacing its
 * browser globals (UNI/SD/BENCHMARK_DATA) with explicit inputs.
 */
import { emaSeries, benchLegPct, rsPosition, rspHistory } from './frontend-foundation.mjs';
import { weeklyResample } from './frontend-market-structure.mjs';
import { earlyFinite, calcEarlyBreakout } from './frontend-early.mjs';

export function benchIndex(dates,closes){
  if(!Array.isArray(dates)||!Array.isArray(closes)||!dates.length) return null;
  const m=new Map(), ds=[];
  for(let i=0;i<dates.length;i++){
    const dt=dates[i], c=closes[i];
    if(!dt||c==null||!isFinite(c)) continue;
    if(!m.has(dt)) ds.push(dt);
    m.set(dt,c);
  }
  if(!ds.length) return null;
  ds.sort();
  return {
    size:ds.length,
    first:ds[0],
    last:ds[ds.length-1],
    at(dt){
      if(!dt) return null;
      const hit=m.get(dt);
      if(hit!==undefined) return hit;
      let lo=0,hi=ds.length-1,best=-1;
      while(lo<=hi){
        const mid=(lo+hi)>>1;
        if(ds[mid]<=dt){ best=mid; lo=mid+1; } else { hi=mid-1; }
      }
      return best<0?null:m.get(ds[best]);
    },
  };
}

export function benchLegPctHist(bi,tail,N,count){
  if(!bi||!Array.isArray(tail)||tail.length<N+count) return null;
  const out=[], n=tail.length;
  for(let i=n-count;i<n;i++){
    const v=bi.at(tail[i-N]);
    const w=bi.at(tail[i]);
    if(v==null||w==null||!v||!isFinite(v)||!w||!isFinite(w)) return null;
    out.push(+((w/v-1)*100).toFixed(2));
  }
  return out;
}

const FRESH_RSP_LEN=21;
const FRESH_LOOKBACK={rsp:5};
const FRESH_RSP_BASE=5;
const FRESH_RSP_HIST=FRESH_LOOKBACK.rsp+FRESH_RSP_BASE+1;

export function rankRSItems(items,benchmark,market='india'){
  const rows=(items||[]).filter(Boolean);
  if(!rows.length) return rows;

  const b=benchmark;
  const bi=b?benchIndex(b.dates,b.C):null;
  const bwk=b?weeklyResample(b.C,b.H,b.L,b.V,b.dates):null;
  const bwi=bwk?benchIndex(bwk.dates,bwk.closes):null;

  let marketRegime='unknown';
  if(b&&Array.isArray(b.C)&&b.C.length>=200){
    const n=b.C.length, e20=emaSeries(b.C,20).at(-1), e50=emaSeries(b.C,50).at(-1), e200=emaSeries(b.C,200).at(-1);
    const c=b.C[n-1];
    if([c,e20,e50,e200].every(earlyFinite)) marketRegime=(c>e20&&c>e50&&c>e200)?'bull':(c<e20&&c<e50&&c<e200)?'bear':'mixed';
  }

  rows.forEach(d=>{
    const ex=(own,bench)=> (own!=null && bench!=null) ? +(own-bench).toFixed(2) : null;
    const bp21 = benchLegPct(bi,d.rsDates,21);
    const bp55 = benchLegPct(bi,d.rsDates,55);
    const bp10w= benchLegPct(bwi,d.rsWkDates,10);
    const bHist= benchLegPctHist(bi,d.rsDates,21,30);
    d.rs21 = ex(d.pc21,bp21);
    d.rs55 = ex(d.pc55,bp55);
    d.rs10w= ex(d.pc10w,bp10w);
    d.rsSlope = (d.rs21!=null&&d.rs55!=null) ? +(d.rs21-d.rs55).toFixed(2) : null;
    d.rsTrend = d.rsSlope==null ? null
              : (Math.abs(d.rsSlope)<0.5 ? 'flat' : d.rsSlope>0 ? 'up' : 'down');
    d.leadRS  = (d.rs21!=null&&d.rs55!=null&&d.rs10w!=null)
              ? (d.rs21>0 && d.rs55>0 && d.rs10w>0) : null;
    d.rsHist  = (bHist && d.pcHist21 && d.pcHist21.length===bHist.length)
              ? d.pcHist21.map((v,i)=>+(v-bHist[i]).toFixed(2)) : null;
    d.rsp55 = rsPosition(d.rsCloses,d.rsDates,bi,55);
    d.rsp21 = rsPosition(d.rsCloses,d.rsDates,bi,21);
    d.rspHist21 = rspHistory(d.rsCloses,d.rsDates,bi,FRESH_RSP_LEN,FRESH_RSP_HIST);
    d.marketRegime=marketRegime;
    d.early=calcEarlyBreakout(d,market);
    d.rs=null; d.mrsRank=null;
  });

  const ranked=rows.filter(d=>d.rs55!=null).sort((a,b2)=>a.rs55-b2.rs55);
  ranked.forEach((d,i)=>{
    const p=Math.max(1,Math.round((i+1)/ranked.length*100));
    d.mrsRank=p;
    d.rs=p;
  });

  rows.forEach(d=>{
    if(d.s2&&d.s2.details&&d.s2.details[7]){
      d.s2.details[7].pass = d.rs21!=null && d.rs21>0;
      d.s2.score = d.s2.details.filter(c=>c.pass).length;
    }
  });
  return rows;
}

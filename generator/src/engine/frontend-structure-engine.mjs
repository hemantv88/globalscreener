/* GitHub-only Phase 3 mirror of Setup/Stage-2/structure helpers from index.html.
 * index.html is unchanged and remains the live calculation/control baseline.
 */
import { sma } from './frontend-foundation.mjs';

const ADR_WIN=20;
const TIGHT_WIN=3;
const COIL_WIN=20;

export function stage2(price,closes,h52,l52,we20,sma50,sma150,sma200){
  const n=closes?closes.length:0;

  // "Trending up for at least a month" = compare against the SMA 200 as it
  // stood 20 bars ago, which needs 200+20 bars, not 200.
  const sma200_20ago = n>=220 ? sma(closes.slice(0,-20),200) : null;

  // Rule 8 (RS vs benchmark) is patched in by rankRS() after the whole universe
  // AND the benchmark series are loaded — a single stock cannot know its excess
  // return over an index that has not been fetched yet. Starts false.
  // If you reorder this array, update the details[7] index in rankRS().
  const checks=[
    {label:'Price > SMA 150 and > SMA 200',       pass: sma150!=null && sma200!=null && price>sma150 && price>sma200},
    {label:'SMA 150 > SMA 200',                   pass: sma150!=null && sma200!=null && sma150>sma200},
    {label:'SMA 200 trending up ≥1 month',        pass: sma200!=null && sma200_20ago!=null && sma200>sma200_20ago},
    {label:'SMA 50 > SMA 150 > SMA 200',          pass: sma50!=null && sma150!=null && sma200!=null && sma50>sma150 && sma150>sma200},
    {label:'Price > SMA 50',                      pass: sma50!=null && price>sma50},
    {label:'Price ≥ 30% above 52W low',           pass: l52!=null && l52>0 && price>=l52*1.3},
    {label:'Price within 25% of 52W high',        pass: h52!=null && h52>0 && price>=h52*0.75},
    {label:'RS positive vs benchmark',            pass: false},
    {label:'Price > Weekly EMA 20 (≈40-week sub)',pass: we20!=null && price>we20},
  ];
  // total is derived, never a literal: the old code hardcoded 7 here while the
  // array length was the real answer, so adding a rule silently produced "8/7".
  return{score:checks.filter(c=>c.pass).length,total:checks.length,details:checks};
}

export function squeeze(C,H,L){
  const n=C.length; if(n<5) return 0;
  const avg=C.reduce((a,b)=>a+b,0)/n;
  const std=Math.sqrt(C.reduce((a,b)=>a+(b-avg)**2,0)/n);
  const bbW=4*std/avg;
  let atrS=0,atrN=0;
  for(let i=1;i<n;i++){
    const tr=Math.max(H[i]-L[i],Math.abs(H[i]-C[i-1]),Math.abs(L[i]-C[i-1]));
    atrS+=tr;atrN++;
  }
  const kcW=atrN?3*(atrS/atrN)/avg:0;
  return kcW?Math.max(0,Math.min(100,+((1-bbW/kcW)*100).toFixed(1))):0;
}

export function darvasSeries(H,L,boxp){
  const p=(boxp&&boxp>=3)?Math.floor(boxp):5;
  if(!Array.isArray(H)||!Array.isArray(L)||H.length!==L.length) return null;
  const n=H.length;
  const tops=new Array(n).fill(null), bots=new Array(n).fill(null);
  if(n<2*p-1) return {tops,bots,minBars:2*p-1,boxp:p};

  /* Rolling extreme over the w bars ENDING at i. null (Pine na) whenever the
     window would run off the start of the series or contain a hole — a partial
     window is a different statistic, not a smaller one. */
  const ext=(arr,w,i,max)=>{
    if(w<1||i-w+1<0) return null;
    let m=null;
    for(let j=i-w+1;j<=i;j++){
      const v=arr[j];
      if(v==null||!isFinite(v)) return null;
      m = m==null ? v : (max ? Math.max(m,v) : Math.min(m,v));
    }
    return m;
  };

  let lastCond=-1;   // index of the most recent `high > k1[1]` bar  (barssince)
  let NH=null;       // valuewhen(high > k1[1], high, 0)
  let top=null, bot=null;   // the persisted box, carried forward bar to bar
  for(let i=0;i<n;i++){
    // cond = high > k1[1] : this bar's high beat the highest high of the boxp
    // bars ending on the PREVIOUS bar.
    const k1prev = i>0 ? ext(H,p,i-1,true) : null;
    const hi=H[i];
    if(k1prev!=null && hi!=null && isFinite(hi) && hi>k1prev){ lastCond=i; NH=hi; }

    const k2=ext(H,p-1,i,true), k3=ext(H,p-2,i,true);
    const box1 = (k2!=null && k3!=null && k3<k2);   // no new high in the last boxp-2 bars
    const bs = lastCond>=0 ? i-lastCond : null;     // barssince(cond); null = never

    if(bs===p-2 && box1 && NH!=null){
      const ll=ext(L,p,i,false);
      // Both legs come from the SAME bar i — Pine evaluates the two valuewhen()
      // calls on one condition, so a TopBox from one bar and a BottomBox from
      // another would not be a box at all.
      if(ll!=null){ top=NH; bot=ll; }
    }
    tops[i]=top; bots[i]=bot;
  }
  return {tops,bots,minBars:2*p-1,boxp:p};
}

export function darvasState(C,tops,bots,nearPct){
  const n=(C&&C.length)||0;
  if(!n||!tops||!bots) return null;
  const top=tops[n-1], bot=bots[n-1];
  if(top==null||bot==null) return null;            // no box has formed yet
  const c=C[n-1];
  if(c==null||!isFinite(c)) return null;
  const prevC=n>=2?C[n-2]:null, prevTop=n>=2?tops[n-2]:null;
  // Pine: crossover(close, TopBox) === close > TopBox and close[1] <= TopBox[1]
  if(prevC!=null && prevTop!=null && isFinite(prevC) && prevC<=prevTop && c>top) return 'break';
  if(c>top) return 'above';
  const near=(nearPct==null?1.0:+nearPct);
  if(c<top && c>=top*(1-near/100)) return 'near';
  if(c>=bot && c<=top) return 'inside';
  if(c<bot) return 'below';
  return null;
}

export function darvasBox(C,H,L,boxp,nearPct){
  const n=(C&&C.length)||0;
  if(!n||!Array.isArray(H)||!Array.isArray(L)||H.length!==n||L.length!==n) return {top:null,bot:null,state:null};
  const s=darvasSeries(H,L,boxp);
  if(!s) return {top:null,bot:null,state:null};
  const top=s.tops[n-1], bot=s.bots[n-1];
  return {
    top: top==null?null:+top.toFixed(2),
    bot: bot==null?null:+bot.toFixed(2),
    state: darvasState(C,s.tops,s.bots,nearPct),
  };
}

export function adrPct(H,L,win){
  const w=win||ADR_WIN;
  const n=Math.min((H&&H.length)||0,(L&&L.length)||0);
  if(n<w) return null;                       // cannot have 20 usable bars if there are not 20
  let sum=0, used=0;
  for(let i=n-1;i>=0&&used<w;i--){
    const h=+H[i], l=+L[i];
    if(!isFinite(h)||!isFinite(l)||l<=0) continue;   // a hole, not a price
    sum+=h/l; used++;
  }
  if(used<w) return null;
  return +((sum/used-1)*100).toFixed(2);
}

export function upDayStreak(C){
  if(!Array.isArray(C)) return null;
  const n=C.length; if(n<2) return null;
  const fin=v=>typeof v==='number'&&isFinite(v);
  if(!fin(C[n-1])||!fin(C[n-2])) return null;
  let k=0;
  for(let i=n-1;i>0;i--){
    if(!fin(C[i])||!fin(C[i-1])) break;
    if(C[i]>C[i-1]) k++; else break;
  }
  return k;
}

export function tightness(C,H,L,adr,win){
  const w=win||TIGHT_WIN;
  if(adr==null||!isFinite(adr)||adr<=0) return null;
  if(!Array.isArray(C)||!Array.isArray(H)||!Array.isArray(L)) return null;
  const n=Math.min(C.length,H.length,L.length);
  if(n<w) return null;
  let sum=0;
  for(let i=n-w;i<n;i++){
    const cl=C[i], hi=H[i], lo=L[i];
    if(!(typeof cl==='number'&&isFinite(cl)&&cl>0)) return null;
    if(!(typeof hi==='number'&&isFinite(hi))) return null;
    if(!(typeof lo==='number'&&isFinite(lo))) return null;
    sum+=(hi-lo)/cl*100;
  }
  return +(100*(sum/w)/adr).toFixed(2);
}

export function coilRatio(H,L,win){
  const w=Math.floor(win==null?COIL_WIN:win);
  if(!(w>=2)) return null;
  if(!Array.isArray(H)||!Array.isArray(L)) return null;
  const n=Math.min(H.length,L.length);
  if(n<w) return null;
  const half=Math.floor(w/2);
  // True high-to-low over [from,to). Returns null on any unusable bar.
  const rng=(from,to)=>{
    let hi=-Infinity, lo=Infinity;
    for(let i=from;i<to;i++){
      const h=H[i], l=L[i];
      if(!(typeof h==='number'&&isFinite(h))) return null;
      if(!(typeof l==='number'&&isFinite(l))) return null;
      if(h>hi) hi=h;
      if(l<lo) lo=l;
    }
    return hi-lo;
  };
  /* An ODD window gives the EARLIER half the spare bar: `half` bars of recent
     against `w-half` earlier. The recent half is the one being judged, so it is
     the one held to the exact stated length. */
  const recent=rng(n-half,n), earlier=rng(n-w,n-half);
  if(recent==null||earlier==null) return null;
  if(!(recent>0)||!(earlier>0)) return null;
  return +(recent/earlier).toFixed(2);
}

export function pctFromEma(price,ema){
  if(price==null||!isFinite(price)) return null;
  if(ema==null||!isFinite(ema)||ema<=0) return null;
  return +((price-ema)/ema*100).toFixed(2);
}

export function pctFromPivot(price,boxTop){
  if(price==null||!isFinite(price)) return null;
  if(boxTop==null||!isFinite(boxTop)||boxTop<=0) return null;
  return +((price-boxTop)/boxTop*100).toFixed(2);
}


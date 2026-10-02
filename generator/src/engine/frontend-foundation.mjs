/*

 * GlobalScreener frontend-engine parity layer.

 *

 * IMPORTANT:

 * - This module is intentionally NOT imported by index.html yet.

 * - Function bodies are mirrored from the current proven index.html baseline.

 * - Do not rewrite formulas here until parity tests are green and the change is reviewed.

 * - Baseline index.html blob: c2ade50a605a5d7c32df3e679d02e03e763fd4c4

 */

export function ema(arr, p) {
  if (!arr || arr.length < p) return null;
  const k = 2/(p+1);
  let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  for (let i=p;i<arr.length;i++) e=arr[i]*k+e*(1-k);
  return e;
}

export function sma(arr, p) {
  if (!arr || arr.length < p) return null;
  const slice = arr.slice(-p);
  return slice.reduce((a,b)=>a+b,0) / p;
}

export function rsi(closes, p=14) {
  if (!closes||closes.length<p+1) return null;
  let g=0,l=0;
  for (let i=1;i<=p;i++){const d=closes[i]-closes[i-1];d>0?g+=d:l+=Math.abs(d)}
  let ag=g/p, al=l/p;
  for (let i=p+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p;
    al=(al*(p-1)+Math.max(-d,0))/p;
  }
  if(!al) return 100;
  return Math.round(100-100/(1+ag/al));
}

export function rsiSeries(closes, p=14){
  const out=new Array(closes?closes.length:0).fill(null);
  if(!closes||closes.length<p+1) return out;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const d=closes[i]-closes[i-1];d>0?g+=d:l+=Math.abs(d)}
  let ag=g/p, al=l/p;
  // A zero average loss means nothing but up-closes in the window; RSI is
  // defined as 100 there rather than dividing by zero. Same branch as rsi().
  out[p]=al?100-100/(1+ag/al):100;
  for(let i=p+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p;
    al=(al*(p-1)+Math.max(-d,0))/p;
    out[i]=al?100-100/(1+ag/al):100;
  }
  return out;
}

export function emaSeries(arr,p){
  const out=new Array(arr.length).fill(null);
  if(!arr||arr.length<p) return out;
  const k=2/(p+1);
  let e=arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  out[p-1]=e;
  for(let i=p;i<arr.length;i++){ e=arr[i]*k+e*(1-k); out[i]=e; }
  return out;
}

export function pctChange(arr,N){
  if(!arr||arr.length<N+1) return null;
  const a=arr[arr.length-1-N], b=arr[arr.length-1];
  if(!a||!isFinite(a)||!isFinite(b)) return null;
  return (b/a-1)*100;
}

export function pctChangeHist(arr,N,count){
  if(!arr||arr.length<N+count) return null;
  const out=[], n=arr.length;
  for(let i=n-count;i<n;i++){
    const a=arr[i-N];
    if(!a||!isFinite(a)) return null;
    out.push(+((arr[i]/a-1)*100).toFixed(2));
  }
  return out;
}

export function barChange(arr,N){
  const v=pctChange(arr,N);
  return v==null?null:+v.toFixed(2);
}

export function benchPctBetween(bi,dStart,dEnd){
  if(!bi||!dStart||!dEnd) return null;
  const a=bi.at(dStart), b=bi.at(dEnd);
  if(a==null||b==null||!a||!isFinite(a)||!isFinite(b)) return null;
  return (b/a-1)*100;
}

export function benchLegPct(bi,tail,N){
  if(!bi||!Array.isArray(tail)||tail.length<N+1) return null;
  return benchPctBetween(bi,tail[tail.length-1-N],tail[tail.length-1]);
}

export function rsPosition(closes,dates,bi,len){
  if(!bi||!Array.isArray(closes)||!Array.isArray(dates)) return null;
  const n=Math.min(closes.length,dates.length);
  if(!len||n<len) return null;                 // no silent window shrinking
  const ratio=[];
  for(let i=n-len;i<n;i++){
    const c=closes[i], bc=bi.at(dates[i]);
    // A bar the benchmark cannot price is a HOLE in the window, and a min/max
    // taken over a window with holes is not the range the label claims.
    if(c==null||!isFinite(c)||bc==null||!bc||!isFinite(bc)) return null;
    ratio.push(c/bc);
  }
  let hh=-Infinity, ll=Infinity;
  for(let i=0;i<ratio.length;i++){
    if(ratio[i]>hh) hh=ratio[i];
    if(ratio[i]<ll) ll=ratio[i];
  }
  // hh===ll is a perfectly flat ratio: the stock tracked the benchmark exactly
  // across the whole window. The Pine returns na and so does this — guarding
  // the divide EXPLICITLY rather than letting 0/0 render as NaN.
  if(!isFinite(hh)||!isFinite(ll)||hh===ll) return null;
  const cur=ratio[ratio.length-1];
  return +(((99-1)*(cur-ll)/(hh-ll))+1).toFixed(2);
}

export function rspHistory(closes,dates,bi,len,bars){
  if(!bi||!Array.isArray(closes)||!Array.isArray(dates)) return null;
  const n=Math.min(closes.length,dates.length);
  if(!len||!bars||n<len) return null;
  const out=[];
  // k counts BACK from the latest bar; k=0 is today, and must reproduce the
  // rsp column's own value exactly (t5 asserts that equality).
  for(let k=Math.min(bars,n-len+1)-1;k>=0;k--){
    const end=n-k;
    out.push(rsPosition(closes.slice(0,end),dates.slice(0,end),bi,len));
  }
  return out.length?out:null;
}


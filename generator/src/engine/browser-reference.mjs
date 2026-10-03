/* Browser calculation-engine reference extraction.
 * Source: hemantv88/globalscreener:data-pipeline-v2-2/index.html
 * Browser index baseline SHA: c2ade50a605a5d7c32df3e679d02e03e763fd4c4
 * Extraction rule: mechanical function-body copy only; no formula/threshold edits.
 * This module is a REFERENCE layer for parity work. It is not production code.
 */

function ema(arr, p) {
  if (!arr || arr.length < p) return null;
  const k = 2/(p+1);
  let e = arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  for (let i=p;i<arr.length;i++) e=arr[i]*k+e*(1-k);
  return e;
}

function sma(arr, p) {
  if (!arr || arr.length < p) return null;
  const slice = arr.slice(-p);
  return slice.reduce((a,b)=>a+b,0) / p;
}

function rsi(closes, p=14) {
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

function rsiSeries(closes, p=14){
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

function pivots(h,l,c){
  const pp=(h+l+c)/3;
  return{pp,r1:2*pp-l,r2:pp+(h-l),s1:2*pp-h,s2:pp-(h-l)};
}

function pivZone(price,piv){
  if(!piv) return '—';
  const{pp,r1,r2,s1,s2}=piv;
  if(price>=r2)         return 'R2+';
  if(price>=r1)         return 'R1→R2';
  if(price>=pp*1.003)   return 'PP→R1';
  if(price>=pp*0.997)   return 'PP';
  if(price>=s1)         return 'S1→PP';
  if(price>=s2)         return 'S2→S1';
  return '<S2';
}

function pivMatch(sel,zone,price,piv){
  if(!sel) return true;                       // no screen selected
  const o=PIV_OPTS.find(x=>x.v===sel);
  if(o) return !!o.test(zone,price,piv);
  const lg=PIV_LEGACY[sel];
  if(lg) return !!lg(zone);
  return true;   // a value from a future build screens nothing rather than emptying the table
}

function stage2(price,closes,h52,l52,we20,sma50,sma150,sma200){
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

function weeklyResample(C,H,L,V,dates,O){
  const wks=new Map();
  dates.forEach((dt,i)=>{
    if(!dt||C[i]==null) return;
    const k=wkMondayKey(dt);
    if(!wks.has(k)) wks.set(k,{o:(O&&O[i]!=null)?O[i]:C[i],h:H[i]||0,l:L[i]||Infinity,c:C[i],v:0});
    const w=wks.get(k);
    w.h=Math.max(w.h,H[i]||0);
    w.l=Math.min(w.l,L[i]||Infinity);
    w.c=C[i]; w.v+=V[i]||0;
  });
  const keys=[...wks.keys()].sort();
  return{
    /* The Monday bucket key re-expressed as the SUNDAY that closes that ISO
       week. It is a CALENDAR label, deliberately not the last day the ticker
       actually traded: a stock whose week ended Thursday and a benchmark whose
       same week ended Friday must yield the IDENTICAL key, or aligning the two
       weekly series by date would pair the stock's week with the benchmark's
       PREVIOUS one and understate a whole week of relative strength. */
    dates:keys.map(wkSundayKey),
    closes:keys.map(k=>wks.get(k).c),
    opens:keys.map(k=>wks.get(k).o),
    highs:keys.map(k=>wks.get(k).h),
    lows:keys.map(k=>wks.get(k).l),
    volumes:keys.map(k=>wks.get(k).v),
  };
}

function emaSeries(arr,p){
  const out=new Array(arr.length).fill(null);
  if(!arr||arr.length<p) return out;
  const k=2/(p+1);
  let e=arr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  out[p-1]=e;
  for(let i=p;i<arr.length;i++){ e=arr[i]*k+e*(1-k); out[i]=e; }
  return out;
}

function barChange(arr,N){
  const v=pctChange(arr,N);
  return v==null?null:+v.toFixed(2);
}

function pctChange(arr,N){
  if(!arr||arr.length<N+1) return null;
  const a=arr[arr.length-1-N], b=arr[arr.length-1];
  if(!a||!isFinite(a)||!isFinite(b)) return null;
  return (b/a-1)*100;
}

function pctChangeHist(arr,N,count){
  if(!arr||arr.length<N+count) return null;
  const out=[], n=arr.length;
  for(let i=n-count;i<n;i++){
    const a=arr[i-N];
    if(!a||!isFinite(a)) return null;
    out.push(+((arr[i]/a-1)*100).toFixed(2));
  }
  return out;
}

function benchIndex(dates,closes){
  if(!Array.isArray(dates)||!Array.isArray(closes)||!dates.length) return null;
  const m=new Map(), ds=[];
  for(let i=0;i<dates.length;i++){
    const dt=dates[i], c=closes[i];
    if(!dt||c==null||!isFinite(c)) continue;
    if(!m.has(dt)) ds.push(dt);
    m.set(dt,c);   // a duplicated date resolves to the LATER row, which is the
                   // bar the series' own index arithmetic would have used
  }
  if(!ds.length) return null;
  ds.sort();       // ISO dates sort correctly as strings; see the parser note
  return {
    size:ds.length,
    first:ds[0],
    last:ds[ds.length-1],
    /* The benchmark close ON `dt`, or on the most recent bar AT OR BEFORE it.
       The fallback exists because an exchange holiday or a plain calendar
       mismatch must not blank a whole column. It returns null — never a
       guess, and never the stock's own return — when the benchmark's history
       does not reach back that far, because there is no honest number to
       report and a raw return wearing an RS label is the exact bug this
       module was rewritten to make unreachable. */
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

function benchPctBetween(bi,dStart,dEnd){
  if(!bi||!dStart||!dEnd) return null;
  const a=bi.at(dStart), b=bi.at(dEnd);
  if(a==null||b==null||!a||!isFinite(a)||!isFinite(b)) return null;
  return (b/a-1)*100;
}

function benchLegPct(bi,tail,N){
  if(!bi||!Array.isArray(tail)||tail.length<N+1) return null;
  return benchPctBetween(bi,tail[tail.length-1-N],tail[tail.length-1]);
}

function benchLegPctHist(bi,tail,N,count){
  if(!bi||!Array.isArray(tail)||tail.length<N+count) return null;
  const out=[], n=tail.length;
  for(let i=n-count;i<n;i++){
    const v=benchPctBetween(bi,tail[i-N],tail[i]);
    if(v==null) return null;
    out.push(+v.toFixed(2));
  }
  return out;
}

function consolidation(closes,lookback,maxRangePct){
  if(!closes||closes.length<lookback+1) return {days:null,range:null};
  const w=closes.slice(-lookback);
  const mn=Math.min(...w), mx=Math.max(...w);
  if(!(mn>0)) return {days:null,range:null};
  const range=+((mx-mn)/mn*100).toFixed(2);
  let days=0;
  for(let k=2;k<=lookback;k++){
    const s=closes.slice(-k);
    const a=Math.min(...s), b=Math.max(...s);
    if(!(a>0)) break;
    if((b-a)/a*100<=maxRangePct) days=k; else break;
  }
  return {days,range};
}

function volAvg20(V,end){
  const e=(end==null?((V&&V.length)||0):end);
  let sum=0,cnt=0;
  for(let i=Math.max(0,e-21);i<e-1;i++){ const v=V[i]; if(v>0){ sum+=v; cnt++; } }
  return cnt?sum/cnt:0;
}

function volSpike(V,win,mult){
  const w=(win==null?VOL_SPIKE_WIN:win), m=(mult==null?VOL_SPIKE_MULT:mult);
  const none={mult:null,age:null};
  if(!Array.isArray(V)) return none;
  const n=V.length;
  if(n<21) return none;            // 20 bars of baseline + at least 1 to measure
  let best=null,bestI=-1;
  for(let i=Math.max(20,n-w);i<n;i++){
    const v=V[i];
    if(!(typeof v==='number'&&isFinite(v)&&v>0)) continue;
    const base=volAvg20(V,i+1);    // bars 0..i-1 only — see the note above
    if(!(base>0)) continue;
    const r=v/base;
    // Strictly greater, so the OLDEST bar wins a tie. A tie means the older
    // one is the move and the newer one is a repeat of it, and the older date
    // is the one that dates the setup.
    if(best==null||r>best){ best=r; bestI=i; }
  }
  if(best==null) return none;
  const rounded=+best.toFixed(2);
  if(rounded<m) return none;
  return {mult:rounded, age:(n-1)-bestI};
}

function thrustDay(C,V,win){
  const w=(win==null?CFG.THRUST.win:win);
  const none={pct:null, age:null, vol:null, fade:null};
  if(!Array.isArray(C)||!Array.isArray(V)) return none;
  const n=C.length;
  if(n<THRUST_MIN_BARS || V.length<n) return none;
  let best=null,bestI=-1;
  // Earliest bar that has a full baseline behind it. Bars before it are
  // SKIPPED rather than priced against a short average, for the same reason
  // volSpike() skips them: a "20-day average" built out of six days is a
  // different statistic wearing the same label.
  for(let i=Math.max(THRUST_MIN_BARS-1, n-w); i<n; i++){
    const c=C[i], p=C[i-1];
    if(!(typeof c==='number'&&isFinite(c))) continue;
    if(!(typeof p==='number'&&isFinite(p)&&p>0)) continue;
    const g=(c-p)/p*100;
    if(best==null||g>best){ best=g; bestI=i; }
  }
  if(best==null) return none;
  let vol=null;
  const tv=V[bestI];
  if(typeof tv==='number'&&isFinite(tv)&&tv>0){
    const base=volAvg20(V,bestI+1);   // bars bestI-20..bestI-1 only — never bestI
    if(base>0) vol=+(tv/base).toFixed(2);
  }
  /* THE FADE — has the crowd left since the thrust?
     ────────────────────────────────────────────────
     Mean volume of every bar AFTER the thrust, over the thrust bar's OWN
     volume. Below 1 means the days since have been quieter than the event
     itself; 0.23 means they have run at under a quarter of it.

     WHY NOT AGAINST THE PRE-THRUST AVERAGE, which is the more obvious choice:
     it answers a different question and it answers it wrongly for this setup.
     Measured across the 219 India names with a 5%+ thrust, the median stock
     was still running at 1.37x its PRE-thrust norm and the owner's own example
     at 9.45x — a stock that has just been discovered does not go back to being
     ignored in six sessions. Judged that way almost nothing reads as dry and
     the example he sent is rejected. Against the thrust bar he sits at 0.227,
     against a median of 0.331, which is what the eye reads off the chart: a
     tall bar, then visibly shorter ones.

     Null when the thrust IS the latest bar — there are no bars since, and a
     mean of nothing is not zero. */
  let fade=null;
  if(bestI<n-1 && typeof tv==='number' && isFinite(tv) && tv>0){
    let sum=0,cnt=0;
    for(let k=bestI+1;k<n;k++){ const v=V[k]; if(typeof v==='number'&&isFinite(v)&&v>=0){ sum+=v; cnt++; } }
    if(cnt) fade=+((sum/cnt)/tv).toFixed(3);
  }
  // Rounded to two decimals so the number a filter tests is the same number a
  // reader would quote off the chart, the way volSpike() rounds its multiple.
  return {pct:+best.toFixed(2), age:(n-1)-bestI, vol, fade};
}

function hi52(A,end){
  const e=(end==null?((A&&A.length)||0):end);
  if(!(e>=H52_MIN_BARS)) return null;
  let m=-Infinity;
  for(let i=e-Math.min(e,H52_WIN);i<e;i++){
    const v=+A[i]; if(Number.isNaN(v)) return NaN;
    if(v>m) m=v;
  }
  return m;
}

function lo52(A,end){
  const e=(end==null?((A&&A.length)||0):end);
  if(!(e>=H52_MIN_BARS)) return null;
  let m=Infinity;
  for(let i=e-Math.min(e,H52_WIN);i<e;i++){
    const v=+A[i]; if(Number.isNaN(v)) return NaN;
    if(v<m) m=v;
  }
  return m;
}

function breakout(closes,volumes){
  const n=closes.length; if(n<55) return{gain:null,count:0,retrace:null};
  const avgV=volAvg20(volumes,n);
  const hiFlag=boPriceFlags(closes);
  let lastBO=-1,cnt=0;
  for(let i=BO_LOOKBACK;i<n-1;i++){
    if(hiFlag[i]&&(volumes[i]||0)>avgV*1.5){cnt++;lastBO=i;}
  }
  if(lastBO<0) return{gain:null,count:cnt,retrace:null};
  const curr=closes[n-1],peak=Math.max(...closes.slice(lastBO));
  return{
    gain:+((curr/closes[lastBO]-1)*100).toFixed(1),
    count:cnt,
    retrace:+((curr/peak-1)*100).toFixed(1),
  };
}

function darvasSeries(H,L,boxp){
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

function darvasState(C,tops,bots,nearPct){
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

function darvasBox(C,H,L,boxp,nearPct){
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

function adrPct(H,L,win){
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

function tightness(C,H,L,adr,win){
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

function coilRatio(H,L,win){
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

function pctFromEma(price,ema){
  if(price==null||!isFinite(price)) return null;
  if(ema==null||!isFinite(ema)||ema<=0) return null;
  return +((price-ema)/ema*100).toFixed(2);
}

function pctFromPivot(price,boxTop){
  if(price==null||!isFinite(price)) return null;
  if(boxTop==null||!isFinite(boxTop)||boxTop<=0) return null;
  return +((price-boxTop)/boxTop*100).toFixed(2);
}

function vcpPivots(H,L,k){
  const K=Math.floor(k==null?VCP_PIVOT_K:k);
  const out={highs:[],lows:[]};
  if(!(K>=1)||!Array.isArray(H)||!Array.isArray(L)) return out;
  const n=Math.min(H.length,L.length);
  const fin=v=>typeof v==='number'&&isFinite(v);
  for(let i=K;i<=n-1-K;i++){
    let hOk=fin(H[i]), lOk=fin(L[i]);
    for(let j=i-K;j<=i+K && (hOk||lOk);j++){
      if(j===i) continue;
      if(!fin(H[j])) hOk=false;
      if(!fin(L[j])) lOk=false;
      if(hOk && (j<i ? !(H[i]>H[j]) : !(H[i]>=H[j]))) hOk=false;
      if(lOk && (j<i ? !(L[i]<L[j]) : !(L[i]<=L[j]))) lOk=false;
    }
    if(hOk) out.highs.push(i);
    if(lOk) out.lows.push(i);
  }
  return out;
}

function vcpContractions(H,L,lidVal,lidIdx,piv,endIdx){
  const legs=[];
  let hIdx=lidIdx, hVal=lidVal;
  while(legs.length<=VCP_MAX_LEGS){
    if(!(typeof hVal==='number'&&isFinite(hVal)&&hVal>0)) break;
    const lo=piv.lows.find(j=>j>hIdx&&j<=endIdx);
    if(lo==null) break;
    const lv=L[lo];
    if(!(typeof lv==='number'&&isFinite(lv))) break;
    legs.push({hi:hIdx, lo, high:hVal, low:lv, depth:+((hVal-lv)/hVal*100).toFixed(2)});
    const nh=piv.highs.find(j=>j>lo&&j<=endIdx);
    if(nh==null) break;
    hIdx=nh; hVal=H[nh];
  }
  return legs;
}

function vcpDetect(C,H,L,V,e50,e200){
  if(!Array.isArray(C)||!Array.isArray(H)||!Array.isArray(L)||!Array.isArray(V)) return null;
  const n=Math.min(C.length,H.length,L.length,V.length);
  if(n<2) return null;
  const fin=v=>typeof v==='number'&&isFinite(v);
  const close=C[n-1];
  if(!fin(close)||close<=0) return null;

  /* TREND FILTER FIRST, because it is the cheapest and the one with the hard
     data requirement. Above the 50 EMA, and the 50 above the 200 — the second
     half NULLS where 200 bars do not exist rather than being skipped. */
  if(!fin(e50)||!(close>e50)) return null;
  if(!fin(e200)) return null;          // <200 bars: unanswerable, so not passed
  if(!(e50>e200)) return null;

  /* THE LID. Highest high of the last VCP_MAX_BASE bars, with the most recent
     VCP_BO_AGE bars excluded so a breakout cannot redefine the level it is
     breaking (see the block comment). Ties go to the EARLIEST bar: the level
     was set the first time it was reached, and the earlier index gives the
     longer, more honest base length. */
  const winStart=Math.max(0,n-VCP_MAX_BASE), lidEnd=n-1-VCP_BO_AGE;
  if(lidEnd<winStart) return null;
  let lidIdx=-1, lid=-Infinity;
  for(let i=winStart;i<=lidEnd;i++){ const h=H[i]; if(fin(h)&&h>lid){ lid=h; lidIdx=i; } }
  if(lidIdx<0||!(lid>0)) return null;

  /* PRIOR UPTREND. The advance INTO the lid over the VCP_RUN_WIN bars before
     it, measured from the lowest low in that window. Needs those bars to
     exist — a base with no measurable run before it is not a rest after a
     move, and this is the leg that keeps downtrending stocks out. */
  if(lidIdx<VCP_RUN_WIN) return null;
  let runLow=Infinity;
  for(let i=lidIdx-VCP_RUN_WIN;i<lidIdx;i++){ const l=L[i]; if(!fin(l)) return null; if(l<runLow) runLow=l; }
  if(!(runLow>0)) return null;
  const priorRun=(lid-runLow)/runLow*100;
  if(!(priorRun>=VCP_PRIOR_RUN)) return null;

  /* CONTRACTIONS. 2 to 4, each STRICTLY shallower than the one before. The
     owner chose the strict form deliberately — there is no tolerance factor
     and there must not be one: a leg that widens is the pattern failing, and
     a 1.02x fudge would let exactly the shape this column exists to reject
     through. */
  const piv=vcpPivots(H,L,VCP_PIVOT_K);
  const legs=vcpContractions(H,L,lid,lidIdx,piv,n-1);
  if(legs.length<VCP_MIN_LEGS||legs.length>VCP_MAX_LEGS) return null;
  /* Local tolerance: absorbs the noise a real base carries between adjacent legs. */
  for(let i=1;i<legs.length;i++) if(!(legs[i].depth<=legs[i-1].depth*VCP_LEG_TOL)) return null;
  /* The cumulative test that stops VCP_LEG_TOL becoming a loophole. Without this
     line a base could widen by 9% on EVERY leg and still pass every comparison. */
  if(!(legs[legs.length-1].depth<=legs[0].depth*VCP_CONTRACT_RATIO)) return null;
  if(!(legs[0].depth<=VCP_MAX_DEPTH)) return null;
  if(!(legs[legs.length-1].depth<=VCP_FINAL_DEPTH)) return null;

  /* VOLUME DRY-UP, both halves. The final contraction has to be quieter than
     the first one by VCP_VOL_DRY, AND the most recent bars have to be under
     the 20-bar average — the second is what stops a base that dried up a month
     ago and has been waking up ever since from reading as dry today. */
  const meanV=(from,to)=>{ let s=0,c=0;
    for(let i=from;i<=to;i++){ const v=V[i]; if(!fin(v)||v<0) return null; s+=v; c++; }
    return c?s/c:null; };
  const vFirst=meanV(legs[0].hi,legs[0].lo);
  const vLast =meanV(legs[legs.length-1].hi,legs[legs.length-1].lo);
  if(vFirst==null||vLast==null||!(vFirst>0)) return null;
  if(!(vLast<=VCP_VOL_DRY*vFirst)) return null;
  const tail=meanV(n-VCP_VOL_TAIL,n-1);
  const base20=volAvg20(V,n);          // the same 20-bar average vRatio prints
  if(tail==null||!(base20>0)||!(tail<base20)) return null;

  /* STATE. 'broke out' needs a close above the lid in the last VCP_BO_AGE bars
     WITH volume behind it, priced against that bar's OWN trailing average —
     volAvg20(V,i+1) reads bars 0..i-1, so no bar is judged against its future.
     'pivot' is the VCP_PIVOT_ZONE band around the lid, taken on BOTH sides: a
     close that has poked above the lid on ordinary volume is at the trigger,
     not through it, and calling that 'broke out' would be the volume test
     saying one thing and the badge saying another. */
  let state='forming';
  const zone=Math.abs(close-lid)/lid*100;
  for(let i=Math.max(0,n-VCP_BO_AGE);i<=n-1;i++){
    const av=volAvg20(V,i+1);
    if(fin(C[i])&&C[i]>lid&&fin(V[i])&&av>0&&V[i]>=VCP_BO_VOL*av){ state='breakout'; break; }
  }
  if(state!=='breakout'&&zone<=VCP_PIVOT_ZONE) state='pivot';

  return{
    state,
    count:legs.length,
    baseBars:n-lidIdx,
    lid,
    lidIdx,
    /* % TO LID divides by the CLOSE, not by the lid — "how much further does
       this have to travel from where it is" — which is deliberately different
       arithmetic from % vs Pivot's divide-by-the-box-top. Two columns measuring
       two different levels must not look like the same number. */
    toLid:+((lid-close)/close*100).toFixed(2),
    priorRun:+priorRun.toFixed(2),
    depths:legs.map(l=>l.depth),
    legs,
  };
}

function momentumBase(C,H,L,V,dates,ema20Series,cfg){
  const nul={momoState:null,momoPct:null,momoBars:null,momoVolRatio:null,
             momoAbovePct:null,momoBaseBars:null,momoBaseHigh:null,
             momoBaseLow:null,momoBaseDepth:null};
  if(!Array.isArray(C)||!Array.isArray(H)||!Array.isArray(L)||!Array.isArray(V)) return nul;
  if(!Array.isArray(ema20Series)) return nul;
  const n=Math.min(C.length,H.length,L.length,V.length,ema20Series.length);
  const fin=v=>typeof v==='number'&&isFinite(v);
  const c=cfg||{};
  const lookback   = +c.lookback,    minMovePct  = +c.minMovePct;
  const minVolRatio= +c.minVolRatio, minAbovePct = +c.minAbovePct;
  const minBaseBars= +c.minBaseBars, maxBaseDepth= +c.maxBaseDepth;
  if(!fin(lookback)||lookback<2) return nul;
  /* The window must be able to hold a thrust AND the shortest base that counts,
     otherwise the two would have to overlap and the peak would be inside the
     base it is supposed to have started. Not a data-quality guard — an
     arithmetic one, and it is why a 20-bar listing gets nulls rather than a
     verdict built on nine bars. */
  if(n < lookback+1 || n < minBaseBars+2) return nul;

  const last=n-1;
  const close=C[last];
  if(!fin(close)||close<=0) return nul;

  /* ─ 1. THE THRUST ─ the largest rise from a LOW at bar i to a HIGH at a
     later bar j, over the last `lookback` bars. Low series for the start, high
     series for the end, because the move a chart shows is measured wick to
     wick — using closes would understate every one of the owner's three
     examples by several percent and would then need a lower threshold to find
     the same stocks, which is the same screen with the arithmetic hidden.

     j > i STRICTLY: a single bar's own low-to-high is an intraday range, not a
     thrust, and allowing i===j would let one wide gap-up day satisfy a 40%
     move. The running minimum is therefore seeded from bar `from` and only
     advanced AFTER bar j has been scored, so the low it carries is always from
     a bar strictly earlier than the high it is compared against.

     TIES GO TO THE EARLIEST j, because `>` is strict here — the first bar that
     reached the best gain is the one that made it, and a later bar matching it
     is the base topping out at the same level, which belongs to the base rather
     than to the thrust. Taking the later one would shorten every base by the
     width of its own double top. */
  const from=Math.max(0,n-lookback);
  /* THE PEAK SEARCH STOPS SHORT OF THE LAST BAR, BY EXACTLY THE SHORTEST BASE.
     ─────────────────────────────────────────────────────────────────────────
     Without this the 'breakout' state is unreachable, and not rarely — never,
     for any threshold. The reason is that the running minimum is non-increasing,
     so a bar making a strictly higher high always scores a strictly higher gain
     and STEALS the peak. On the very day price clears its base, movePeak moves
     onto that day, baseBars collapses to 0, and step 5 rejects the row before
     step 6 ever gets to call it a breakout. Measured before this line existed:
     of the India tickers whose latest bar made a new high over its base, the
     peak re-anchored onto that bar in 100% of cases and 'breakout' fired zero
     times.

     The bound is DERIVED, not a tuning constant: step 5 already demands
     baseBars = last - movePeak >= minBaseBars, so a peak inside that final
     window could never have produced a valid row anyway. All this does is stop
     such a peak from destroying the earlier, legitimate one. It is the same
     precaution vcpDetect() and ipoBase() take when they hold their lid scans
     back so that a breakout bar cannot redefine the level it is breaking. */
  const peakLast=last-minBaseBars;
  if(peakLast<=from) return nul;
  let minLow=null, minLowIdx=-1;
  let bestPct=-Infinity, moveStart=-1, movePeak=-1;
  for(let j=from;j<=peakLast;j++){
    if(minLow!=null&&minLow>0){
      const h=H[j];
      if(fin(h)){
        const g=(h-minLow)/minLow*100;
        if(g>bestPct){ bestPct=g; moveStart=minLowIdx; movePeak=j; }
      }
    }
    const l=L[j];
    if(fin(l)&&l>0&&(minLow==null||l<minLow)){ minLow=l; minLowIdx=j; }
  }
  if(moveStart<0||movePeak<=moveStart) return nul;
  if(!fin(bestPct)||!(bestPct>=minMovePct)) return nul;
  const moveBars=movePeak-moveStart;

  /* ─ 2. VOLUME ─ up-volume against down-volume across the thrust itself,
     bars moveStart+1 .. movePeak. It starts one bar AFTER the low because
     "up day" is defined by comparison with the previous close, and moveStart's
     own predecessor is outside the move — a bar from before the thrust began
     has no business voting on whether the thrust was accumulated.

     A FLAT DAY (C[k]===C[k-1]) COUNTS FOR NEITHER SIDE, deliberately. It is not
     evidence in either direction, and folding it into the up bucket — the usual
     shortcut — would let a stock that ground sideways on heavy volume read as
     accumulated.

     THE INFINITY TRAP, and it is a real one rather than a theoretical tidiness.
     A thrust with no down days at all divides by zero and yields Infinity, which
     JSON.stringify writes as `null` — so the row would compute correctly, pass
     the test, and then come back from the same-day cache with the column blank
     and no error anywhere to say why. Capped at MOMO_VOL_RATIO_CAP instead: a
     large finite number that survives the round trip, still sorts above every
     real reading, and still means "every share that moved, moved on an up day". */
  let upVol=0, downVol=0;
  for(let k=moveStart+1;k<=movePeak;k++){
    const v=V[k], a=C[k], b=C[k-1];
    if(!fin(v)||v<0||!fin(a)||!fin(b)) return nul;
    if(a>b) upVol+=v; else if(a<b) downVol+=v;
  }
  let volRatio;
  if(downVol>0) volRatio=upVol/downVol;
  else if(upVol>0) volRatio=MOMO_VOL_RATIO_CAP;
  else return nul;                     // no volume either way: unmeasurable, not a pass
  if(volRatio>MOMO_VOL_RATIO_CAP) volRatio=MOMO_VOL_RATIO_CAP;
  if(!(volRatio>=minVolRatio)) return nul;

  /* ─ 3. TREND QUALITY ─ the share of bars from the thrust's start to today
     that closed above the 20 EMA. This is the leg that separates "went up and
     has stayed up" from "went up and has since bled back through the line",
     and it spans the base as well as the thrust on purpose: a base that has
     lost the 20 EMA for a third of its bars is not resting above it.

     BARS WITH A NULL EMA ARE SKIPPED, NOT FAILED — see the header. The
     denominator is the number of bars we could actually judge, so a young
     listing whose EMA seeds part-way through the window is scored on the part
     that exists rather than being marked down for the part that cannot be. If
     that leaves nothing judgeable at all we return nulls rather than dividing
     by zero into a NaN that every later comparison would read as false. */
  let above=0, judged=0;
  for(let k=moveStart;k<=last;k++){
    const e=ema20Series[k], a=C[k];
    if(!fin(e)||e<=0||!fin(a)) continue;
    judged++;
    if(a>e) above++;
  }
  if(judged<1) return nul;
  const abovePct=above/judged*100;
  if(!(abovePct>=minAbovePct)) return nul;

  /* ─ 4. RIGHT NOW ─ the latest close above the latest 20 EMA. A SEPARATE,
     EXPLICIT REQUIREMENT the owner asked for, and it is NOT implied by the 80%
     above: a stock can hold the line for forty bars and lose it in the last
     four and still score 90%, which is the one case this screen must never
     return. The share-above test is about the move's character; this is about
     today, and the two are asking different questions of the same line. */
  const e20last=ema20Series[last];
  if(!fin(e20last)||e20last<=0) return nul;
  if(!(close>e20last)) return nul;

  /* ─ 5. THE BASE ─ everything from the peak bar to the last bar. baseBars is
     the count of bars SINCE the peak, so a peak printed yesterday reads 1 and
     the peak bar itself is not counted as a bar of rest — it is the last bar of
     the thrust. The high and low span movePeak..last INCLUSIVE, because the
     peak's own high is the ceiling the base hangs under and excluding it would
     measure the depth off a lower level and understate every retracement.

     DEPTH IS OFF THE BASE HIGH, not off the close and not off the thrust's
     start: "how much of its range has this given back" is a statement about the
     box, and it is the same divide-by-the-ceiling arithmetic ipoBase() and the
     Darvas depth already use. One unreadable bar inside the base nulls the
     whole verdict rather than being skipped, for the reason ipoBase() gives: a
     base measured over the bars that happened to parse is not the base. */
  const baseBars=last-movePeak;
  if(!(baseBars>=minBaseBars)) return nul;
  let baseHigh=-Infinity, baseLow=Infinity;
  for(let k=movePeak;k<=last;k++){
    const h=H[k], l=L[k];
    if(!fin(h)||!fin(l)) return nul;
    if(h>baseHigh) baseHigh=h;
    if(l<baseLow)  baseLow=l;
  }
  if(!(baseHigh>0)||!(baseLow>0)||baseLow>baseHigh) return nul;
  const baseDepth=(baseHigh-baseLow)/baseHigh*100;
  if(!(baseDepth<=maxBaseDepth)) return nul;

  /* ─ 6. STATE ─ 'breakout' when today's close is above the base high measured
     WITHOUT today's bar in it. That exclusion is the no-lookahead argument
     restated: with the latest bar included, baseHigh is at least as high as
     today's high, so `close > baseHigh` could only ever be true on a bar that
     closed above its own high — impossible — and the state would read 'base'
     forever. Measuring the level over movePeak..last-1 instead asks the
     question the chart asks: is the stock closing through the ceiling that was
     already there when it opened.

     ⚠️ AS THIS FUNCTION IS CURRENTLY SPECIFIED, 'breakout' CANNOT FIRE. Read
     this before "fixing" anything here, because the branch below is correct and
     the cause sits in step 1.

     THE PROOF. priorHigh is the highest high over movePeak..last-1, so it
     includes H[movePeak] itself. Two cases, and neither reaches 'breakout':
       · H[last] <= priorHigh. Then close <= H[last] <= priorHigh, so
         `close > priorHigh` is false by arithmetic.
       · H[last] >  priorHigh >= H[movePeak]. Then step 1 re-anchors the peak
         ONTO the last bar and we never arrive here. The running minimum is
         non-increasing, so the low carried into bar `last` is at or below the
         one carried into movePeak; (H-m)/m rises as H rises and as m falls, so
         a strictly higher high at `last` scores a strictly higher gain,
         movePeak becomes last, baseBars becomes 0, and step 5 rejects the row
         against minBaseBars long before the state is decided.
     No choice of the six CFG.MOMO numbers changes either case — the argument is
     about the shape of the search, not about the thresholds. Verified against
     the live India universe as well as argued: across 1,047 tickers with enough
     history there were 102 days on which the last bar made a new high over its
     base, the peak re-anchored onto the last bar on all 102, and the breakout
     condition was true zero times even with every other gate ignored.

     WHAT WOULD MAKE IT REACHABLE, for whoever decides to: the peak search in
     step 1 has to stop being allowed to land on the bars it is about to be
     judged against — the same device vcpDetect() and ipoBase() already use when
     they hold their lid scan back by VCP_BO_AGE bars so a breakout cannot
     redefine the level it is breaking. Ending step 1's `j` loop a few bars
     early does it. That is a deliberate change to the owner's stated algorithm,
     not a bug fix, so it is NOT made here.

     The branch is therefore left exactly as specified and exactly as written:
     honest, cheap, and already correct for the day the search is changed. Every
     'breakout' path downstream — the badge, the sort rank, the filter option,
     the export text — is built and works; none of them is waiting on an edit.

     A base one bar long has no prior high to break, so the loop below finds
     nothing and the state stays 'base'. minBaseBars is 8, so that cannot happen
     with the shipped config, but this must not depend on the config to be
     correct — four of those numbers are user-editable from the modal. */
  let priorHigh=-Infinity;
  for(let k=movePeak;k<=last-1;k++){ const h=H[k]; if(fin(h)&&h>priorHigh) priorHigh=h; }
  const state=(priorHigh>0&&close>priorHigh) ? 'breakout' : 'base';

  return{
    momoState:state,
    momoPct:+bestPct.toFixed(2),
    momoBars:moveBars,
    momoVolRatio:+volRatio.toFixed(2),
    momoAbovePct:+abovePct.toFixed(1),
    momoBaseBars:baseBars,
    momoBaseHigh:+baseHigh.toFixed(2),
    momoBaseLow:+baseLow.toFixed(2),
    momoBaseDepth:+baseDepth.toFixed(2),
  };
}

function ipoBase(C,H,L,V,dates,feedStart){
  if(!Array.isArray(C)||!Array.isArray(H)||!Array.isArray(L)||!Array.isArray(V)||!Array.isArray(dates)) return null;
  const n=Math.min(C.length,H.length,L.length,V.length,dates.length);
  const fin=v=>typeof v==='number'&&isFinite(v);

  /* AGE GATE FIRST — it is the cheapest leg and the one that decides whether
     this column has any business answering at all. */
  if(n<IPO_MIN_BARS||n>=IPO_MAX_BARS) return null;
  const first=dates[0];
  if(typeof first!=='string'||!first) return null;
  if(typeof feedStart!=='string'||!feedStart) return null;   // unknown feed start: unanswerable, so null
  if(!(first>feedStart)) return null;                        // starts with everyone else: not young

  const close=C[n-1];
  if(!fin(close)||close<=0) return null;

  /* THE LID: the highest high since the ticker's FIRST bar — index 0, not a
     fixed lookback — with the most recent VCP_BO_AGE bars excluded. Ties go to
     the EARLIEST bar, as in vcpDetect(): the level was set the first time it
     was reached, and the earlier index gives the longer, honester base. */
  const lidEnd=n-1-VCP_BO_AGE;
  if(lidEnd<0) return null;
  let lidIdx=-1, lid=-Infinity;
  for(let i=0;i<=lidEnd;i++){ const h=H[i]; if(fin(h)&&h>lid){ lid=h; lidIdx=i; } }
  if(lidIdx<0||!(lid>0)) return null;

  /* THE BASE is everything from the lid bar to the last bar. Too short and it
     is a pause; too long and the "first base" story has stopped being true. */
  const baseBars=n-lidIdx;
  if(baseBars<IPO_MIN_BASE||baseBars>IPO_MAX_BASE) return null;

  /* DEPTH off the lid. A single unreadable bar inside the base nulls the whole
     verdict rather than being skipped — a base measured over the bars that
     happened to parse is not the base. */
  let low=Infinity;
  for(let i=lidIdx;i<=n-1;i++){ const l=L[i]; if(!fin(l)) return null; if(l<low) low=l; }
  if(!(low>0)) return null;
  const depth=(lid-low)/lid*100;
  if(!(depth<=IPO_MAX_DEPTH)) return null;

  /* STATE, on vcpDetect()'s exact rules and its exact constants.
     volAvg20(V,i+1) reads bars 0..i-1, so no bar is ever judged against its
     own future or against bars that had not happened yet. */
  let state='forming';
  for(let i=Math.max(0,n-VCP_BO_AGE);i<=n-1;i++){
    const av=volAvg20(V,i+1);
    if(fin(C[i])&&C[i]>lid&&fin(V[i])&&av>0&&V[i]>=VCP_BO_VOL*av){ state='breakout'; break; }
  }
  if(state!=='breakout'&&Math.abs(close-lid)/lid*100<=VCP_PIVOT_ZONE) state='pivot';

  return{
    state,
    lid,
    lidIdx,
    baseBars,
    bars:n,                       // how many bars this ticker has EVER had here
    depth:+depth.toFixed(2),
    // Divides by the CLOSE, like % to Lid — "how far does it still have to go".
    toLid:+((lid-close)/close*100).toFixed(2),
  };
}

function smartMoneyZones(C,H,L,cfg){
  const nul={smzBias:null,smzState:null,smzDist:null,smz618:null,smz786:null,
             smz826:null,smzSwingHi:null,smzSwingLo:null,smzBosAge:null};
  if(!Array.isArray(C)||!Array.isArray(H)||!Array.isArray(L)) return nul;
  const n=C.length;
  if(n<SMZ_MIN_BARS||H.length!==n||L.length!==n) return nul;
  const px=C[n-1];
  if(typeof px!=='number'||!isFinite(px)||px<=0) return nul;

  const st=smzStructure(C,H,L,cfg||{});
  const r2=v=>(v==null||!isFinite(v))?null:+v.toFixed(2);
  /* The swing levels are published RAW — not gated on the active flags — for
     the reason the Pine gives: a level that has been traded through is still a
     valid target or stop price, and blanking it would hide the only two
     numbers on this row a trader actually places an order against. They can
     therefore be non-null while bias is 0. */
  /* THE AGE OF THE BREAK OF STRUCTURE, in whole bars back from the LAST bar in
     the series. 0 therefore means the flip happened on the latest bar — the
     swing was taken out today — and 3 means three sessions ago. Bars, not
     calendar days: the series is trading days, so a Monday break reads as 1 on
     Tuesday whatever the weekend did.

     Computed here rather than inside smzStructure() because the state machine
     returns a bar INDEX and only this function knows the index of the end of
     the series it handed in. n is C.length and the guard above has already
     established H and L are the same length, so n-1 is genuinely the last bar
     for all three.

     null when the machine never flipped, which is exactly the bias===0
     population — no close ever broke a swing level, so there is no break to
     date — plus the too-short population, which returned before we got here.
     null is NOT 0 and the two must never be conflated: 0 is the loudest reading
     this field has. Anything comparing it numerically needs `!= null &&` first,
     because `null <= 10` is true and would quietly admit every stock that has
     never broken structure in its life.

     NO DIRECTION FIELD, and none should be added later. Only a flip writes
     bias, so the direction of the most recent flip is smzBias itself. On a bull
     row this age dates the bar the swing HIGH was taken out; on a bear row, the
     swing LOW. A smzBosDir would be a second copy of smzBias that can only
     agree with it. */
  const out={...nul, smzBias:st.bias, smzSwingHi:r2(st.swingHigh), smzSwingLo:r2(st.swingLow),
             smzBosAge: st.lastFlipBar==null ? null : (n-1-st.lastFlipBar)};

  // The anchor: only an ACTIVE swing on the structure-aligned side anchors a
  // zone, and bias 0 anchors nothing at all.
  let anchor=null, extreme=null;
  if(st.bias>0 && st.slActive && st.swingLow!=null && st.hiSinceSwingLo!=null){
    anchor=st.swingLow; extreme=st.hiSinceSwingLo;
  } else if(st.bias<0 && st.shActive && st.swingHigh!=null && st.loSinceSwingHi!=null){
    anchor=st.swingHigh; extreme=st.loSinceSwingHi;
  }
  if(anchor==null||extreme==null||!isFinite(anchor)||!isFinite(extreme)) return out;

  // A zero or inverted range is not a shallow zone, it is no zone: the swing
  // and the extreme are the same price, so all three levels would collapse
  // onto it and every close would read as 'smz'.
  const range=st.bias>0 ? (extreme-anchor) : (anchor-extreme);
  if(!(range>0)) return out;

  const f618=r2(st.bias>0 ? extreme-range*0.618 : extreme+range*0.618);
  const f786=r2(st.bias>0 ? extreme-range*0.786 : extreme+range*0.786);
  const f826=r2(st.bias>0 ? extreme-range*0.826 : extreme+range*0.826);
  if(f618==null||f786==null||f826==null) return out;

  out.smz618=f618; out.smz786=f786; out.smz826=f826;
  out.smzState=smzClassify(st.bias,px,f618,f786,f826);
  /* DISTANCE TO THE 0.618 EDGE, as a percent of the close — the Pine's
     ms_dist_pct. Signed so it reads the same way in both biases: POSITIVE is
     "price still has this far to travel before it even touches the zone",
     negative is "already inside it, or through it". */
  out.smzDist=+((st.bias>0 ? (px-f618)/px*100 : (f618-px)/px*100).toFixed(2));
  return out;
}

function earlyVolumeTransition(C,V,thrust){
  const n=Math.min(Array.isArray(C)?C.length:0,Array.isArray(V)?V.length:0);
  const none={recent5Prior15:null,upDown10:null,postThrustPre:null,postThrustFade:null};
  if(n<21) return none;
  const fin=v=>typeof v==='number'&&isFinite(v)&&v>=0;
  // Exclude today's bar from both windows so the signal cannot grade itself.
  let r5=0,r5n=0,p15=0,p15n=0;
  for(let i=Math.max(0,n-6);i<n-1;i++){const v=V[i];if(fin(v)){r5+=v;r5n++;}}
  for(let i=Math.max(0,n-21);i<n-6;i++){const v=V[i];if(fin(v)){p15+=v;p15n++;}}
  if(r5n===5&&p15n===15&&p15>0) none.recent5Prior15=+(r5/5/(p15/15)).toFixed(2);

  let up=0,down=0;
  for(let i=Math.max(1,n-11);i<n-1;i++){
    const v=V[i], c=C[i], p=C[i-1];
    if(!fin(v)||!isFinite(c)||!isFinite(p)) continue;
    if(c>p) up+=v; else if(c<p) down+=v;
  }
  if(up>0||down>0) none.upDown10=+(down>0?up/down:9.99).toFixed(2);

  const age=thrust&&thrust.age!=null?thrust.age:null;
  const idx=age==null?null:n-1-age;
  if(idx!=null&&idx>=20&&idx<n-1){
    let pre=0,prec=0,post=0,postc=0;
    for(let i=idx-20;i<idx;i++){const v=V[i];if(fin(v)){pre+=v;prec++;}}
    // Use the first 10 post-thrust bars or the available tail, never the thrust bar.
    for(let i=idx+1;i<Math.min(n,idx+11);i++){const v=V[i];if(fin(v)){post+=v;postc++;}}
    if(prec===20&&postc>=3&&pre>0) none.postThrustPre=+(post/postc/(pre/prec)).toFixed(2);
  }
  if(thrust&&thrust.fade!=null) none.postThrustFade=thrust.fade;
  return none;
}

function computeTech(C,H,L,V,dates,sym,O,feedStart){
  // A 2-row stock (e.g. IPO'd a few days ago)
  // is real data, not a failure. Every derived indicator below (RSI, EMA,
  // Stage2, breakout, RS returns, etc.) already null-guards its own minimum
  // history requirement, so this just needs enough for a basic price+change.
  const n=C.length; if(n<2) return null;
  const price=C[n-1], prev=C[n-2]||C[n-1];
  const ch1d=+((price-prev)/prev*100).toFixed(2);
  /* Multi-day changes over TRADING bars, not calendar days: 5/21/63 bars are
     the conventional week/month/quarter. Each needs N+1 bars (6/22/64) and
     barChange() returns null below that — never 0. */
  const ch1w=barChange(C,5), ch1m=barChange(C,21), ch3m=barChange(C,63);

  const e10=ema(C,10), e20=ema(C,20);
  const e50=n>=50?ema(C,50):null;
  const e100=n>=100?ema(C,100):null;
  const e150=n>=150?ema(C,150):null;
  const e200=n>=200?ema(C,200):null;

  // Simple moving averages. Stage 2 is defined on SMA, not EMA — see stage2().
  const sma50=n>=50?sma(C,50):null;
  const sma150=n>=150?sma(C,150):null;
  const sma200=n>=200?sma(C,200):null;

  /* 200-EMA slope over the last month. Needs 220 bars, NOT 200: the comparison
     point is a 200-EMA computed on the series with the last 20 bars removed.
     At 219 bars ema(C.slice(0,-20),200) has 199 values and returns null, so
     this correctly reports null rather than quietly comparing against a
     shorter-period EMA. 220 of a ~250-bar ceiling — it fits, but only just. */
  const ema200_20ago = n>=220 ? ema(C.slice(0,-20),200) : null;
  const slope200 = (e200!=null && ema200_20ago) ? +((e200/ema200_20ago-1)*100).toFixed(2) : null;
  const slopeDir = slope200==null ? null : (Math.abs(slope200)<0.1 ? 'flat' : slope200>0 ? 'up' : 'down');

  /* EMA crossover state and age. xBars counts bars SINCE the flip bar, so a
     cross that happened on the latest bar reads 0. It is null when no flip
     exists anywhere in the comparable window — "never crossed in 250 bars" and
     "crossed 250 bars ago" are different facts and 250 would imply the latter. */
  // xFast/xSlow are the PERIODS in force (10/20 by default), not the EMA
  // values — they exist so the UI can label the column with the actual pair
  // instead of a hardcoded "10/20" that goes stale when CFG.XOVER changes.
  const XF=CFG.XOVER.fast, XS=CFG.XOVER.slow, XMAX=Math.max(XF,XS);
  const xFastEma=n>=XF?ema(C,XF):null;
  const xSlowEma=n>=XS?ema(C,XS):null;
  const xState=(xFastEma!=null&&xSlowEma!=null)?(xFastEma>xSlowEma?'bull':'bear'):null;
  let xBars=null;
  let ema1020CrossUp=false;
  if(n>=XMAX+2){
    const fs=emaSeries(C,XF), ss=emaSeries(C,XS);
    if(XF===10 && XS===20 && fs[n-2]!=null && ss[n-2]!=null && fs[n-1]!=null && ss[n-1]!=null){
      ema1020CrossUp = C[n-2] <= fs[n-2] && C[n-2] <= ss[n-2] &&
                       C[n-1] > fs[n-1] && C[n-1] > ss[n-1];
    }
    const st=[];
    for(let i=XMAX-1;i<n;i++) st.push(fs[i]>ss[i]);
    for(let i=st.length-1;i>0;i--){
      if(st[i]!==st[i-1]){ xBars=(st.length-1)-i; break; }
    }
  }
  /* If the user changes the configurable EMA pair, the 10/20 saved screen still
     keeps its own meaning. Compute the fixed pair only in that uncommon case;
     with the normal 10/20 configuration this reuses the series above and adds
     no extra EMA pass to the normal load. */
  if(!(XF===10 && XS===20) && n>=22){
    const fs1020=emaSeries(C,10), ss1020=emaSeries(C,20);
    ema1020CrossUp = C[n-2] <= fs1020[n-2] && C[n-2] <= ss1020[n-2] &&
                     C[n-1] > fs1020[n-1] && C[n-1] > ss1020[n-1];
  }

  /* Bars since the close last crossed ABOVE the 50 EMA — the first of the three
     Fresh flags. null when the close is NOT currently above the 50 EMA, when
     no flip is visible in the comparable window, or when there is not enough
     history for a 50 EMA at all: "it has been above the whole time" and
     "it crossed today" are opposite facts and must not share a value.
     Needs 51 bars (50 to seed the EMA + 1 prior bar to have a flip against);
     computed from emaSeries so the comparison uses the EMA AS IT WAS on each
     past bar, not today's EMA projected backwards. */
  let e50CrossUpAge=null;
  if(n>=51 && e50!=null){
    const es=emaSeries(C,50);
    const st=[];
    for(let i=49;i<n;i++) st.push(C[i]>es[i]);
    if(st[st.length-1]){
      for(let i=st.length-1;i>0;i--){
        if(st[i]!==st[i-1]){ e50CrossUpAge=(st.length-1)-i; break; }
      }
    }
  }

  let eu=0,ec=0;
  [[e10,e20],[e20,e50],[e50,e150],[e150,e200],[price,e20]].forEach(([a,b])=>{
    if(a&&b){ec++;if(a>b)eu++;}
  });
  const emaScr=ec?+(eu/ec).toFixed(2):0;

  const rsi14=rsi(C,14);
  /* "RSI above its own moving average" — momentum measured against momentum's
     own recent trend rather than against a fixed 50/70 line. THREE-VALUED on
     purpose. A stock with only 30 bars has an RSI but no settled EMA of it, and
     answering `false` there would put "we could not tell" and "no, RSI is below
     its average" into the same bucket — the filter would then read as a real
     rejection for every young listing. null keeps the two apart, and the filter
     that consumes this tests === true so null is excluded rather than passed.
     DAILY ONLY: there is deliberately no weekly twin. wRsi already exists for
     the weekly read, and a second smoothing on ~52 weekly bars would be seeded
     from almost the whole series. */
  let rsiAboveMa=null;
  if(n>=RSI_MA_MIN_CLOSES){
    const rs=rsiSeries(C,14).filter(v=>v!=null);
    // The tail is contiguous — rsiSeries() only ever nulls the LEADING warm-up
    // bars — so filtering the nulls out cannot leave a hole in the middle.
    if(rs.length>=RSI_MA_MIN_RSI_VALUES){
      const rMa=ema(rs,RSI_MA_PERIOD);       // the file's one EMA helper, reused
      const last=rs[rs.length-1];
      if(rMa!=null && isFinite(rMa) && isFinite(last)) rsiAboveMa = last > rMa;
    }
  }
  const wk=weeklyResample(C,H,L,V,dates,O);
  const wRsi=wk.closes.length>=15?rsi(wk.closes,14):null;

  const todV=V[n-1]||0;
  // volAvg20() — the same 20-bar average breakout() weighs volume against, and
  // the same one the dial history asks for at every past bar.
  const avgV=volAvg20(V,n);
  const vRatio=avgV>0?+(todV/avgV).toFixed(2):null;
  const ema1020VolCross = ema1020CrossUp && vRatio!=null && vRatio>=1.5;
  /* vRatio IS the RVol the brief describes — today's volume over the 20-bar
     average EXCLUDING today. It is not duplicated as a second column. */
  /* Vol Spike. The SAME volAvg20() baseline, asked at every bar of the last
     VOL_SPIKE_WIN sessions instead of only at the latest one — which is the
     one thing vRatio above cannot be made to say. Computed here, not at render
     time, because the raw volume series is gone on a cached load and the row
     is then the only surviving record of it. */
  const vSpike=volSpike(V);
  /* The thrust day. Computed here beside vSpike for the same reason vSpike is
     computed here at all: it needs the raw close AND volume series, both of
     which are gone on a cached load, so the row is the only surviving record
     of the answer. It reads CFG.THRUST.win rather than taking a window from a
     caller, exactly as volSpike() falls back to VOL_SPIKE_WIN. */
  const thrust=thrustDay(C,V);
  const earlyVol=earlyVolumeTransition(C,V,thrust);
  const avgValue=avgTradedValue(C,V,AVG_VAL_BARS);

  /* 52-week high/low.
     `Math.min(n,252)` means this silently degrades to "highest high in whatever
     history exists" — so a stock that IPO'd 20 days ago was reporting a 20-day
     high in a column labelled 52W, and "Near 52W High" would flag it as a
     breakout candidate on 4 weeks of data. That's not a shorter window, it's a
     wrong number. Verified in the harness: a 20-bar series returned h52=115.46.
     Floor it at 120 bars (~6 months) — below that the figure is too far from
     "52 week" to print, so it nulls out and the cell shows an honest dash.
     NOTE even at the full window this is ~250 bars, not 252, because the sheet
     holds ~1 trading year. It is a ~50-week high. The <th> tooltip says so.
     The floor and the window now live in hi52()/lo52() so the Near 52W High
     history asks for the extreme AS IT WAS on each past bar through the very
     same code — including the floor, which is what makes that metric's short
     depth a fact about the rule rather than about the chart. */
  const h52 = hi52(H,n);
  const l52 = lo52(L,n);
  const h52d = h52 ? +((price/h52-1)*100).toFixed(1) : null;

  /* The LEVELS are kept, not just the zone label. pivZone() answers "which band
     is price in", which is all the column needs, but the "Near R1" screen asks
     "how far is price from R1" — a question the band label cannot answer at all.
     Deriving it a second time in the filter would mean two implementations of
     the pivot formula; keeping the levels on the row means one. */
  let dpz='—',wpz='—',dPiv=null,wPiv=null;
  if(n>=2){ dPiv=pivots(H[n-2],L[n-2],C[n-2]); dpz=pivZone(price,dPiv); }
  const wn=wk.closes.length;
  if(wn>=2){ wPiv=pivots(wk.highs[wn-2],wk.lows[wn-2],wk.closes[wn-2]); wpz=pivZone(price,wPiv); }

  // Weekly volume ratio: latest completed week's volume vs avg of trailing 10 weeks
  let wVolRatio=null;
  if(wn>=11){
    const latestWV=wk.volumes[wn-1];
    const wVArr=wk.volumes.slice(-11,-1).filter(v=>v>0);
    const wAvgV=wVArr.length?wVArr.reduce((a,b)=>a+b,0)/wVArr.length:0;
    wVolRatio=wAvgV>0?+(latestWV/wAvgV).toFixed(2):null;
  }

  // Weekly EMA alignment: same blended-score approach as daily, but computed
  // on weekly-resampled closes. A 50-week EMA sits right at the edge of what
  // ~1 year of data can reliably support (50 weeks needed vs ~52-60 available,
  // and often less for stocks with gaps/holidays) — so this uses only
  // 10 and 20-week EMAs, both comfortably achievable even with a thin history.
  const we10=ema(wk.closes,10), we20=ema(wk.closes,20);
  // Same crossover rule as daily, on the weekly series. we20 needs 20 weekly
  // bars ≈ 100 trading days, so this is null for anything younger.
  const wxState=(we10!=null&&we20!=null)?(we10>we20?'bull':'bear'):null;

  /* Weeks since the weekly EMA 10/20 relationship last flipped.
     The daily crossover column already shows its age in bars; the weekly one
     showed only Bull/Bear, so a cross from ten months ago looked identical to
     one from last week — which is the opposite of useful for swing entries.
     Counted in WEEKLY bars, so the unit matches the timeframe the column is
     named after. null when there is no flip inside the available history
     (~50 weekly bars from ~250 daily), which is honest rather than reporting
     the length of the window as though it were the age of a cross. */
  let wxBars=null;
  if(wxState!=null && wk.closes.length>=21){
    const upNow = wxState==='bull';
    for(let k=1; k<=wk.closes.length-21; k++){
      const c=wk.closes.slice(0, wk.closes.length-k);
      const a=ema(c,10), b2=ema(c,20);
      if(a==null||b2==null) break;
      if((a>b2)!==upNow){ wxBars=k; break; }
    }
  }

  /* Is the pair chosen in Advanced Filters even evaluable on the weekly chart?
     The weekly series is ~50 bars (one year of daily resampled), so a weekly
     EMA 50/100/200 cannot exist — a weekly EMA 200 needs ~200 weeks, i.e. four
     years. The weekly crossover is therefore always 10x20, and when the user
     picks a slower pair the honest answer is "not applicable at this timeframe"
     rather than silently showing an unrelated 10x20 result under their heading. */
  const wxApplicable = (CFG.XOVER.fast<=20 && CFG.XOVER.slow<=20);
  let weu=0,wec=0;
  [[we10,we20],[price,we10],[price,we20]].forEach(([a,b])=>{
    if(a&&b){wec++;if(a>b)weu++;}
  });
  const weEmaScr=wec?+(weu/wec).toFixed(2):null;

  const s2=stage2(price,C,h52,l52,we20,sma50,sma150,sma200);
  /* The price-only half of the Setup Age. Computed HERE and not at render
     time because the raw OHLCV is gone on a cached load — this row is then the
     only surviving record of the ticker — and a badge that drops its age on
     every day but the one you first downloaded the sheet is worse than no
     badge. One integer per ticker; see the note on setupBaseAge(). */
  const setupBaseA=setupBaseAge(C,H,L,V,dates,O,wk);
  const sq=squeeze(C.slice(-20),H.slice(-20),L.slice(-20));
  const bo=breakout(C,V);

  /* Darvas boxes, daily and weekly. The weekly one is computed from the
     RESAMPLED series (wk.*), never from the daily bars with a longer boxp —
     those are different statistics: a weekly box's "new high" must beat the
     highest WEEKLY high, which is a max-of-maxes, not a max over 5*boxp days. */
  const dBox=darvasBox(C,H,L,CFG.DARVAS.boxp,CFG.DARVAS.nearPct);
  const wBox=darvasBox(wk.closes,wk.highs,wk.lows,CFG.DARVAS.boxp,CFG.DARVAS.nearPct);
  /* ADR% off the raw daily H/L. Independent of every other column here: it is
     a volatility MEASURE, and deliberately not an input to any of them. */
  const adr=adrPct(H,L,ADR_WIN);

  /* %20E / %50E / %200E — the close's distance from three of the EMAs that
     were computed ONCE at the top of this function. They are READ here, never
     recomputed: a second ema(C,20) call would be a second source of truth for
     the same line the EMA Align badges, the Stage 2 rules and isQualitySetup()
     all read, and the two copies would eventually disagree with nothing on the
     page able to say which was right. e100 is deliberately not given a column —
     it is not a stop level and not part of the pullback zone for this owner.
     e10 GAINED a column (%10E) with gs14: it is not a stop level either, but it
     is the tighter half of the 10/20 pullback zone the owner reads as a pair,
     which is a different question from "where does the stop go". It is READ
     here on the same terms as the other three — never recomputed. */
  /* Days Up and Tight. Both are "what have the last few bars done", which is
     why they are computed here rather than at render time: the raw OHLCV is
     gone on a cached load and the row is then the only surviving record.
     tightness() is handed `adr` — the value computed three lines above and
     rendered in the ADR% column — so the denominator is read, never remade. */
  const daysUp=upDayStreak(C);
  const tight=tightness(C,H,L,adr,TIGHT_WIN);
  /* Coil is the same kind of statement as Tight — "what have the recent bars
     done" — and is computed here for the same reason: the raw OHLCV is gone on
     a cached load and the row is then the only surviving record of it. It reads
     the RAW daily H/L, the same two arrays adrPct() above was handed, because
     the whole point of the column is the TRUE range rather than the close-only
     range consolidation() can see. */
  const coil=coilRatio(H,L,COIL_WIN);
  /* VCP. Computed here for the same reason Coil is — the raw OHLCV is gone on
     a cached load and this row is then the only surviving record of it — and
     handed e50/e200, the EMAs computed at the top of this function, so the
     trend leg reads the same two lines the EMA Align badges draw rather than
     building a third copy. e200 is null below 200 bars and vcpDetect() nulls
     the whole pattern on that, deliberately: see its block comment. */
  const vcp=vcpDetect(C,H,L,V,e50,e200);
  /* IPO BASE. Computed here for the same reason Coil and VCP are — the raw
     OHLCV is gone on a cached load and this row is then the only surviving
     record of it. feedStart is PASSED IN rather than read from GSHEET_DATA:
     that global is a pointer switchMkt() repoints, and reading it from inside
     the compute loop is the exact bug that once recorded 55 India stocks as
     "no data". A caller that does not supply it gets null, honestly. */
  const ipo=ipoBase(C,H,L,V,dates,feedStart);

  /* MOMENTUM BASE. Computed here for the same reason VCP, IPO Base and Coil
     are — the raw OHLCV is gone on a cached load and this row is then the only
     surviving record of it.

     THE 20-EMA SERIES IS BUILT ONCE, HERE, AND IT IS THE ONLY ONE IN THIS
     FUNCTION. computeTech() already holds the 20-EMA VALUE (e20, drawn by the
     EMA Align badges and divided by %20E), but a value is not a series and this
     screen needs the line as it stood on every bar of the move — asking "how
     many of these forty bars closed above their own 20 EMA" against today's
     single number would judge every past bar by a line that had not been drawn
     yet, which is lookahead of the plainest kind. It is NOT a second copy of
     e20 either: emaSeries(C,20) is index-aligned and its LAST element is e20 by
     construction, same seed, same smoothing, so the series and the value cannot
     disagree about where the line is. The only other emaSeries(C,20) in this
     file lives inside setupBaseAge(), which builds five periods for its own
     backward walk and returns an integer — there is nothing there to reuse
     without changing what that function returns, and threading a series out of
     it to save one O(n) pass would couple two unrelated columns.
     CFG.MOMO is passed rather than read inside, so the as-of-date rewind and
     the Advanced Filters re-scan both reach the engine by the one path the
     rest of this function already uses. */
  const e20Series=emaSeries(C,20);
  const momo=momentumBase(C,H,L,V,dates,e20Series,CFG.MOMO);

  /* %10E reads e10 — the SAME EMA computed at the top of this function and
     already drawn as the first EMA Align badge. Nothing is recomputed. */
  const pct10e=pctFromEma(price,e10);
  const pct20e=pctFromEma(price,e20);
  const pct50e=pctFromEma(price,e50);
  const pct200e=pctFromEma(price,e200);

  /* Candlestick patterns. hasO distinguishes "the sheet has no Open column"
     from "the open happens to equal the close": without it, a missing-Open
     sheet reports a perfect Doji on literally every bar of every stock. */
  const hasO = Array.isArray(O) && O.length===n;
  const pattern = (hasO && n>=2) ? candlePattern(O[n-1],H[n-1],L[n-1],C[n-1],O[n-2],C[n-2]) : null;
  const wn2=wk.closes.length;
  const wPattern = (hasO && wn2>=2)
    ? candlePattern(wk.opens[wn2-1],wk.highs[wn2-1],wk.lows[wn2-1],wk.closes[wn2-1],wk.opens[wn2-2],wk.closes[wn2-2])
    : null;

  const cons=consolidation(C,CFG.CONSOL.lookback,CFG.CONSOL.maxRangePct);

  /* Smart Money Zones. One call, nine published fields, all of them derived
     from the daily C/H/L this function already holds — see the block above
     computeTech() for the algorithm. It is computed here rather than at render
     time because it needs the raw high/low series, which a cached row does not
     carry: a row written before these fields existed cannot be repaired later
     even in principle, which is what makes this a CFG.VER bump. */
  const smz=smartMoneyZones(C,H,L,CFG.SMZ);

  /* Volume drying up: 20d average against 50d average. Both averages are taken
     over the same trailing window, so the 20d is a SUBSET of the 50d — this is
     "recent volume below the medium-term norm", not two independent samples.

     gs15 PUBLISHES THE RATIO, NOT JUST THE VERDICT. The measure is unchanged;
     what changed is how much of it survives to the screen. 0.40 and 0.95 are
     both "dry" and they are not remotely the same signal, and a boolean threw
     that difference away before anything could sort or filter on it.

     THE RATIO IS DELIBERATELY NOT ROUNDED HERE. Every other derived number on
     this row is rounded to two decimals at source; this one is not, because the
     contract that must hold is "ratio < 1 exactly when the old flag was true",
     and rounding breaks it at the boundary: an m20/m50 of 0.999 is DRY and
     rounds to 1.00, which is not < 1. The cell rounds for display instead —
     presentation is the right place to lose precision, and the filter is the
     wrong one, because "max 0.99" is a screen a user actually writes.

     volDry IS STILL PUBLISHED, and is now DERIVED from the ratio rather than
     computed beside it. Three test suites assert the field exists and behaves
     (it is part of the row's published shape), and deriving it is what makes
     the sense of the upgrade unbreakable: there is no arithmetic left that
     could make the flag and the number point in opposite directions. */
  let volDryRatio=null, volDry=null;
  if(n>=50){
    const a20=V.slice(-20), a50=V.slice(-50);
    const m20=a20.reduce((a,b)=>a+(b||0),0)/20, m50=a50.reduce((a,b)=>a+(b||0),0)/50;
    volDryRatio = m50>0 ? m20/m50 : null;
    volDry = volDryRatio==null ? null : volDryRatio<1;
  }

  /* Monthly setup: above where it traded ~6 months (126 trading days) ago AND
     within 15% of the 52W high. Floored at 130 bars because h52 itself is null
     below 120 — without that floor this would compare against a "52W high" that
     is really a 6-week high. */
  const monthlySetup = (n>=130 && h52!=null && h52>0 && C[n-1-126]>0)
    ? (price>C[n-1-126] && price>=h52*0.85)
    : null;

  /* Raw own-return legs for RS. RS itself is benchmark-relative and CANNOT be
     computed here — one stock in isolation has no benchmark — so computeTech
     publishes only its own % changes and rankRS() subtracts the benchmark's.
     This is the whole point of the rewrite: there is no code path that can emit
     a raw return into a field named rs*. */
  const pc21=pctChange(C,21);            // needs 22 bars
  const pc55=pctChange(C,55);            // needs 56 bars
  const pc10w=pctChange(wk.closes,10);   // needs 11 weekly bars ≈ 50 daily
  const pcHist21=pctChangeHist(C,21,30); // needs 51 bars

  /* THE BAR DATES THE RS LEGS WERE MEASURED ON, and nothing more.
     rankRS() runs long after computeTech() — the benchmark is not known here —
     and it also runs on a CACHED load, where the raw sheet is never downloaded
     and this row is the only surviving record of the ticker. So the anchor
     dates have to ride along on the row.
     56 daily dates is exactly what the widest leg needs: pc55 reaches back to
     index n-56 and the 30-point pcHist21 reaches back to n-51. Because it is a
     TAIL, tail-relative arithmetic (tail[len-1-N]) lands on the same bars as
     the full array's (C[n-1-N]) for every leg here. Carrying the whole `dates`
     array instead would multiply the cached blob by each ticker's entire
     history to convey no extra information. */
  const rsTail    = Math.min(56, n, Array.isArray(dates)?dates.length:0);
  const rsDates   = rsTail ? dates.slice(-rsTail) : [];
  /* The closes that go with those dates, sliced to the SAME length off the
     SAME end so index i of one always describes index i of the other. RS
     itself does not need them (it uses the pre-computed pc* legs), but RSP
     does: RSP is built from a stock/benchmark RATIO at every bar in its
     window, so it needs the bar-by-bar closes, date-paired.
     This is the one place the row got materially bigger — about 0.5KB per
     ticker in the day-stamped cache. Paid deliberately: without it RSP simply
     cannot exist on a cached load, and a column that works only on the day you
     first download the sheet is worse than no column. saveCache() already
     treats a quota failure as "no cache", not as an error. */
  const rsCloses  = rsTail ? C.slice(-rsTail) : [];
  const rsWkDates = Array.isArray(wk.dates) ? wk.dates.slice(-11) : [];  // pc10w reaches back 10 weekly bars

  const currency=sym.endsWith('.NS')?'INR':'USD';

  return{
    sym,price,ch1d,ch1w,ch1m,ch3m,volume:todV,avgV,vRatio,avgValue,h52d,h52,l52,
    /* The Vol Spike pair. Same contract as adr and the EMA-distance columns:
       read by its own column, the sort, the column filters and the export, and
       by NOTHING that scores, ranks or blends. It is a RECENCY-weighted read of
       a thing breakout() already tests its own way; folding it into a score
       would count the same volume twice. */
    volSpike:vSpike.mult, volSpikeAge:vSpike.age,
    /* THE THRUST-DAY TRIO, and they have NO COLUMN — deliberately. Unlike the
       Vol Spike pair above, nothing on screen prints these; their only consumer
       is hadThrust(), reached from the "Thrust day" Advanced Filter and from
       the seeded screen built on it. That is the same arrangement the EMA
       convergence filter has (a computed test with no column of its own), and
       it is why adding this cost no header cell, no SKEL_COLS entry and no export
       column. They still ride in the cached row like every other computeTech()
       field, which is why adding them moves CFG.VER.
       All three come from ONE bar and must be read as a set: thrustAge dates
       the same session thrustPct measures and thrustVol weighs. thrustVol is
       separately nullable — the gain can be known while the volume multiple is
       not — so it needs its own `!= null` test, never a bare comparison. */
    thrustPct:thrust.pct, thrustAge:thrust.age, thrustVol:thrust.vol, thrustFade:thrust.fade,
    earlyVolTrend:earlyVol.recent5Prior15,earlyUpDown10:earlyVol.upDown10,
    earlyPostThrustPre:earlyVol.postThrustPre,earlyPostThrustFade:earlyVol.postThrustFade,
    rsi14,wRsi,e10,e20,e50,e100,e150,e200,emaScr,
    /* Three-valued, daily only — see the note where it is computed. It rides in
       the cached row like every other computeTech() field, which is why adding
       it moves CFG.VER. */
    rsiAboveMa,
    /* THE NINE SMART MONEY ZONES FIELDS. Spread rather than listed one by one
       so the row and smartMoneyZones()'s own null-object can never drift out of
       step — there is exactly one place that names these keys, which is why
       gs20's smzBosAge needed no edit here at all. smzBias is four-valued
       (1 / -1 / 0 / null) and smzState five-valued (null included); anything
       reading them must test explicitly, because 0 and null mean two different
       things here — and smzBosAge is the third field in the family where that
       is true, with 0 meaning "flipped today" (see the notes where they are
       computed). */
    ...smz,
    sma50,sma150,sma200,slope200,slopeDir,
    xFast:XF,xSlow:XS,xFastEma,xSlowEma,xState,xBars,wxState,e50CrossUpAge,ema1020VolCross,
    pattern,wPattern,
    consolDays:cons.days,consolRange:cons.range,volDry,volDryRatio,monthlySetup,
    // The price-only half of the Setup Age. The RS leg is applied later, at
    // render time, from rsHist — see the note above setupBaseAge().
    setupBaseAge:setupBaseA,
    we10,we20,weEmaScr,wxBars,wxApplicable,
    dpz,wpz,dPiv,wPiv,s2,sq,wVolRatio,
    dBoxTop:dBox.top, dBoxBot:dBox.bot, dBoxState:dBox.state,
    /* % VS PIVOT. Read off dBox.top — the very field on the line above — so the
       percentage and the levels the D-Box cell prints can never disagree. The
       box is NOT built a second time: there are still exactly two box builds in
       this function, the daily one and the weekly one, and t6 counts them. */
    pctVsPivot:pctFromPivot(price,dBox.top),
    wBoxTop:wBox.top, wBoxBot:wBox.bot, wBoxState:wBox.state,
    /* adr arrived with gs10 (alongside dBoxRisk, which gs11 removed with the
       Risk% column). It is read by the ADR% column, by sorting, by the column
       filters and by the export — and by NOTHING that scores, ranks or
       blends. See the note on adrPct(). */
    adr,
    /* The EMA-distance trio arrived with gs13. Same contract as adr: read by
       their own column, by sorting, by the column filters and by the export,
       and by NOTHING that scores, ranks or blends — isQualitySetup() already
       asks its own price-above-every-EMA question and must keep asking it in
       one place. Cached with the row, which is what forces the CFG.VER bump. */
    pct10e,pct20e,pct50e,pct200e,
    /* daysUp and tight shipped with the same gs13 bump. Same contract again:
       their own columns, the sort, the column filters and the export — and
       nothing that scores, ranks or blends. `tight` in particular must never
       become an input to a composite: it is already a RATIO of two things the
       table shows, and folding it into a score would count ADR% twice. */
    daysUp,tight,coil,
    /* THE VCP FAMILY, gs16. Same contract as adr, the EMA-distance columns and
       coil: read by their own three columns, by the sort, by the column filters
       and by the export — and by NOTHING that scores, ranks or blends.
       isQualitySetup() keeps asking its own questions in its own place.
       vcpLid IS NOT dBoxTop. The Darvas top is a 5-bar construct published two
       fields below; this is the ceiling of a base up to VCP_MAX_BASE bars long,
       and on the same stock on the same day they are different prices. They are
       separate fields on purpose and neither column may describe the other. */
    vcpState:vcp&&vcp.state, vcpCount:vcp&&vcp.count, vcpBase:vcp&&vcp.baseBars,
    vcpLid:vcp?vcp.lid:null, vcpToLid:vcp?vcp.toLid:null,
    /* THE IPO-BASE FAMILY, gs17. Same contract as the VCP family: read by its
       own three columns, by the sort, by the column filters and by the export
       — and by NOTHING that scores, ranks or blends. In particular it must
       never reach isQualitySetup() or the Stage 2 patch: the age gate is a
       PROXY (see ipoBase()'s block comment) and a proxy has no business
       silently moving a score the owner reads as a fact.
       ipoLid IS NEITHER dBoxTop NOR vcpLid. Three different levels on one row
       — a 5-bar Darvas top, a 120-bar contraction ceiling, and the highest
       high since this ticker's first bar. Separate fields on purpose, and no
       column may describe another's level. */
    ipoState:ipo&&ipo.state, ipoBaseBars:ipo&&ipo.baseBars, ipoBars:ipo&&ipo.bars,
    ipoDepth:ipo?ipo.depth:null, ipoLid:ipo?ipo.lid:null, ipoToLid:ipo?ipo.toLid:null,
    /* THE NINE MOMENTUM BASE FIELDS, gs21. SPREAD rather than listed one by
       one — the same arrangement the SMZ family above uses and for the same
       reason: momentumBase() returns either its full object or its own
       null-object, both carrying exactly these nine keys, so there is precisely
       ONE place in the file that names them and the row cannot drift out of
       step with the function. A tenth field added to the engine later lands
       here with no edit at all.
       Same contract as the VCP and IPO families otherwise: read by its own
       column, by the sort, by the column filter, by the export and by the
       🔥 Momentum Base button — and by NOTHING that scores, ranks or blends.
       In particular it must never reach isQualitySetup() or the Stage 2 patch.
       momoBaseHigh IS NOT dBoxTop, vcpLid OR ipoLid. It is the highest high
       since this stock's own thrust peaked — a fourth level, on a fourth
       definition, and on the same row on the same day all four are different
       prices. Separate fields on purpose and no column may describe another's
       level. */
    ...momo,
    boGain:bo.gain,boCnt:bo.count,retrace:bo.retrace,
    // Own returns (inputs to RS, never displayed as RS), plus the dates they
    // were measured across so rankRS() can price the benchmark on the SAME
    // days rather than on its own last N bars.
    pc21,pc55,pc10w,pcHist21,rsDates,rsCloses,rsWkDates,
    // Filled by rankRS() once the benchmark is known. null until then, and
    // still null afterwards if the benchmark could not be fetched.
    rs21:null,rs55:null,rs10w:null,rsSlope:null,rsTrend:null,rsHist:null,
    rs:null,mrsRank:null,leadRS:null,
    // RS POSITION. Same "null until rankRS() has a benchmark" contract as the
    // rs* fields above, and for the same reason: the ratio it is built from
    // does not exist without one.
    rsp55:null,rsp21:null,
    currency,
  };
}

function benchmarkAvailable(market,ticker){
  if(!ticker) return false;
  const map=GSHEET_BY_MARKET[market];
  const gd=map && map[ticker];
  if(gd && gd.C && gd.C.length>=22) return true;
  try{
    const raw=localStorage.getItem(bKey(market));
    if(raw){
      const b=JSON.parse(raw);
      if(b && b.sym===ticker && b.C && b.C.length>=22) return true;
    }
  }catch(e){ /* corrupt cache is a miss, not a crash */ }
  return false;
}

function rankRS(market){
  const items=UNI[market].map(d=>SD[d.s]).filter(Boolean);
  if(!items.length) return;

  const b=BENCHMARK_DATA[market];
  /* Both indexes are built ONCE here and then consulted per ticker — see
     benchIndex() for why the benchmark is looked up BY DATE instead of by
     position, and why doing it per call site was not an option. */
  const bi   = b ? benchIndex(b.dates,b.C) : null;
  const bwk  = b ? weeklyResample(b.C,b.H,b.L,b.V,b.dates) : null;
  const bwi  = bwk ? benchIndex(bwk.dates,bwk.closes) : null;
  // Market regime is context only; it never hard-gates Early. It is derived from
  // the benchmark series available at the SAME as-of date.
  let marketRegime='unknown';
  if(b&&Array.isArray(b.C)&&b.C.length>=200){
    const n=b.C.length, e20=emaSeries(b.C,20).at(-1), e50=emaSeries(b.C,50).at(-1), e200=emaSeries(b.C,200).at(-1);
    const c=b.C[n-1];
    if([c,e20,e50,e200].every(earlyFinite)) marketRegime=(c>e20&&c>e50&&c>e200)?'bull':(c<e20&&c<e50&&c<e200)?'bear':'mixed';
  }

  // No benchmark => every RS field stays null. There is deliberately no `else`
  // branch here: the absence of a fallback IS the fix.
  items.forEach(d=>{
    const ex=(own,bench)=> (own!=null && bench!=null) ? +(own-bench).toFixed(2) : null;
    /* Every benchmark leg is priced across THIS stock's own bar dates, so a
       stale or halted ticker is scored over the window it actually traded
       instead of against the benchmark's latest N bars. When the calendars
       agree — which is most tickers — these are the same numbers as before. */
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
    /* RS POSITION. Computed here because it needs the benchmark, and fed
       through the SAME date aligner as everything above. Written last and
       read by NOTHING below: rsp* must never reach mrsRank, the Stage 2
       patch, or any other composite — a min-max-normalised position is not
       additive and not comparable between stocks. It is a sortable column and
       nothing more. */
    d.rsp55 = rsPosition(d.rsCloses,d.rsDates,bi,55);
    d.rsp21 = rsPosition(d.rsCloses,d.rsDates,bi,21);
    /* The short tail of the 21-bar position, for the Fresh column's fourth
       flag. Written HERE, beside the column it belongs to, because it needs
       the same benchmark index and the same date aligner — and rebuilt on
       every load, cached or not, so unlike setupBaseAge it can never be a
       stale shape in someone's localStorage. It feeds the flag and nothing
       else: a min-max position still may not reach mrsRank, the Stage 2 patch
       or any other composite. */
    d.rspHist21 = rspHistory(d.rsCloses,d.rsDates,bi,FRESH_RSP_LEN,FRESH_RSP_HIST);
    d.marketRegime=marketRegime;
    d.early=calcEarlyBreakout(d,market);
    d.rs=null; d.mrsRank=null;
  });

  // Percentile rank (1-100) of rs55 across everything that HAS an rs55.
  // Stocks with too little history are excluded from the ranking rather than
  // ranked as if their missing return were zero — including them would push
  // every genuine laggard up the table.
  const ranked=items.filter(d=>d.rs55!=null).sort((a,b2)=>a.rs55-b2.rs55);
  ranked.forEach((d,i)=>{
    const p=Math.max(1,Math.round((i+1)/ranked.length*100));
    d.mrsRank=p;
    d.rs=p;   // legacy alias: the RS column and its sort still read `rs`
  });

  // Patch Stage 2 rule #8 ("RS positive vs benchmark") now that the benchmark
  // is known. Index 7, not 4 — the rule list went from 7 rules to 9 and RS
  // moved. An off-by-one here silently rewrites a DIFFERENT rule's pass flag.
  items.forEach(d=>{
    if(d.s2&&d.s2.details&&d.s2.details[7]){
      d.s2.details[7].pass = d.rs21!=null && d.rs21>0;
      d.s2.score = d.s2.details.filter(c=>c.pass).length;
    }
  });
}

function earlyFinite(v){return typeof v==='number'&&isFinite(v);}

function earlyMinTrigger(d){
  if(!d) return null;
  const p=earlyFinite(d.price)?d.price:null;
  if(p==null||p<=0) return null;
  const vals=[];
  if(earlyFinite(d.dBoxTop)&&d.dBoxTop>0) vals.push(100*(d.dBoxTop-p)/p);
  if(earlyFinite(d.vcpLid)&&d.vcpLid>0) vals.push(100*(d.vcpLid-p)/p);
  if(earlyFinite(d.ipoLid)&&d.ipoLid>0) vals.push(100*(d.ipoLid-p)/p);
  if(!vals.length) return null;
  return +Math.max(0,Math.min(...vals)).toFixed(2);
}

function earlyRSPLead(d){
  if(!d) return {pts:0,lead:false,cross:false};
  let pts=0;
  if(earlyFinite(d.rsp21)){if(d.rsp21>=90) pts+=8; else if(d.rsp21>=80) pts+=5;}
  if(earlyFinite(d.rsp55)&&d.rsp55>=85) pts+=3;
  if(earlyFinite(d.rsSlope)&&d.rsSlope>0) pts+=5;
  if(earlyFinite(d.rs21)&&d.rs21>0) pts+=4;
  let cross=false;
  const h=d.rspHist21;
  if(Array.isArray(h)&&h.length>=2){
    for(let i=h.length-1;i>0;i--){
      const a=h[i-1],b=h[i];
      if(earlyFinite(a)&&earlyFinite(b)&&a<=80&&b>90){cross=true;break;}
    }
  }
  if(cross) pts=Math.min(20,pts+3);
  return {pts:Math.min(20,pts),lead:(earlyFinite(d.rsp21)&&d.rsp21>=90),cross};
}

function earlyCompression(d){
  if(!d) return 0;
  let p=0;
  if(earlyFinite(d.coil)){if(d.coil<=0.70)p+=8;else if(d.coil<=0.85)p+=6;else if(d.coil<=1)p+=3;}
  if(earlyFinite(d.tight)){if(d.tight<=50)p+=5;else if(d.tight<=60)p+=4;else if(d.tight<=75)p+=2;}
  if(earlyFinite(d.consolDays)){if(d.consolDays>=10)p+=4;else if(d.consolDays>=5)p+=3;else if(d.consolDays>=3)p+=1;}
  if(earlyFinite(d.sq)){if(d.sq>=75)p+=3;else if(d.sq>=65)p+=2;}
  return Math.min(20,p);
}

function earlyVolumeScore(d){
  if(!d) return {pts:0,phase:'unknown'};
  let p=0;
  if(earlyFinite(d.volDryRatio)){if(d.volDryRatio<0.75)p+=5;else if(d.volDryRatio<1)p+=3;}
  if(earlyFinite(d.earlyPostThrustPre)){if(d.earlyPostThrustPre<=0.75)p+=4;else if(d.earlyPostThrustPre<=1)p+=2;}
  if(earlyFinite(d.earlyVolTrend)){if(d.earlyVolTrend>=1.50)p+=6;else if(d.earlyVolTrend>=1.15)p+=4;else if(d.earlyVolTrend>=1.05)p+=2;}
  if(earlyFinite(d.earlyUpDown10)){if(d.earlyUpDown10>=1.50)p+=5;else if(d.earlyUpDown10>=1.20)p+=3;}
  const phase=earlyFinite(d.earlyVolTrend)&&d.earlyVolTrend>=1.15?'expanding':
              earlyFinite(d.volDryRatio)&&d.volDryRatio<1?'drying':'neutral';
  return {pts:Math.min(20,p),phase};
}

function earlyTrendScore(d){
  if(!d) return 0;
  let p=0;
  if(earlyFinite(d.pct20e)&&d.pct20e>0)p+=5;
  if(earlyFinite(d.pct50e)&&d.pct50e>0)p+=5;
  if(earlyFinite(d.pct200e)&&d.pct200e>-10)p+=5;
  if(earlyFinite(d.slope200)&&d.slope200>0)p+=5;
  return p;
}

function earlyStructureScore(d){
  if(!d) return {pts:0,dist:null};
  const dist=earlyMinTrigger(d); let p=0;
  if(dist!=null){if(dist<=3)p+=10;else if(dist<=5)p+=8;else if(dist<=10)p+=5;else if(dist<=15)p+=3;}
  if(d.dBoxState==='near'||d.dBoxState==='inside')p+=4;
  if(earlyFinite(d.vcpToLid)&&d.vcpToLid>=0&&d.vcpToLid<=3)p+=3;
  if(earlyFinite(d.ipoToLid)&&d.ipoToLid>=0&&d.ipoToLid<=3)p+=3;
  return {pts:Math.min(20,p),dist};
}

function calcEarlyBreakout(d,market){
  if(!d) return null;
  const rs=earlyRSPLead(d), vol=earlyVolumeScore(d), tr=earlyTrendScore(d), co=earlyCompression(d), st=earlyStructureScore(d);
  const score=Math.max(0,Math.min(100,tr+rs.pts+co+vol.pts+st.pts));
  const bo=(d.boAge!=null&&isFinite(d.boAge)&&d.boAge<=5);
  let state='developing';
  if(bo) state='breakout';
  else if(score>=80 && st.dist!=null && st.dist<=5 && vol.phase==='expanding') state='prime';
  else if(score>=70 && st.dist!=null && st.dist<=10) state='watch';
  else if(score>=60) state='accumulation';
  const regime=d.marketRegime||'unknown';
  return {score,state,trend:tr,rs:rs.pts,rsLead:rs.lead,rsCross:rs.cross,compression:co,volume:vol.pts,volumePhase:vol.phase,structure:st.pts,triggerDist:st.dist,marketRegime:regime};
}

function setupBaseAge(C,H,L,V,dates,O,wkPre){
  const n=(C&&C.length)||0;
  if(n<2) return 0;
  const wk=wkPre||weeklyResample(C,H,L,V,dates,O);
  /* Weekly bucket count per daily bar, so the weekly EMA 20 can be read AS IT
     STOOD on bar i without resampling a prefix once per bar — that is n Date
     parses per bar per ticker, and across ~900 tickers it is seconds. Every
     week BEFORE the one bar i sits in is complete and therefore identical to
     the full-series resample; the week bar i sits in closes at C[i] by
     definition, and that single substituted close is the entire difference. */
  const wkOf=new Array(n).fill(0);
  {
    const seen=new Set(); let cnt=0;
    for(let i=0;i<n;i++){
      const dt=dates&&dates[i];
      if(dt&&C[i]!=null){
        /* Same shared per-date cache weeklyResample() uses. This loop had its
           own inline copy of the identical Date arithmetic, so it was paying
           the full conversion a second time for every bar of every ticker. */
        const k=wkMondayKey(dt);
        if(!seen.has(k)){ seen.add(k); cnt++; }
      }
      wkOf[i]=cnt;
    }
  }
  // emaSeries() is index-aligned and null until its seed completes, so
  // es[p][i] IS ema(C.slice(0,i+1),p) — one O(n) pass instead of one per bar.
  const es={};
  for(const p of [10,20,50,100,200]) es[p]=emaSeries(C,p);
  let age=0;
  for(let i=n-1; i>=1 && age<SETUP_AGE_MAX; i--){
    const price=C[i];
    if(price==null||!isFinite(price)) break;
    const pref=C.slice(0,i+1);
    const h52=hi52(H,i+1), l52=lo52(L,i+1);
    const h52d=h52?+((price/h52-1)*100).toFixed(1):null;   // rounded exactly as the row rounds it
    const wc=wk.closes.slice(0,Math.max(0,wkOf[i]-1)).concat([price]);
    const s2=stage2(price,pref,h52,l52,ema(wc,20),sma(pref,50),sma(pref,150),sma(pref,200));
    /* rs21:1 is a SIGN, never a magnitude — nothing in isQualitySetup()
       compares rs21 against anything but zero. s2.score+1 applies the same
       held-true RS to Stage 2 rule 8, which stage2() leaves false for
       rankRS() to patch. See the header note for why this is exact. */
    const q=isQualitySetup({
      h52d, price,
      e10:es[10][i], e20:es[20][i], e50:es[50][i], e100:es[100][i], e200:es[200][i],
      rs21:1,
      s2:{score:s2.score+1, total:s2.total, details:s2.details},
    });
    if(!q) break;
    age++;
  }
  return age;
}

function emasAligned(d){ return (d?.emaScr||0)>=0.8; }

function emaConverged(d, maxPct){
  if(!d) return false;
  const px=d.price;
  if(px==null || !(px>0)) return false;
  const vals=[d.e10,d.e20,d.e50,d.e200].filter(v=>v!=null && isFinite(v));
  if(vals.length<2) return false;
  if(vals.some(v=>v>px)) return false;
  return ((Math.max(...vals)-Math.min(...vals))/px)*100 <= maxPct;
}

function weeklyEmaConverged1020(d,maxPct=5){
  if(!d || !(d.price>0) || !(d.we10>0) || !(d.we20>0)) return false;
  if(d.price<d.we10 || d.price<d.we20) return false;
  return (Math.abs(d.we10-d.we20)/d.price)*100 <= maxPct;
}

function lifecycleStage(d){
  if(!d) return null;
  /* No box → no stage. dBoxTop is checked as well as the state because a box
     is what all four rules are stated against; a state with no top would mean
     darvasBox() had changed shape under us. */
  if(d.dBoxTop==null || d.dBoxState==null) return null;
  const age=d.boAge;
  /* `undefined` means the field was never written — a row rehydrated from a
     cache older than boAge itself. That is "we do not know whether it broke
     out", which is not the same as "it never did", and neither of the two
     answers it could be coerced into would be true. passesAdv() makes the same
     distinction for the same reason. */
  if(age===undefined) return null;
  // null = boBarsSince() found no qualifying breakout anywhere in the history.
  /* EMERGING FIRST, and only inside the never-triggered case. A stock that has
     already broken out is past this question — the turn it describes is a thing
     that happens in a base, not after one. */
  if(age===null){
    if(!STAGE_FORMING_STATES.includes(d.dBoxState)) return null;
    return isEmerging(d) ? 'emerging' : 'forming';
  }
  if(typeof age!=='number'||!isFinite(age)) return null;
  if(STAGE_ABOVE_STATES.includes(d.dBoxState))
    return age<=STAGE_FRESH_DAYS?'fresh':'climbing';
  // Broke out, and is no longer above the top: 'near', 'inside' or 'below'.
  return 'played';
}

export { ema, sma, rsi, rsiSeries, pivots, pivZone, pivMatch, stage2, weeklyResample, emaSeries, barChange, pctChange, pctChangeHist, benchIndex, benchPctBetween, benchLegPct, benchLegPctHist, consolidation, volAvg20, volSpike, thrustDay, hi52, lo52, breakout, darvasSeries, darvasState, darvasBox, adrPct, tightness, coilRatio, pctFromEma, pctFromPivot, vcpPivots, vcpContractions, vcpDetect, momentumBase, ipoBase, smartMoneyZones, earlyVolumeTransition, computeTech, benchmarkAvailable, rankRS, earlyFinite, earlyMinTrigger, earlyRSPLead, earlyCompression, earlyVolumeScore, earlyTrendScore, earlyStructureScore, calcEarlyBreakout, setupBaseAge, emasAligned, emaConverged, weeklyEmaConverged1020, lifecycleStage };

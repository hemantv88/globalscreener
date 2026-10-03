/* GitHub-only Phase 2 mirror of frontend weekly/volume/price-structure functions. */

const H52_MIN_BARS=120, H52_WIN=252;
const WK_MONDAY=new Map(), WK_SUNDAY=new Map();

const BO_LOOKBACK=52;

const VOL_SPIKE_WIN=10;

const VOL_SPIKE_MULT=1.5;

const AVG_VAL_BARS=20;
const THRUST_MIN_BARS = 20 + 1 + 1;
const CFG = { THRUST: { win: 10 } };
const PIV_NEAR_PCT=1;
const ABOVE_PIV_ZONES=['PP→R1','R1→R2','R2+'];
const PIV_OPTS=[
  {v:'ar1',  label:'Above R1', test:z=>z==='R1→R2'||z==='R2+'},
  {v:'r2',   label:'R2',       test:z=>z==='R2+'},
  {v:'r1b',  label:'R1',       test:z=>z==='R1→R2'},
  {v:'nr1',  label:'Near R1',  test:(z,price,piv)=>piv!=null && piv.r1>0 && price!=null && Math.abs(price/piv.r1-1)*100<=PIV_NEAR_PCT},
  {v:'ppr1', label:'PP–R1',    test:z=>z==='PP→R1'},
  {v:'pp',   label:'Pivot',    test:z=>z==='PP'},
  {v:'s1pp', label:'S1–PP',    test:z=>z==='S1→PP'},
  {v:'s1b',  label:'S1',       test:z=>z==='S2→S1'},
  {v:'s2',   label:'S2',       test:z=>z==='<S2'},
];
const PIV_LEGACY={
  above: z=>ABOVE_PIV_ZONES.includes(z),
  r1: z=>['R1→R2','R2+'].includes(z),
  below: z=>['S1→PP','S2→S1','<S2'].includes(z),
};

export function wkMondayKey(dt){
  let k=WK_MONDAY.get(dt);
  if(k!==undefined) return k;
  const d=new Date(dt+'T00:00:00Z');
  const mon=new Date(d); mon.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  k=mon.toISOString().slice(0,10);
  WK_MONDAY.set(dt,k);
  return k;
}

export function wkSundayKey(mondayKey){
  let s=WK_SUNDAY.get(mondayKey);
  if(s!==undefined) return s;
  const d=new Date(mondayKey+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()+6);
  s=d.toISOString().slice(0,10);
  WK_SUNDAY.set(mondayKey,s);
  return s;
}

export function weeklyResample(C,H,L,V,dates,O){
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

export function volAvg20(V,end){
  const e=(end==null?((V&&V.length)||0):end);
  let sum=0,cnt=0;
  for(let i=Math.max(0,e-21);i<e-1;i++){ const v=V[i]; if(v>0){ sum+=v; cnt++; } }
  return cnt?sum/cnt:0;
}

export function avgTradedValue(C,V,bars){
  const n=(C&&C.length)||0;
  const b=bars||AVG_VAL_BARS;
  if(!Array.isArray(C)||!Array.isArray(V)||V.length!==n||n<b) return null;
  let sum=0;
  for(let i=n-b;i<n;i++){
    const c=C[i], v=V[i];
    if(c==null||v==null||!isFinite(c)||!isFinite(v)) return null;
    sum+=c*v;
  }
  return sum/b;
}

export function volSpike(V,win,mult){
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

export function thrustDay(C,V,win){
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

export function hi52(A,end){
  const e=(end==null?((A&&A.length)||0):end);
  if(!(e>=H52_MIN_BARS)) return null;
  let m=-Infinity;
  for(let i=e-Math.min(e,H52_WIN);i<e;i++){
    const v=+A[i]; if(Number.isNaN(v)) return NaN;
    if(v>m) m=v;
  }
  return m;
}

export function lo52(A,end){
  const e=(end==null?((A&&A.length)||0):end);
  if(!(e>=H52_MIN_BARS)) return null;
  let m=Infinity;
  for(let i=e-Math.min(e,H52_WIN);i<e;i++){
    const v=+A[i]; if(Number.isNaN(v)) return NaN;
    if(v<m) m=v;
  }
  return m;
}

export function boPriceFlags(closes){
  const n=(closes&&closes.length)||0;
  const out=new Array(n).fill(false);
  for(let i=BO_LOOKBACK;i<n;i++){
    let ph=-Infinity, bad=false;
    for(let j=i-BO_LOOKBACK;j<i;j++){
      const v=+closes[j]; if(Number.isNaN(v)){ bad=true; break; }
      if(v>ph) ph=v;
    }
    out[i]=bad?false:(closes[i]>ph);
  }
  return out;
}

export function breakout(closes,volumes){
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

export function pivots(h,l,c){
  const pp=(h+l+c)/3;
  return{pp,r1:2*pp-l,r2:pp+(h-l),s1:2*pp-h,s2:pp-(h-l)};
}

export function pivZone(price,piv){
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

export function pivMatch(sel,zone,price,piv){
  if(!sel) return true;                       // no screen selected
  const o=PIV_OPTS.find(x=>x.v===sel);
  if(o) return !!o.test(zone,price,piv);
  const lg=PIV_LEGACY[sel];
  if(lg) return !!lg(zone);
  return true;   // a value from a future build screens nothing rather than emptying the table
}


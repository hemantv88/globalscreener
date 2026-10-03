/*
 * GlobalScreener frontend-engine parity layer — market/structure foundations.
 *
 * This module is intentionally NOT imported by index.html.
 * Function bodies mirror the current proven index.html baseline.
 * Baseline index.html blob: c2ade50a605a5d7c32df3e679d02e03e763fd4c4
 */

const WK_MONDAY = new Map();
const WK_SUNDAY = new Map();

const BO_LOOKBACK = 52;
const H52_MIN_BARS = 120;
const H52_WIN = 252;
const VOL_SPIKE_WIN = 10;
const VOL_SPIKE_MULT = 1.5;
const THRUST_MIN_BARS = 20 + 1 + 1;
const AVG_VAL_BARS = 20;

const CFG = {
  THRUST: { win: 10 }
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

export function volSpike(V,win,mult){
  const w=(win==null?VOL_SPIKE_WIN:win), m=(mult==null?VOL_SPIKE_MULT:mult);
  const none={mult:null,age:null};
  if(!Array.isArray(V)) return none;
  const n=V.length;
  if(n<21) return none;
  let best=null,bestI=-1;
  for(let i=Math.max(20,n-w);i<n;i++){
    const v=V[i];
    if(!(typeof v==='number'&&isFinite(v)&&v>0)) continue;
    const base=volAvg20(V,i+1);
    if(!(base>0)) continue;
    const r=v/base;
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
    const base=volAvg20(V,bestI+1);
    if(base>0) vol=+(tv/base).toFixed(2);
  }
  let fade=null;
  if(bestI<n-1 && typeof tv==='number' && isFinite(tv) && tv>0){
    let sum=0,cnt=0;
    for(let k=bestI+1;k<n;k++){ const v=V[k]; if(typeof v==='number'&&isFinite(v)&&v>=0){ sum+=v; cnt++; } }
    if(cnt) fade=+((sum/cnt)/tv).toFixed(3);
  }
  return {pct:+best.toFixed(2), age:(n-1)-bestI, vol, fade};
}

export function earlyVolumeTransition(C,V,thrust){
  const n=Math.min(Array.isArray(C)?C.length:0,Array.isArray(V)?V.length:0);
  const none={recent5Prior15:null,upDown10:null,postThrustPre:null,postThrustFade:null};
  if(n<21) return none;
  const fin=v=>typeof v==='number'&&isFinite(v)&&v>=0;
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
    for(let i=idx+1;i<Math.min(n,idx+11);i++){const v=V[i];if(fin(v)){post+=v;postc++;}}
    if(prec===20&&postc>=3&&pre>0) none.postThrustPre=+(post/postc/(pre/prec)).toFixed(2);
  }
  if(thrust&&thrust.fade!=null) none.postThrustFade=thrust.fade;
  return none;
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

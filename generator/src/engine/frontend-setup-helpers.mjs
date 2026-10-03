/*
 * GlobalScreener GitHub-only setup/quality helper parity layer.
 * Baseline index.html blob: c2ade50a605a5d7c32df3e679d02e03e763fd4c4
 */
import { ema, emaSeries, sma } from './frontend-foundation.mjs';
import { wkMondayKey, weeklyResample, hi52, lo52 } from './frontend-market-structure.mjs';
import { stage2 } from './frontend-structure-engine.mjs';

const SETUP_AGE_MAX=30;

export function isQualitySetup(d){
  if(!d) return false;
  if(!(d.h52d!=null && d.h52d>=-30)) return false;
  const emas=[d.e10,d.e20,d.e50,d.e100,d.e200].filter(v=>v!=null);
  if(!emas.length || d.price==null) return false;
  if(!emas.every(v=>d.price>v)) return false;
  if(!(d.rs21!=null && d.rs21>0)) return false;
  if(!(d.s2 && d.s2.total && d.s2.score===d.s2.total)) return false;
  return true;
}

export function consolidation(closes,lookback,maxRangePct){
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

export function candlePattern(o,h,l,c,po,pc){
  if(![o,h,l,c,po,pc].every(v=>typeof v==='number'&&isFinite(v))) return null;
  if(pc<po && c>o && c>=po && o<=pc) return 'Bull Engulf';
  if(pc>po && c<o && c<=po && o>=pc) return 'Bear Engulf';
  const rng=h-l;
  if(rng<=0) return null;
  const body=Math.abs(c-o);
  const upper=h-Math.max(o,c), lower=Math.min(o,c)-l;
  if(lower>=2*body && upper<=body && Math.min(o,c)>=l+rng*(2/3)) return 'Hammer';
  if(body<=rng*0.1) return 'Doji';
  return null;
}

export function setupBaseAge(C,H,L,V,dates,O,wkPre){
  const n=(C&&C.length)||0;
  if(n<2) return 0;
  const wk=wkPre||weeklyResample(C,H,L,V,dates,O);
  const wkOf=new Array(n).fill(0);
  {
    const seen=new Set(); let cnt=0;
    for(let i=0;i<n;i++){
      const dt=dates&&dates[i];
      if(dt&&C[i]!=null){
        const k=wkMondayKey(dt);
        if(!seen.has(k)){ seen.add(k); cnt++; }
      }
      wkOf[i]=cnt;
    }
  }
  const es={};
  for(const p of [10,20,50,100,200]) es[p]=emaSeries(C,p);
  let age=0;
  for(let i=n-1; i>=1 && age<SETUP_AGE_MAX; i--){
    const price=C[i];
    if(price==null||!isFinite(price)) break;
    const pref=C.slice(0,i+1);
    const h52=hi52(H,i+1), l52=lo52(L,i+1);
    const h52d=h52?+((price/h52-1)*100).toFixed(1):null;
    const wc=wk.closes.slice(0,Math.max(0,wkOf[i]-1)).concat([price]);
    const s2=stage2(price,pref,h52,l52,ema(wc,20),sma(pref,50),sma(pref,150),sma(pref,200));
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

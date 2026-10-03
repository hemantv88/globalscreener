/*
 * GlobalScreener GitHub-only computeTech mirror.
 *
 * IMPORTANT: index.html is unchanged and remains the live/control implementation.
 * This module is only a testable extraction of the current row-calculation
 * assembly. The first eight parameters preserve the original computeTech()
 * signature; an optional ninth config argument makes the dependency explicit
 * without changing default behavior.
 *
 * Baseline index.html blob:
 * c2ade50a605a5d7c32df3e679d02e03e763fd4c4
 */
import {
  ema,sma,rsi,rsiSeries,emaSeries,pctChange,pctChangeHist,barChange
} from './frontend-foundation.mjs';
import {
  weeklyResample,volAvg20,volSpike,thrustDay,earlyVolumeTransition,
  avgTradedValue,hi52,lo52,pivZone,pivots,breakout
} from './frontend-market-structure.mjs';
import {
  stage2,squeeze,darvasBox,adrPct,tightness,upDayStreak,coilRatio,pctFromEma,pctFromPivot
} from './frontend-structure-engine.mjs';
import { vcpDetect,ipoBase,momentumBase,smartMoneyZones } from './frontend-pattern-engine.mjs';
import { setupBaseAge,consolidation,candlePattern,isQualitySetup } from './frontend-setup-helpers.mjs';

const CFG_DEFAULT={
  XOVER:{fast:10,slow:20},
  CONSOL:{lookback:20,maxRangePct:10},
  DARVAS:{boxp:5,nearPct:1.0},
  SMZ:{pivotLeft:5,pivotRight:5,confirmBars:1,minPenPct:0,advanceMode:'break'},
  MOMO:{lookback:42,minMovePct:40,minVolRatio:1.0,minAbovePct:80,minBaseBars:8,maxBaseDepth:25},
  THRUST:{win:10}
};
const RSI_MA_PERIOD=14;
const RSI_MA_MIN_RSI_VALUES=30;
const RSI_MA_MIN_CLOSES=(RSI_MA_PERIOD+1)+RSI_MA_MIN_RSI_VALUES;
const AVG_VAL_BARS=20;
const H52_MIN_BARS=120;
const H52_WIN=252;
const ADR_WIN=20;
const TIGHT_WIN=3;
const COIL_WIN=20;
const VOL_SPIKE_WIN=10;

export function computeTech(C,H,L,V,dates,sym,O,feedStart,cfg=CFG_DEFAULT){
  const CFG=cfg;

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

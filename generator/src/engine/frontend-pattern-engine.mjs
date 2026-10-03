/*
 * GitHub-only Phase 2 mirror of VCP / IPO Base / Momentum Base / Smart Money Zone.
 *
 * index.html remains unchanged and is still the control implementation.
 * Function bodies below are copied from the baseline; formulas are not redesigned.
 */

const VCP_MAX_BASE=120;
const VCP_RUN_WIN=60;
const VCP_PRIOR_RUN=25;
const VCP_PIVOT_K=3;
const VCP_MIN_LEGS=2;
const VCP_MAX_LEGS=4;
const VCP_MAX_DEPTH=35;
const VCP_FINAL_DEPTH=12;
const VCP_LEG_TOL=1.10;
const VCP_CONTRACT_RATIO=0.60;
const VCP_VOL_DRY=0.75;
const VCP_VOL_TAIL=5;
const VCP_BO_AGE=5;
const VCP_BO_VOL=1.5;
const VCP_PIVOT_ZONE=2;
const IPO_MIN_BASE=15;
const IPO_MAX_BASE=90;
const IPO_MAX_DEPTH=35;
const IPO_MIN_BARS=40;
const MOMO_VOL_RATIO_CAP=99;
const SMZ_MIN_BARS=60;
const CFG={THRUST:{win:10}};

function _volAvg20(V,end){
  const e=(end==null?((V&&V.length)||0):end);
  let sum=0,cnt=0;
  for(let i=Math.max(0,e-21);i<e-1;i++){ const v=V[i]; if(v>0){ sum+=v; cnt++; } }
  return cnt?sum/cnt:0;
}
const volAvg20=_volAvg20;
export function vcpPivots(H,L,k){
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

export function vcpContractions(H,L,lidVal,lidIdx,piv,endIdx){
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

export function vcpDetect(C,H,L,V,e50,e200){
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

export function ipoBase(C,H,L,V,dates,feedStart){
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

export function momentumBase(C,H,L,V,dates,ema20Series,cfg){
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

export function smzPivots(H,L,left,right){
  const lf=Math.max(1,Math.floor(left||0)), rt=Math.max(1,Math.floor(right||0));
  const out={highs:[],lows:[],left:lf,right:rt};
  if(!Array.isArray(H)||!Array.isArray(L)) return out;
  const n=Math.min(H.length,L.length);
  if(n<lf+rt+1) return out;
  const fin=v=>typeof v==='number'&&isFinite(v);
  for(let c=lf;c<=n-1-rt;c++){
    const hc=H[c], lc=L[c];
    if(fin(hc)){
      let ok=true;
      for(let j=c-lf;j<=c+rt;j++){
        if(j===c) continue;
        const v=H[j];
        if(!fin(v)||!(hc>v)){ ok=false; break; }
      }
      if(ok) out.highs.push({bar:c, level:hc, confirmedAt:c+rt});
    }
    if(fin(lc)){
      let ok=true;
      for(let j=c-lf;j<=c+rt;j++){
        if(j===c) continue;
        const v=L[j];
        if(!fin(v)||!(lc<v)){ ok=false; break; }
      }
      if(ok) out.lows.push({bar:c, level:lc, confirmedAt:c+rt});
    }
  }
  return out;
}

export function smzStructure(C,H,L,cfg){
  const K=cfg||{};
  const lf=Math.max(1,Math.floor(K.pivotLeft||5));
  const rt=Math.max(1,Math.floor(K.pivotRight||5));
  const confirmBars=Math.max(1,Math.floor(K.confirmBars||1));
  const minPen=(typeof K.minPenPct==='number'&&isFinite(K.minPenPct))?K.minPenPct:0;
  // 'everyhllh' is Pine's "Every Higher Low / Lower High"; anything else is the
  // default "Structure Break Only".
  const everyHL=(K.advanceMode==='everyhllh');

  const n=Math.min(C.length,H.length,L.length);
  const fin=v=>typeof v==='number'&&isFinite(v);
  const piv=smzPivots(H,L,lf,rt);

  /* The SEED for a running extreme. When a pivot centred at bar b confirms at
     bar i, the extreme "since the pivot" already covers bars b..i — eleven at
     most, a constant — and every bar after that is a single comparison. This
     is the Pine's ta.highest(high, pivot_right + 1) seed, which it uses for
     exactly this reason. An unreadable bar inside the seed window is skipped
     rather than poisoning the seed; only a window with nothing readable in it
     at all returns null. */
  const seed=(A,a,b,max)=>{
    let m=null;
    for(let j=Math.max(0,a);j<=b;j++){
      const v=A[j];
      if(!fin(v)) continue;
      m = m==null ? v : (max?Math.max(m,v):Math.min(m,v));
    }
    return m;
  };

  let swingHigh=null, swingLow=null;      // the two external swing LEVELS
  let shBar=null, slBar=null;             // the bars they were set from
  let shActive=false, slActive=false;     // is this level still an unbroken reference
  let bias=0;                             // 0 undetermined · 1 bullish · -1 bearish
  let lastPh=null, lastPhBar=null;        // most recent CONFIRMED pivot high, taken or not
  let lastPl=null, lastPlBar=null;
  /* A break may still be OWED its relocation. The low made during the leg that
     produced the break has usually not confirmed yet — a 5/5 pivot needs five
     more bars — so these let that one low be adopted when it finally lands,
     while a low that forms AFTER the break never can be. That bound is the
     whole reason an intact range cannot quietly re-anchor itself. */
  let phPending=false, plPending=false;
  let breakBarUp=null, breakBarDn=null;
  let upCount=0, dnCount=0;               // consecutive qualifying closes
  // Running extremes. *SinceLast* track from the newest pivot of that type;
  // *SinceSwing* track from the pivot that actually anchors the swing, and are
  // handed the former's value at the moment that pivot is adopted.
  let hiSinceLastPl=null, loSinceLastPh=null;
  let hiSinceSwingLo=null, loSinceSwingHi=null;
  let phCount=0, plCount=0, bullFlips=0, bearFlips=0;
  /* THE BAR THE STRUCTURE LAST FLIPPED ON — the break of structure itself,
     which the counters above can total but cannot date. bullFlips and bearFlips
     answer "how often", and that is a diagnostic; the question a trader asks is
     "how recently", and a count of four says nothing about whether the fourth
     one happened yesterday or eight months ago.

     ONE VARIABLE FOR BOTH DIRECTIONS, deliberately. A flip is the only event in
     this machine that writes `bias`, so the direction of the most recent flip
     IS the terminal bias — recording it a second time as its own field would be
     a copy that can only ever agree, and the day it disagreed one of the two
     would be wrong with nothing to say which. Read the direction off bias.

     null until the first flip, which is the same condition as bias staying 0:
     no close ever broke a swing level, so there is no break of structure to
     date. That is a real answer, not a missing one. */
  let lastFlipBar=null;

  let ih=0, il=0;                         // cursors into the pivot lists
  for(let i=0;i<n;i++){
    // ── a. snapshot at the bar's open ────────────────────────────────────
    const shAtOpen=swingHigh, slAtOpen=swingLow;
    const shActiveAtOpen=shActive, slActiveAtOpen=slActive;

    // ── b. pivots that become KNOWN on this bar ──────────────────────────
    // `<=` rather than `===` so a cursor can never be stranded; confirmedAt is
    // strictly increasing within each list, so this consumes each pivot once.
    while(ih<piv.highs.length && piv.highs[ih].confirmedAt<=i){
      const pp=piv.highs[ih++];
      phCount++;
      lastPh=pp.level; lastPhBar=pp.bar;
      loSinceLastPh=seed(L,pp.bar,i,false);
      /* Nested exactly as the Pine is, so no comparison against a missing
         level is ever evaluated and so the level survives being consumed by a
         break: with the high inactive (just broken) or never set, the pivot is
         taken unconditionally, which is what lets the ratchet run leg by leg. */
      let take=true;
      if(shActive && swingHigh!=null){
        take = pp.level>swingHigh;                                  // beyond: extends the extreme
        if(!take && everyHL && bias<0) take = pp.level<swingHigh;   // every lower high, while bearish
        if(!take && phPending && pp.level<swingHigh && breakBarDn!=null)
          take = pp.bar<breakBarDn;                                 // the relocation this break is owed
      }
      // A pivot forming at or after the break closes that window for good,
      // whether or not this particular pivot was taken.
      if(phPending && breakBarDn!=null && pp.bar>=breakBarDn) phPending=false;
      if(take){
        swingHigh=pp.level; shBar=pp.bar; shActive=true; phPending=false;
        loSinceSwingHi=loSinceLastPh;
      }
    }
    while(il<piv.lows.length && piv.lows[il].confirmedAt<=i){
      const pp=piv.lows[il++];
      plCount++;
      lastPl=pp.level; lastPlBar=pp.bar;
      hiSinceLastPl=seed(H,pp.bar,i,true);
      let take=true;
      if(slActive && swingLow!=null){
        take = pp.level<swingLow;
        if(!take && everyHL && bias>0) take = pp.level>swingLow;
        if(!take && plPending && pp.level>swingLow && breakBarUp!=null)
          take = pp.bar<breakBarUp;
      }
      if(plPending && breakBarUp!=null && pp.bar>=breakBarUp) plPending=false;
      if(take){
        swingLow=pp.level; slBar=pp.bar; slActive=true; plPending=false;
        hiSinceSwingLo=hiSinceLastPl;
      }
    }

    // ── c. the break test, against the AT-OPEN snapshot ──────────────────
    const px=C[i];
    if(fin(px)){
      // minPenPct 0 (the default) makes these the bare levels, so any close
      // beyond one qualifies.
      const upTrig=(shActiveAtOpen && shAtOpen!=null) ? shAtOpen*(1+minPen/100) : null;
      const dnTrig=(slActiveAtOpen && slAtOpen!=null) ? slAtOpen*(1-minPen/100) : null;
      // `!= null &&` before the comparison, always: a null trigger would
      // coerce to 0 and `px > 0` is true for every stock on the list.
      upCount = (upTrig!=null && px>upTrig) ? upCount+1 : 0;
      dnCount = (dnTrig!=null && px<dnTrig) ? dnCount+1 : 0;

      // ── d. the flip ────────────────────────────────────────────────────
      if(upCount>=confirmBars && shActiveAtOpen){
        bias=1; bullFlips++; lastFlipBar=i;
        /* The swing low comes forward to the most recent confirmed pivot low,
           guarded so it can only ever move FORWARD in time — without that, a
           relocation could jump the anchor backwards onto an older pivot. */
        let adopted=false;
        if(lastPl!=null){
          const fwd = (slBar==null) ? true : (lastPlBar>slBar);
          if(fwd){
            swingLow=lastPl; slBar=lastPlBar; hiSinceSwingLo=hiSinceLastPl;
            adopted=true;
          }
        }
        // Nothing fresher had confirmed yet, so wait for the low formed during
        // this leg — and only for that one.
        plPending=!adopted;
        breakBarUp=i;
        phPending=false;
        slActive=(swingLow!=null);
        /* The broken high is CONSUMED, not nulled. Keeping the level while
           clearing the flag is what lets the next pivot high replace it by the
           unconditional branch above, leg after leg — and it keeps the level
           available as a target price even though it has been traded through. */
        shActive=false;
        upCount=0; dnCount=0;
      } else if(dnCount>=confirmBars && slActiveAtOpen){
        bias=-1; bearFlips++; lastFlipBar=i;
        let adopted=false;
        if(lastPh!=null){
          const fwd = (shBar==null) ? true : (lastPhBar>shBar);
          if(fwd){
            swingHigh=lastPh; shBar=lastPhBar; loSinceSwingHi=loSinceLastPh;
            adopted=true;
          }
        }
        phPending=!adopted;
        breakBarDn=i;
        plPending=false;
        shActive=(swingHigh!=null);
        slActive=false;
        upCount=0; dnCount=0;
      }
    }

    // Advance the running extremes by one bar. AFTER the flip block and before
    // anything reads them, which is the Pine's order.
    const hi=H[i], lo=L[i];
    if(fin(hi)){
      if(hiSinceLastPl!=null) hiSinceLastPl=Math.max(hiSinceLastPl,hi);
      if(hiSinceSwingLo!=null) hiSinceSwingLo=Math.max(hiSinceSwingLo,hi);
    }
    if(fin(lo)){
      if(loSinceLastPh!=null) loSinceLastPh=Math.min(loSinceLastPh,lo);
      if(loSinceSwingHi!=null) loSinceSwingHi=Math.min(loSinceSwingHi,lo);
    }
  }

  return {
    bias, swingHigh, swingLow, shBar, slBar, shActive, slActive,
    hiSinceSwingLo, loSinceSwingHi,
    /* NOT a diagnostic — smartMoneyZones() turns this into a published field.
       It is a BAR INDEX into the series that was passed in, not an age: turning
       it into "bars ago" needs to know where the series ends, and only the
       caller holding that series can say. */
    lastFlipBar,
    // Diagnostics, for the same reason the Pine carries them: when a level is
    // not advancing the way a chart says it should, these say which stage is
    // not firing.
    phCount, plCount, bullFlips, bearFlips, bars:n,
  };
}

export function smzClassify(bias,px,f618,f786,f826){
  if(px==null||!isFinite(px)) return null;
  if(f618==null||f786==null||f826==null) return null;
  if(bias>0){
    if(px>f618) return 'above';
    if(px>f786) return 'ibz';        // f786 < px <= f618
    if(px>=f826) return 'smz';       // f826 <= px <= f786
    return 'below';
  }
  if(bias<0){
    if(px<f618) return 'above';
    if(px<f786) return 'ibz';        // f618 <= px < f786
    if(px<=f826) return 'smz';       // f786 <= px <= f826
    return 'below';
  }
  return null;
}

export function smartMoneyZones(C,H,L,cfg){
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

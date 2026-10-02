import { percentileRank } from './core.mjs';

function median(xs){
  const v=xs.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length)return null;
  const i=Math.floor(v.length/2);
  return v.length%2?v[i]:(v[i-1]+v[i])/2;
}
function pctPositive(xs){const v=xs.filter(Number.isFinite);return v.length?100*v.filter(x=>x>0).length/v.length:null}
function pctImproving(xs){const v=xs.filter(x=>Number.isFinite(x.rs21)&&Number.isFinite(x.rs55));return v.length?100*v.filter(x=>x.rs21>x.rs55).length/v.length:null}
function pctAbove50(xs){const v=xs.map(x=>x.derived?.pct50e).filter(Number.isFinite);return v.length?100*v.filter(x=>x>=0).length/v.length:null}
function stateFor(rsRank,momRank){
  if(rsRank==null||momRank==null)return 'Unclassified';
  if(rsRank>=50&&momRank>=50)return 'Powering Up';
  if(rsRank<50&&momRank>=50)return 'Turning Up';
  if(rsRank>=50&&momRank<50)return 'Cooling';
  return 'Falling Back';
}
function tierFor(flow){if(flow>=75)return 'A';if(flow>=60)return 'B';if(flow>=45)return 'C';return 'D'}

export function buildGroupRows(securities,{level='sector',minMembers=3}={}){
  const groups=new Map();
  const field=level==='macro'?'macro_economic_sector':level;
  for(const s of securities||[]){
    if(s?.screenEligible===false)continue;
    const key=String(s?.[field]??'').trim();
    if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(s);
  }
  const prelim=[...groups.entries()].map(([name,stocks])=>{
    const rs55=stocks.map(s=>s.derived?.rs55).filter(Number.isFinite);
    const rs21=stocks.map(s=>s.derived?.rs21).filter(Number.isFinite);
    const rs10w=stocks.map(s=>s.derived?.rs10w).filter(Number.isFinite);
    const early=stocks.map(s=>s.early?.score).filter(Number.isFinite);
    const rsLevel=median(rs55);
    const rsMomentum=median(rs21);
    const longRs=median(rs10w);
    const direction=rsLevel!=null&&rsMomentum!=null?rsMomentum-rsLevel:null;
    const acceleration=direction!=null&&longRs!=null?direction-(rsLevel-longRs):null;
    return {name,members:stocks.length,rsLevel,rsMomentum,longRs,direction,acceleration,positiveRsPct:pctPositive(rs55),improvingRsPct:pctImproving(stocks),above50Pct:pctAbove50(stocks),earlyPct:early.length?100*early.filter(x=>x>=60).length/early.length:null,stocks};
  }).filter(x=>x.members>=minMembers);
  const rsVals=prelim.map(x=>x.rsLevel).filter(Number.isFinite);
  const momVals=prelim.map(x=>x.direction).filter(Number.isFinite);
  const accVals=prelim.map(x=>x.acceleration).filter(Number.isFinite);
  return prelim.map(g=>{
    const rsRank=percentileRank(rsVals,g.rsLevel);
    const momRank=percentileRank(momVals,g.direction);
    const accRank=percentileRank(accVals,g.acceleration);
    const breadth=(
      (g.positiveRsPct??50)*0.40+
      (g.improvingRsPct??50)*0.30+
      (g.above50Pct??50)*0.20+
      (g.earlyPct??50)*0.10
    );
    const flow=(
      (rsRank??50)*0.50+
      (momRank??50)*0.25+
      (accRank??50)*0.10+
      (g.earlyPct??50)*0.15
    );
    const persistenceBucket=flow>=75?'Established':flow>=60?'Developing':flow>=45?'Watching':'Weak';
    return {
      name:g.name,members:g.members,rsLevel:g.rsLevel,rsMomentum:g.rsMomentum,longRs:g.longRs,
      direction:g.direction,acceleration:g.acceleration,rsRank,momentumRank:momRank,accelRank:accRank,
      leadershipBreadth:+breadth.toFixed(2),flow:+flow.toFixed(2),
      state:stateFor(rsRank,momRank),tier:tierFor(flow),persistenceBucket,
      positiveRsPct:g.positiveRsPct,improvingRsPct:g.improvingRsPct,above50Pct:g.above50Pct,earlyPct:g.earlyPct
    };
  }).sort((a,b)=>b.flow-a.flow||b.rsLevel-a.rsLevel||a.name.localeCompare(b.name));
}

export function buildHierarchy(securities){
  return {
    macro:buildGroupRows(securities,{level:'macro_economic_sector'}),
    sector:buildGroupRows(securities,{level:'sector'}),
    industry:buildGroupRows(securities,{level:'industry'})
  };
}

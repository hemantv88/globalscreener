import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT=process.env.GS_ROOT?path.resolve(process.env.GS_ROOT):path.resolve(process.cwd(),'..');
const state=JSON.parse(await fs.readFile(path.join(ROOT,'state','IN.raw.json'),'utf8'));
const snap=JSON.parse(await fs.readFile(path.join(ROOT,'public','data','IN.json'),'utf8'));
const target=Number(process.env.MIN_TARGET_SESSIONS||300), minUniverse=Number(process.env.MIN_UNIVERSE||1000), minMedian=Number(process.env.MIN_MEDIAN_HISTORY||250), requireBench=true;
const securities=state.securities||[]; if(!securities.length)throw new Error('No India securities');
if(snap.market!=='IN')throw new Error('Snapshot market mismatch');
if(Number(snap.universe)!==securities.length)throw new Error('Snapshot/state universe mismatch');
if(snap.benchmark_for_rs && !Object.prototype.hasOwnProperty.call(state.benchmarks,snap.benchmark_for_rs))throw new Error('Snapshot benchmark missing from state');
const lens=securities.map(s=>(s.daily||[]).length); lens.sort((a,b)=>a-b); const median=lens.length?(lens.length%2?lens[(lens.length-1)/2]:(lens[lens.length/2-1]+lens[lens.length/2])/2):0;
let bad=0,dup=0,invalid=0,negVol=0,badDelivery=0,missingClose=0,overlapShort=0; const latest=[];
for(const s of securities){const seen=new Set();let prev='';for(const b of s.daily||[]){if(seen.has(b.date))dup++;seen.add(b.date);if(prev&&b.date<prev)bad++;prev=b.date;const o=Number(b.o),h=Number(b.h),l=Number(b.l),c=Number(b.c),v=Number(b.v);if(!Number.isFinite(c))missingClose++;if([o,h,l,c].every(Number.isFinite)&& (h<Math.max(o,c,l)||l>Math.min(o,c,h)))invalid++;if(Number.isFinite(v)&&v<0)negVol++;if(b.delivery!=null&&(!Number.isFinite(Number(b.delivery))||Number(b.delivery)<0||Number(b.delivery)>100))badDelivery++;}if((s.daily||[]).length>=250)latest.push(s.daily.at(-1)?.date)}
const benchmarks=state.benchmarks||{};if(!benchmarks['NIFTY 500']&&!benchmarks['NIFTY 50'])throw new Error('NIFTY benchmark missing');
const benchmark=benchmarks['NIFTY 500']||benchmarks['NIFTY 50'];
const benchmarkBars=benchmark.daily||[];
const benchmarkLatest=benchmarkBars.at(-1)?.date||null;
const maxSession=state.sessions_on_file ? (state.sessions_on_file>=1 ? securities.flatMap(s=>(s.daily||[]).map(b=>b.date)).sort().at(-1) : null) : null;
if(benchmarkBars.length < minMedian) throw new Error(`Benchmark history too short: ${benchmarkBars.length} < ${minMedian}`);
if(benchmarkLatest && maxSession && benchmarkLatest !== maxSession) throw new Error(`Benchmark latest date ${benchmarkLatest} does not match security latest date ${maxSession}`);
for(const s of securities){if((s.daily||[]).length>=250){const bm=benchmarks['NIFTY 500']||benchmarks['NIFTY 50'];const bset=new Set((bm.daily||[]).map(x=>x.date));const overlap=(s.daily||[]).filter(x=>bset.has(x.date)).length;if(overlap<200)overlapShort++}}
const report={ok:state.sessions_on_file>=target&&securities.length>=minUniverse&&median>=minMedian&&benchmarkBars.length>=minMedian&&dup===0&&invalid===0&&negVol===0&&badDelivery===0&&overlapShort===0,market:'IN',target_sessions:target,sessions_on_file:state.sessions_on_file,universe:securities.length,history:{min_bars:lens[0],median_bars:median,max_bars:lens.at(-1),securities_ge_200:securities.filter(s=>s.daily.length>=200).length,securities_ge_250:securities.filter(s=>s.daily.length>=250).length,securities_ge_300:securities.filter(s=>s.daily.length>=300).length},benchmarks:Object.fromEntries(Object.entries(benchmarks).map(([k,v])=>[k,v.daily?.length||0])),integrity:{duplicate_dates:dup,out_of_order_bars:bad,invalid_ohlc:invalid,negative_volume:negVol,bad_delivery_pct:badDelivery,missing_close:missingClose,securities_with_short_benchmark_overlap:overlapShort},coverage:{delivery_pct:securities.length?+(securities.reduce((n,s)=>n+(s.daily||[]).reduce((m,b)=>m+(b.delivery!=null?1:0),0),0)/Math.max(1,securities.reduce((n,s)=>n+(s.daily||[]).length,0))*100).toFixed(2):0},
  adjustments:snap.adjustment_summary,latest_trade_date:snap.latest_trade_date};
await fs.mkdir(path.join(ROOT,'test-output'),{recursive:true});await fs.writeFile(path.join(ROOT,'test-output','india-validation-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.ok)process.exit(1);

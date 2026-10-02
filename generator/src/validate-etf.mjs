import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT=process.env.GS_ROOT?path.resolve(process.env.GS_ROOT):path.resolve(process.cwd(),'..');
const raw=JSON.parse(await fs.readFile(path.join(ROOT,'state','ETF.raw.json'),'utf8'));
const snap=JSON.parse(await fs.readFile(path.join(ROOT,'public','data','ETF.json'),'utf8'));
const target=Number(process.env.MIN_TARGET_SESSIONS||300);
const req=raw.requested_symbols||[], secs=raw.securities||[];
if(secs.length!==req.length) throw new Error('Missing requested ETF symbols: '+req.filter(x=>!new Set(secs.map(s=>s.ticker)).has(x)).join(', '));
const bm=raw.benchmarks?.SPY?.daily||[];
if(bm.length<target) throw new Error('SPY benchmark history too short: '+bm.length);
const lens=secs.map(s=>(s.daily||[]).length).sort((a,b)=>a-b);
const median=lens.length?(lens.length%2?lens[(lens.length-1)/2]:(lens[lens.length/2-1]+lens[lens.length/2])/2):0;
let dup=0,order=0,invalid=0,negVol=0,missingClose=0,shortOverlap=0;
const bset=new Set(bm.map(x=>x.date));
for(const s of secs){
 const seen=new Set();let prev='';
 for(const b of s.daily||[]){if(seen.has(b.date))dup++;seen.add(b.date);if(prev&&b.date<=prev)order++;prev=b.date;
 const o=+b.o,h=+b.h,l=+b.l,c=+b.c,v=+b.v;if(!Number.isFinite(c))missingClose++;if([o,h,l,c].every(Number.isFinite)&&(h<Math.max(o,c,l)||l>Math.min(o,c,h)))invalid++;if(Number.isFinite(v)&&v<0)negVol++;}
 if((s.daily||[]).length>=50&&(s.daily||[]).filter(x=>bset.has(x.date)).length<50)shortOverlap++;
}
const report={ok:secs.length===req.length&&median>=target&&dup===0&&order===0&&invalid===0&&negVol===0&&missingClose===0&&shortOverlap===0,market:'ETF',target_sessions:target,requested_symbols:req.length,received_symbols:secs.length,missing_symbols:[],history:{min_bars:lens[0],median_bars:median,max_bars:lens.at(-1),securities_ge_200:secs.filter(s=>s.daily.length>=200).length,securities_ge_250:secs.filter(s=>s.daily.length>=250).length,securities_ge_300:secs.filter(s=>s.daily.length>=300).length},benchmark:{SPY:bm.length,latest:bm.at(-1)?.date||null},integrity:{duplicate_dates:dup,out_of_order_or_duplicate_order:order,invalid_ohlc:invalid,negative_volume:negVol,missing_close:missingClose,securities_with_short_benchmark_overlap:shortOverlap},split_tickers:Object.keys(raw.split_ledger||{}).length,latest_trade_date:snap.latest_trade_date};
await fs.mkdir(path.join(ROOT,'test-output'),{recursive:true});await fs.writeFile(path.join(ROOT,'test-output','etf-validation-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.ok)process.exit(1);

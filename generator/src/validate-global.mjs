import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT=process.env.GS_ROOT?path.resolve(process.env.GS_ROOT):path.resolve(process.cwd(),'..');
const x=JSON.parse(await fs.readFile(path.join(ROOT,'public','data','GLOBAL.json'),'utf8'));
const required=['IN','US','ETF'];
for(const m of required) if(!x.markets?.[m]) throw new Error('Missing market '+m);
const dates=required.map(m=>x.markets[m].latest_trade_date);
if(new Set(dates).size!==1) throw new Error('Market latest dates are not aligned: '+dates.join(', '));
let total=0;const report={market_counts:{}};
for(const m of required){
 const data=x.markets[m], secs=data.securities||[], seen=new Set(), duplicateSyms=[];
 for(const s of secs){
   if(!s.sym) throw new Error(m+': security without symbol');
   const key=m+':'+s.sym;
   if(seen.has(key)) duplicateSyms.push(s.sym);
   seen.add(key);
   if(!s.derived || !('rs21' in s.derived) || !('rs55' in s.derived)) throw new Error(m+': missing derived RS for '+s.sym);
   if(s.derived.updated!==data.latest_trade_date) throw new Error(m+': stale derived date for '+s.sym);
 }
 if(duplicateSyms.length) throw new Error(m+': duplicate symbols '+duplicateSyms.join(', '));
 total+=secs.length;
 report.market_counts[m]={universe:data.universe,securities:secs.length,latest_trade_date:data.latest_trade_date,benchmark:data.benchmark_for_rs,duplicate_symbols:0};
}
report.ok=true;report.total_securities=total;report.latest_trade_date=x.latest_trade_date;report.identity_key=x.schema?.identity_key;
await fs.mkdir(path.join(ROOT,'test-output'),{recursive:true});
await fs.writeFile(path.join(ROOT,'test-output','global-validation-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

import fs from 'node:fs/promises';
import path from 'node:path';
const ROOT=process.env.GS_ROOT?path.resolve(process.env.GS_ROOT):path.resolve(process.cwd(),'..');
const specs=[['IN','IN.json'],['US','US.json'],['ETF','ETF.json']];
const markets={};
for(const [market,file] of specs){
  const p=path.join(ROOT,'public','data',file);
  const d=JSON.parse(await fs.readFile(p,'utf8'));
  if(d.market!==market) throw new Error(`Market mismatch in ${file}: ${d.market}`);
  if(!Array.isArray(d.securities)) throw new Error(`Missing securities in ${file}`);
  markets[market]=d;
}
const latestDates=[...new Set(Object.values(markets).map(m=>m.latest_trade_date).filter(Boolean))];
const combined={
  version:'gsde-global-v1',
  generated:new Date().toISOString(),
  latest_trade_date:latestDates.length===1?latestDates[0]:null,
  markets:{
    IN:markets.IN,
    US:markets.US,
    ETF:markets.ETF
  },
  market_status:Object.fromEntries(Object.entries(markets).map(([k,m])=>[k,{
    latest_trade_date:m.latest_trade_date,
    universe:m.universe,
    requested_universe:m.requested_universe??null,
    benchmark_for_rs:m.benchmark_for_rs??null
  }])),
  schema:{
    identity_key:'market:sym',
    independent_market_namespaces:true,
    benchmark_relative_rs:true
  }
};
if(!combined.latest_trade_date) throw new Error('Markets do not share a valid common latest trade date');
await fs.mkdir(path.join(ROOT,'public','data'),{recursive:true});
await fs.mkdir(path.join(ROOT,'test-output'),{recursive:true});
await fs.writeFile(path.join(ROOT,'public','data','GLOBAL.json'),JSON.stringify(combined));
await fs.writeFile(path.join(ROOT,'public','data','manifest-GLOBAL.json'),JSON.stringify({
  version:'gsde-global-v1',
  generated:combined.generated,
  latest_trade_date:combined.latest_trade_date,
  markets:Object.fromEntries(Object.entries(markets).map(([k,m])=>[k,{universe:m.universe,latest_trade_date:m.latest_trade_date,benchmark_for_rs:m.benchmark_for_rs}]))
}));
console.log(JSON.stringify({
  version:combined.version,
  latest_trade_date:combined.latest_trade_date,
  markets:Object.fromEntries(Object.entries(markets).map(([k,m])=>[k,{universe:m.universe,latest_trade_date:m.latest_trade_date}])),
  identity_key:combined.schema.identity_key
},null,2));

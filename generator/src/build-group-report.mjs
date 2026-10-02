import fs from 'node:fs/promises';
import path from 'node:path';
import { buildHierarchy } from './group-analytics.mjs';

const ROOT=process.env.GS_ROOT?path.resolve(process.env.GS_ROOT):path.resolve(process.cwd(),'..');
const [i,u,e]=await Promise.all([
  fs.readFile(path.join(ROOT,'public','data','IN.json'),'utf8'),
  fs.readFile(path.join(ROOT,'public','data','US.json'),'utf8'),
  fs.readFile(path.join(ROOT,'public','data','ETF.json'),'utf8')
]);
const markets={IN:JSON.parse(i),US:JSON.parse(u),ETF:JSON.parse(e)};
const out={version:'gs-groups-v1',generated:new Date().toISOString(),markets:{}};
for(const [m,data] of Object.entries(markets)){
  const hierarchy=buildHierarchy(data.securities||[]);
  const mapped=(data.securities||[]).filter(s=>s.mapping_status==='verified').length;
  const unmapped=(data.securities||[]).filter(s=>(s.mapping_status||'unmapped')==='unmapped').length;
  out.markets[m]={
    latest_trade_date:data.latest_trade_date,
    classification_coverage:{verified:mapped,unmapped},
    hierarchy
  };
}
await fs.mkdir(path.join(ROOT,'public','data'),{recursive:true});
await fs.mkdir(path.join(ROOT,'test-output'),{recursive:true});
await fs.writeFile(path.join(ROOT,'public','data','GROUPS.json'),JSON.stringify(out));
await fs.writeFile(path.join(ROOT,'test-output','group-analytics-report.json'),JSON.stringify({
  ok:true,version:out.version,markets:Object.fromEntries(Object.entries(out.markets).map(([m,x])=>[m,{latest_trade_date:x.latest_trade_date,verified:x.classification_coverage.verified,unmapped:x.classification_coverage.unmapped,sector_groups:x.hierarchy.sector.length,industry_groups:x.hierarchy.industry.length}]))
},null,2));
console.log(JSON.stringify(out.markets,Object.fromEntries?Object.entries(out.markets):out.markets,null,2));

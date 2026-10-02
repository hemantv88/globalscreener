import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repo=path.resolve(process.cwd(),'..');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gs-api-snapshot-'));
await fs.mkdir(path.join(tmp,'state'),{recursive:true});

const raw={
  version:'gsde-raw-v2.1',
  market:'IN',
  end_date:'2026-10-01',
  securities:[
    {ticker:'RELIANCE',daily:[
      {date:'2026-09-30',o:100,h:102,l:99,c:101,v:1000},
      {date:'2026-10-01',o:101,h:103,l:100,c:102,v:1200}
    ]},
    {ticker:'HDFCSML250',daily:[
      {date:'2026-09-30',o:200,h:202,l:199,c:201,v:500},
      {date:'2026-10-01',o:201,h:203,l:200,c:202,v:600}
    ]}
  ]
};
await fs.writeFile(path.join(tmp,'state','IN.raw.json'),JSON.stringify(raw));
await fs.writeFile(path.join(tmp,'state','US.raw.json'),JSON.stringify({version:'gsde-us-v1',market:'US',end_date:'2026-10-01',securities:[
  {ticker:'SPY',daily:[{date:'2026-10-01',o:1,h:2,l:0.5,c:1.5,v:100}]}
]}));
await fs.writeFile(path.join(tmp,'state','ETF.raw.json'),JSON.stringify({version:'gsde-etf-v1',market:'ETF',end_date:'2026-10-01',securities:[
  {ticker:'QQQ',daily:[{date:'2026-10-01',o:3,h:4,l:2,c:3.5,v:200}]}
]}));

const r=spawnSync('node',[path.join(repo,'generator','src','build-api-snapshots.mjs')],{
  cwd:path.join(repo,'generator'),
  env:{...process.env,GS_ROOT:tmp,API_OUT_DIR:'api-staging'},
  encoding:'utf8'
});
assert.equal(r.status,0,r.stderr||r.stdout);

const inApi=JSON.parse(await fs.readFile(path.join(tmp,'api-staging','IN.sm1.json'),'utf8'));
assert.equal(inApi.shape,'sm1');
assert.equal(inApi.region,'India');
assert.ok(inApi.tickers.includes('RELIANCE.NS'));
assert.ok(inApi.tickers.includes('HDFCSML250.NS'));
assert.equal(inApi.dates.length,2);
assert.equal(inApi.series.length,2);

const usApi=JSON.parse(await fs.readFile(path.join(tmp,'api-staging','US.sm1.json'),'utf8'));
assert.deepEqual(usApi.tickers,['SPY']);

const etfApi=JSON.parse(await fs.readFile(path.join(tmp,'api-staging','ETF.sm1.json'),'utf8'));
assert.deepEqual(etfApi.tickers,['QQQ']);

await fs.rm(tmp,{recursive:true,force:true});
console.log('PASS server API compact snapshot builder');

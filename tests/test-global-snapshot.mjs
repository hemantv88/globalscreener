import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const repo=path.resolve(process.cwd(),'..'), gen=path.join(repo,'generator'), tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gs-global-'));
const stock=(sym,market,latest)=>({sym,nm:sym,derived:{rs21:1,rs55:2,updated:latest},c:[100,101],v:[1000,1100]});
const mk=(market,file,symbols)=>({version:'test',generated:'2026-10-02T00:00:00Z',market,latest_trade_date:'2026-10-01',universe:symbols.length,benchmark_for_rs:market==='ETF'?'SPY':market==='US'?'SPY':'NIFTY 500',securities:symbols.map(s=>stock(s,market,'2026-10-01'))});
try{
 await fs.mkdir(path.join(tmp,'public','data'),{recursive:true});
 await fs.writeFile(path.join(tmp,'public','data','IN.json'),JSON.stringify(mk('IN','IN.json',['RELIANCE','TCS'])));
 await fs.writeFile(path.join(tmp,'public','data','US.json'),JSON.stringify(mk('US','US.json',['AAPL','SPY'])));
 await fs.writeFile(path.join(tmp,'public','data','ETF.json'),JSON.stringify(mk('ETF','ETF.json',['SPY','QQQ'])));
 let r=spawnSync('node',[path.join(gen,'src','build-global.mjs')],{cwd:gen,env:{...process.env,GS_ROOT:tmp},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const g=JSON.parse(await fs.readFile(path.join(tmp,'public','data','GLOBAL.json'),'utf8'));
 assert.equal(g.version,'gsde-global-v1');assert.equal(g.latest_trade_date,'2026-10-01');
 assert.equal(g.markets.IN.securities.length,2);assert.equal(g.markets.US.securities.length,2);assert.equal(g.markets.ETF.securities.length,2);
 assert.equal(g.schema.identity_key,'market:sym');assert.equal(g.markets.US.securities[1].sym,'SPY');assert.equal(g.markets.ETF.securities[0].sym,'SPY');
 r=spawnSync('node',[path.join(gen,'src','validate-global.mjs')],{cwd:gen,env:{...process.env,GS_ROOT:tmp},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const v=JSON.parse(await fs.readFile(path.join(tmp,'test-output','global-validation-report.json'),'utf8'));
 assert.equal(v.ok,true);assert.equal(v.total_securities,6);
 console.log('PASS combined market snapshot + validation');
}finally{await fs.rm(tmp,{recursive:true,force:true});}

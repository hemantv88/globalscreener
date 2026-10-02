import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const generatorDir=path.resolve(process.cwd()), repoDir=path.resolve(generatorDir,'..'), tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gs-etf-'));
const iso=i=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
const bars=(base,step)=>Array.from({length:300},(_,i)=>({date:iso(i),o:base+i*step-1,h:base+i*step+1,l:base+i*step-2,c:base+i*step,v:1000+i}));
const bench=bars(100,.1);
const raw={version:'gsde-etf-v1',market:'ETF',target_sessions:300,requested_symbols:['SPY','QQQ','GLD'],securities:[{ticker:'SPY',daily:bench},{ticker:'QQQ',daily:bars(200,.2)},{ticker:'GLD',daily:bars(150,.05)}],benchmarks:{SPY:{name:'SPY',daily:bench}},split_ledger:{}};
try{
 await fs.mkdir(path.join(tmp,'state'),{recursive:true});
 await fs.writeFile(path.join(tmp,'state','ETF.raw.json'),JSON.stringify(raw));
 let r=spawnSync('node',[path.join(repoDir,'generator','src','build-etf-snapshot.mjs')],{cwd:generatorDir,env:{...process.env,GS_ROOT:tmp},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const s=JSON.parse(await fs.readFile(path.join(tmp,'public','data','ETF.json'),'utf8'));
 assert.equal(s.universe,3);assert.equal(s.benchmark_for_rs,'SPY');assert.ok(Number.isFinite(s.securities.find(x=>x.sym==='QQQ').derived.rs55));
 r=spawnSync('node',[path.join(repoDir,'generator','src','validate-etf.mjs')],{cwd:generatorDir,env:{...process.env,GS_ROOT:tmp,MIN_TARGET_SESSIONS:'300'},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const rep=JSON.parse(await fs.readFile(path.join(tmp,'test-output','etf-validation-report.json'),'utf8'));
 assert.equal(rep.ok,true);assert.equal(rep.history.median_bars,300);assert.equal(rep.benchmark.SPY,300);
 console.log('PASS ETF snapshot + validation end-to-end fixture');
}finally{await fs.rm(tmp,{recursive:true,force:true});}

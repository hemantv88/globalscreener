import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const generatorDir=path.resolve(process.cwd());
const repoDir=path.resolve(generatorDir,'..');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gs-us-snapshot-'));
const iso=i=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
const bars=(base,step)=>Array.from({length:300},(_,i)=>({date:iso(i),o:base+i*step-1,h:base+i*step+1,l:base+i*step-2,c:base+i*step,v:1000+i}));
const bench=bars(100,0.1);
const raw={version:'gsde-us-v1',market:'US',target_sessions:300,requested_symbols:['AAA','SPY'],securities:[{ticker:'AAA',daily:bars(50,0.2)},{ticker:'SPY',daily:bench}],benchmarks:{SPY:{name:'SPY',daily:bench}},split_ledger:{AAA:[['2025-02-01',0.5]]}};
try {
 await fs.mkdir(path.join(tmp,'state'),{recursive:true});
 await fs.writeFile(path.join(tmp,'state','US.raw.json'),JSON.stringify(raw));
 let r=spawnSync('node',[path.join(repoDir,'generator','src','build-us-snapshot.mjs')],{cwd:generatorDir,env:{...process.env,GS_ROOT:tmp},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const snap=JSON.parse(await fs.readFile(path.join(tmp,'public','data','US.json'),'utf8'));
 assert.equal(snap.universe,2); assert.equal(snap.benchmark_for_rs,'SPY'); assert.equal(snap.split_tickers,1);
 assert.ok(Number.isFinite(snap.securities[0].derived.rs55));
 r=spawnSync('node',[path.join(repoDir,'generator','src','validate-us.mjs')],{cwd:generatorDir,env:{...process.env,GS_ROOT:tmp,MIN_TARGET_SESSIONS:'300'},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const rep=JSON.parse(await fs.readFile(path.join(tmp,'test-output','us-validation-report.json'),'utf8'));
 assert.equal(rep.ok,true); assert.equal(rep.history.median_bars,300); assert.equal(rep.received_symbols,2);
 console.log('PASS US snapshot + validation end-to-end fixture');
} finally { await fs.rm(tmp,{recursive:true,force:true}); }
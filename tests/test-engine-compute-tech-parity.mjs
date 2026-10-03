import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { computeTech } from '../generator/src/engine/frontend-compute-tech.mjs';

const html=fs.readFileSync(path.resolve(new URL('../index.html',import.meta.url).pathname),'utf8');

function extractFunction(source,name){
  const re=new RegExp('\\bfunction\\s+'+name+'\\s*\\(');
  const m=re.exec(source); assert.ok(m,'baseline function not found: '+name);
  const start=m.index,brace=source.indexOf('{',start); assert.ok(brace>=0);
  let depth=0,inString=null,escaped=false,line=false,block=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(line){if(ch==='\n')line=false;continue}
    if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue}
    if(inString){if(escaped){escaped=false;continue}if(ch==='\\'){escaped=true;continue}if(ch===inString)inString=null;continue}
    if(ch==="'"||ch==='"'||ch==='\`'){inString=ch;continue}
    if(ch==='/'&&next==='/'){line=true;i++;continue}
    if(ch==='/'&&next==='*'){block=true;i++;continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  assert.fail('unclosed function: '+name);
}

const allNames=[...new Set([...html.matchAll(/\\bfunction\\s+([A-Za-z_$][\\w$]*)\\s*\\(/g)].map(m=>m[1]))];
const source=allNames.map(n=>extractFunction(html,n)).join('\n\n');

const sandbox={
  console,Number,Math,Array,Object,String,Date,Map,Set,WeakMap,
  isFinite,Infinity,NaN,performance:{now:()=>0},
  WK_MONDAY:new Map(),WK_SUNDAY:new Map(),
  BO_LOOKBACK:52,H52_MIN_BARS:120,H52_WIN:252,
  VOL_SPIKE_WIN:10,VOL_SPIKE_MULT:1.5,
  THRUST_MIN_BARS:22,AVG_VAL_BARS:20,ADR_WIN:20,TIGHT_WIN:3,COIL_WIN:20,
  SETUP_AGE_MAX:30,
  RSI_MA_PERIOD:14,RSI_MA_MIN_RSI_VALUES:30,RSI_MA_MIN_CLOSES:45,
  VCP_MAX_BASE:120,VCP_RUN_WIN:60,VCP_PRIOR_RUN:25,VCP_PIVOT_K:3,
  VCP_MIN_LEGS:2,VCP_MAX_LEGS:4,VCP_MAX_DEPTH:35,VCP_FINAL_DEPTH:12,
  VCP_LEG_TOL:1.10,VCP_CONTRACT_RATIO:0.60,VCP_VOL_DRY:0.75,
  VCP_VOL_TAIL:5,VCP_BO_AGE:5,VCP_BO_VOL:1.5,VCP_PIVOT_ZONE:2,
  IPO_MIN_BASE:15,IPO_MAX_BASE:90,IPO_MAX_BARS:250,IPO_MAX_DEPTH:35,IPO_MIN_BARS:40,
  MOMO_VOL_RATIO_CAP:99,SMZ_MIN_BARS:60,
  CFG:{
    XOVER:{fast:10,slow:20},
    CONSOL:{lookback:20,maxRangePct:10},
    DARVAS:{boxp:5,nearPct:1.0},
    SMZ:{pivotLeft:5,pivotRight:5,confirmBars:1,minPenPct:0,advanceMode:'break'},
    MOMO:{lookback:42,minMovePct:40,minVolRatio:1.0,minAbovePct:80,minBaseBars:8,maxBaseDepth:25},
    THRUST:{win:10}
  }
};
vm.runInNewContext(source,sandbox,{filename:'index.html:all-function-oracle'});

const n=240;
const dates=Array.from({length:n},(_,i)=>{
  const d=new Date(Date.UTC(2026,0,1+i));
  return d.toISOString().slice(0,10);
});
const C=Array.from({length:n},(_,i)=>100 + i*0.28 + Math.sin(i/4)*2.4 + (i%23===0?3:0));
const H=C.map((x,i)=>x+1.8+(i%11===0?0.7:0));
const L=C.map((x,i)=>x-1.5-(i%17===0?0.5:0));
const V=Array.from({length:n},(_,i)=>5000+(i%13)*180+i*12);
const O=C.map((x,i)=>x+(i%2?0.25:-0.25));
const cfg=structuredClone(sandbox.CFG);

const expected=sandbox.computeTech(C,H,L,V,dates,'TEST.NS',O,'2026-01-01',);
const actual=computeTech(C,H,L,V,dates,'TEST.NS',O,'2026-01-01',cfg);
assert.equal(JSON.stringify(actual),JSON.stringify(expected),'computeTech output diverged from index.html baseline');

const shortC=[100,101,102];
const shortDates=['2026-01-01','2026-01-02','2026-01-03'];
assert.equal(JSON.stringify(computeTech(shortC,[101,102,103],[99,100,101],[1000,1100,1200],shortDates,'SHORT.NS',null,null,cfg)),
             JSON.stringify(sandbox.computeTech(shortC,[101,102,103],[99,100,101],[1000,1100,1200],shortDates,'SHORT.NS',null,null)),
             'short-history computeTech output diverged');

console.log('PASS computeTech row assembly parity vs index.html baseline');

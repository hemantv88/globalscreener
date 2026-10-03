import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { emaSeries } from '../generator/src/engine/frontend-foundation.mjs';
import * as engine from '../generator/src/engine/frontend-pattern-engine.mjs';

const html = fs.readFileSync(path.resolve(new URL('../index.html', import.meta.url).pathname), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('\\bfunction\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'baseline function not found: ' + name);
  const start = m.index, brace = source.indexOf('{', start);
  assert.ok(brace >= 0, 'opening brace not found: ' + name);
  let depth = 0, inString = null, escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (line) { if (ch === '\n') line = false; continue; }
    if (block) { if (ch === '*' && next === '/') { block = false; i++; } continue; }
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '\`') { inString = ch; continue; }
    if (ch === '/' && next === '/') { line = true; i++; continue; }
    if (ch === '/' && next === '*') { block = true; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail('unclosed function: ' + name);
}

const names = [
  'vcpPivots','vcpContractions','vcpDetect','ipoBase','momentumBase',
  'smzPivots','smzStructure','smzClassify','smartMoneyZones'
];
const sandbox = {
  console, Number, Math, Array, Object, String, Date, Map, WeakMap,
  isFinite, Infinity, NaN,
  VCP_MAX_BASE:120, VCP_RUN_WIN:60, VCP_PRIOR_RUN:25, VCP_PIVOT_K:3,
  VCP_MIN_LEGS:2, VCP_MAX_LEGS:4, VCP_MAX_DEPTH:35, VCP_FINAL_DEPTH:12,
  VCP_LEG_TOL:1.10, VCP_CONTRACT_RATIO:0.60, VCP_VOL_DRY:0.75,
  VCP_VOL_TAIL:5, VCP_PIVOT_ZONE:2, VCP_BO_AGE:5, VCP_BO_VOL:1.5,
  IPO_MIN_BASE:15, IPO_MAX_BASE:90, IPO_MAX_DEPTH:35, IPO_MIN_BARS:40, IPO_MAX_BARS:250,
  MOMO_VOL_RATIO_CAP:99, SMZ_MIN_BARS:60,
  volAvg20(V,end){
    const e=(end==null?((V&&V.length)||0):end);
    let sum=0,cnt=0;
    for(let i=Math.max(0,e-21);i<e-1;i++){ const v=V[i]; if(v>0){ sum+=v; cnt++; } }
    return cnt?sum/cnt:0;
  }
};
vm.runInNewContext(names.map(name => extractFunction(html, name)).join('\n\n'), sandbox, {
  filename: 'index.html:pattern-oracle'
});

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, comparable(v)]));
  return value;
}
function assertSame(name, ...args) {
  const expected = comparable(sandbox[name](...args));
  const actual = comparable(engine[name](...args));
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), name + ' diverged from index.html baseline');
}

const n = 240;
const C = Array.from({length:n}, (_,i) => 100 + i*0.42 + Math.sin(i/4)*2.5);
const H = C.map((x,i) => x + 2 + (i%13===0 ? 1 : 0));
const L = C.map((x,i) => x - 2 - (i%17===0 ? 0.8 : 0));
const V = Array.from({length:n}, (_,i) => 5000 + (i%11)*220 + i*15);
const dates = Array.from({length:n}, (_,i) => {
  const d = new Date(Date.UTC(2025, 11, 1+i));
  return d.toISOString().slice(0,10);
});

for (const K of [1,2,3,4]) assertSame('vcpPivots', H,L,K);

const piv = sandbox.vcpPivots(H,L,3);
assertSame('vcpContractions', H,L,150,120,piv,239);
assertSame('vcpContractions', H,L,180,90,piv,220);

for (const e50 of [null, 100, C.at(-1)+1, C.at(-1)-1]) {
  assertSame('vcpDetect', C,H,L,V,e50,emaSeries(C,200).at(-1));
}

assertSame('ipoBase', C,H,L,V,dates,'2025-11-15');
assertSame('ipoBase', C.slice(-80),H.slice(-80),L.slice(-80),V.slice(-80),dates.slice(-80),'2025-11-15');
assertSame('ipoBase', C.slice(-50),H.slice(-50),L.slice(-50),V.slice(-50),dates.slice(-50),'2025-01-01');

const ema20 = emaSeries(C,20);
for (const cfg of [
  {lookback:60,minMovePct:20,minVolRatio:1.2,minAbovePct:70,minBaseBars:8,maxBaseDepth:25},
  {lookback:80,minMovePct:40,minVolRatio:1.5,minAbovePct:80,minBaseBars:12,maxBaseDepth:20},
  {lookback:30,minMovePct:10,minVolRatio:1,minAbovePct:50,minBaseBars:5,maxBaseDepth:40}
]) {
  assertSame('momentumBase',C,H,L,V,dates,ema20,cfg);
}
assertSame('momentumBase',[100,101,102],[101,102,103],[99,100,101],[1000,1100,1200],['2026-01-01','2026-01-02','2026-01-03'],[null,null,101],{lookback:60,minMovePct:20,minVolRatio:1.2,minAbovePct:70,minBaseBars:8,maxBaseDepth:25});

for (const [left,right] of [[1,1],[3,3],[5,5]]) {
  assertSame('smzPivots',H,L,left,right);
}

const smzCfgs = [
  {pivotLeft:5,pivotRight:5,confirmBars:1,minPenPct:0,advanceMode:'break'},
  {pivotLeft:3,pivotRight:3,confirmBars:2,minPenPct:0.5,advanceMode:'break'},
  {pivotLeft:5,pivotRight:5,confirmBars:1,minPenPct:0,advanceMode:'everyhllh'}
];

for (const cfg of smzCfgs) {
  assertSame('smzStructure',C,H,L,cfg);
  assertSame('smartMoneyZones',C,H,L,cfg);
}

for (const [bias,px,f618,f786,f826] of [
  [1,100,110,105,102],
  [1,106,110,105,102],
  [1,103,110,105,102],
  [1,101,110,105,102],
  [-1,100,90,95,98],
  [-1,94,90,95,98],
  [-1,96,90,95,98],
  [0,100,90,95,98]
]) assertSame('smzClassify',bias,px,f618,f786,f826);

const short=[100,101,99,100,102,101];
const sh=short.map(x=>x+1), sl=short.map(x=>x-1), sv=short.map(()=>1000);
assertSame('vcpPivots',sh,sl,3);
assertSame('smzPivots',sh,sl,5,5);
assertSame('smartMoneyZones',short,sh,sl,smzCfgs[0]);

console.log('PASS VCP/IPO/Momentum Base/SMZ parity vs index.html baseline');

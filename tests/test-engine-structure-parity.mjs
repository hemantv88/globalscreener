import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-structure-engine.mjs';

const html = fs.readFileSync(path.resolve(new URL('../index.html', import.meta.url).pathname), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('\\bfunction\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'baseline function not found: ' + name);
  const start = m.index, brace = source.indexOf('{', start);
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

const names = ["sma","stage2","squeeze","darvasSeries","darvasState","darvasBox","adrPct","upDayStreak","tightness","coilRatio","pctFromEma","pctFromPivot"];
const sandbox = { console, Number, Math, Array, Object, String, isFinite, Infinity, NaN };
vm.runInNewContext(names.map(name => extractFunction(html, name)).join('\n\n'), sandbox, {
  filename: 'index.html:structure-oracle'
});

function assertSame(name, ...args) {
  assert.equal(JSON.stringify(engine[name](...args)), JSON.stringify(sandbox[name](...args)), name + ' diverged from index.html baseline');
}

const C = Array.from({length:240},(_,i)=>100 + i*0.15 + Math.sin(i/5)*2);
const H = C.map((x,i)=>x + 1.5 + (i%9===0?0.8:0));
const L = C.map((x,i)=>x - 1.3 - (i%11===0?0.5:0));
const V = Array.from({length:240},(_,i)=>1000 + (i%17)*70 + i*2);
const h52 = Math.max(...H.slice(-252));
const l52 = Math.min(...L.slice(-252));

assertSame('stage2', C.at(-1), C, h52, l52, sandbox.sma(C.slice(-20),20), sandbox.sma(C,50), sandbox.sma(C,150), sandbox.sma(C,200));
assertSame('squeeze', C.slice(-20), H.slice(-20), L.slice(-20));
assertSame('darvasSeries', H,L,5);
const ds = sandbox.darvasSeries(H,L,5);
assert.deepEqual(engine.darvasState(C,ds.tops,ds.bots,1), sandbox.darvasState(C,ds.tops,ds.bots,1));
assertSame('darvasBox', C,H,L,5,1);
assertSame('adrPct', H,L,20);
assertSame('adrPct', H,L,10);
assertSame('upDayStreak', C);

const adr=sandbox.adrPct(H,L,20);
assertSame('tightness', C,H,L,adr,3);
assertSame('tightness', C,H,L,adr,5);
assertSame('coilRatio', H,L,20);
assertSame('coilRatio', H,L,7);
assertSame('pctFromEma', C.at(-1), sandbox.sma(C,20));
assertSame('pctFromPivot', C.at(-1), 125);

// Short-history and invalid-input behaviour.
const shortC=[100,101,102,103];
const shortH=shortC.map(x=>x+1), shortL=shortC.map(x=>x-1);
for (const name of ['stage2','squeeze','darvasSeries','darvasBox','adrPct','tightness','coilRatio']) {
  // Use each function's actual signature where possible rather than asserting a
  // particular policy here; parity means the mirror and baseline agree.
}
assertSame('darvasSeries', shortH,shortL,5);
assertSame('adrPct', shortH,shortL,20);
assertSame('upDayStreak', shortC);
assertSame('pctFromEma', 100,null);
assertSame('pctFromPivot', 100,null);

console.log('PASS structure engine parity vs index.html baseline');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-market-structure.mjs';

const html = fs.readFileSync(path.resolve(new URL('../index.html', import.meta.url).pathname), 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('\\bfunction\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'baseline function not found: ' + name);
  const start = m.index;
  const brace = source.indexOf('{', start);
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

const names = ["wkMondayKey","wkSundayKey","weeklyResample","volAvg20","avgTradedValue","volSpike","thrustDay","hi52","lo52","boPriceFlags","breakout","pivots","pivZone","pivMatch"];
const sandbox = { console, Number, Math, Array, Object, String, Date, Map, isFinite, Infinity, NaN };
vm.runInNewContext(names.map(name => extractFunction(html, name)).join('\n\n'), sandbox, {
  filename: 'index.html:market-structure-oracle'
});

function assertSame(name, ...args) {
  const expected = sandbox[name](...args);
  const actual = engine[name](...args);
  assert.deepEqual(actual, expected, name + ' diverged from index.html baseline');
}

// Calendar/week bucketing.
for (const d of ['2026-10-02', '2026-09-28', '2026-09-27', '2026-01-01']) {
  assertSame('wkMondayKey', d);
  assertSame('wkSundayKey', d);
}

// A 25-session fixture spanning several weeks.
const dates = Array.from({length:25}, (_,i) => {
  const d = new Date(Date.UTC(2026, 8, 1+i));
  return d.toISOString().slice(0,10);
});
const C = dates.map((_,i)=>100+i*0.8+Math.sin(i/2));
const H = C.map(x=>x+1.5);
const L = C.map(x=>x-1.2);
const V = C.map((_,i)=>1000+i*30);
const O = C.map(x=>x-0.4);

assertSame('weeklyResample', C,H,L,V,dates,O);

// Volume primitives, including explicit defaults and custom windows.
assertSame('volAvg20', V, V.length);
assertSame('volAvg20', V, 25);
assertSame('avgTradedValue', C,V,20);
assertSame('avgTradedValue', C,V,5);
assertSame('volSpike', V);
assertSame('volSpike', V, 10, 1.5);
assertSame('volSpike', V, 5, 1.2);

const Vspike = V.slice();
Vspike[Vspike.length-3] *= 8;
assertSame('volSpike', Vspike, 10, 1.5);

const Cthrust = C.slice();
const Vthrust = V.slice();
Cthrust[Cthrust.length-4] *= 1.2;
Vthrust[Vthrust.length-4] *= 6;
assertSame('thrustDay', Cthrust,Vthrust,10);

// 52W/price structure, with enough history and short-history guards.
const C130 = Array.from({length:130},(_,i)=>100+i*0.25);
const H130 = C130.map((x,i)=>x+(i===129?10:2));
const L130 = C130.map((x,i)=>x-(i===20?15:2));
assertSame('hi52', H130);
assertSame('lo52', L130);
assert.equal(engine.hi52(H130,119), sandbox.hi52(H130,119));
assert.equal(engine.lo52(L130,119), sandbox.lo52(L130,119));

const flagsCloses = Array.from({length:70},(_,i)=>100+i*0.1);
flagsCloses[60]=150;
flagsCloses[61]=120;
assertSame('boPriceFlags', flagsCloses);
const volumes = Array.from({length:70},(_,i)=>1000+i);
volumes[60]=100000;
assertSame('breakout', flagsCloses,volumes);

const pv = sandbox.pivots(110,100,105);
assert.deepEqual(engine.pivots(110,100,105), pv);
for (const price of [90,100,105,110,120,130]) assertSame('pivZone', price,pv);
for (const x of [
  [105, 5, true],
  [105, 6, false],
  [110, 5, false]
]) assertSame('pivMatch', ...x);

console.log('PASS market-structure engine parity vs index.html baseline');

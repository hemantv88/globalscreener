import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-market-foundations.mjs';

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
      if (ch === '\\\\') { escaped = true; continue; }
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

const names = ["wkMondayKey","wkSundayKey","weeklyResample","volAvg20","volSpike","thrustDay","earlyVolumeTransition","avgTradedValue","boPriceFlags","breakout","pivots","pivZone","hi52","lo52"];
const sandbox = {
  console, Number, Math, Array, Object, String, Map, Date,
  isFinite, Infinity, NaN,
  WK_MONDAY: new Map(), WK_SUNDAY: new Map(),
  BO_LOOKBACK: 52, H52_MIN_BARS: 120, H52_WIN: 252,
  VOL_SPIKE_WIN: 10, VOL_SPIKE_MULT: 1.5,
  THRUST_MIN_BARS: 22, AVG_VAL_BARS: 20,
  CFG: { THRUST: { win: 10 } }
};
vm.runInNewContext(names.map(n => extractFunction(html, n)).join('\n\n'), sandbox, { filename: 'index.html:market-oracle' });

function assertSame(name, ...args) {
  const expected = sandbox[name](...args);
  const actual = engine[name](...args);
  assert.deepEqual(actual, expected, name + ' diverged from index.html baseline');
}

const dates = ['2026-09-21','2026-09-22','2026-09-23','2026-09-25','2026-09-28','2026-09-29','2026-10-01','2026-10-02'];
const C = [100,102,101,105,106,108,107,110];
const H = C.map((x,i)=>x+2+i%2);
const L = C.map((x,i)=>x-2-i%2);
const V = [1000,1100,900,1200,1300,1250,1400,1500];
const O = C.map((x,i)=>x-(i%2?0.5:-0.5));

assertSame('wkMondayKey', '2026-10-01');
assertSame('wkSundayKey', '2026-09-28');
assertSame('weeklyResample', C,H,L,V,dates,O);

for (const values of [
  Array.from({length: 25}, (_,i)=>100+i*10),
  Array.from({length: 40}, (_,i)=>1000 + (i%5)*100),
  [100,200,300]
]) {
  for (const end of [undefined, values.length, Math.max(0,values.length-1), 21]) {
    assertSame('volAvg20', values, end);
  }
}

const spikeV = Array.from({length: 35}, (_,i)=>1000 + (i%3)*50);
spikeV[27] = 5000;
spikeV[32] = 4500;
assertSame('volSpike', spikeV);
assertSame('volSpike', spikeV, 8, 1.5);
assertSame('volSpike', Array(20).fill(1000));

const thrustC = Array.from({length: 40}, (_,i)=>100 + i*0.2);
thrustC[33] = thrustC[32] * 1.12;
const thrustV = Array.from({length: 40}, (_,i)=>1000 + i*20);
thrustV[33] = 10000;
thrustV[34] = 1500; thrustV[35] = 1400; thrustV[36] = 1300; thrustV[37] = 1250; thrustV[38] = 1200; thrustV[39] = 1100;
const thrust = engine.thrustDay(thrustC, thrustV);
assert.deepEqual(thrust, sandbox.thrustDay(thrustC, thrustV));
assertSame('earlyVolumeTransition', thrustC, thrustV, sandbox.thrustDay(thrustC, thrustV));

const atvC = Array.from({length: 25}, (_,i)=>100+i);
const atvV = Array.from({length: 25}, (_,i)=>1000+i*10);
assertSame('avgTradedValue', atvC, atvV, 20);
assertSame('avgTradedValue', atvC, atvV, 5);

const breakoutC = Array.from({length: 70}, (_,i)=>100 + i*0.05);
const breakoutV = Array(70).fill(1000);
breakoutC[55] = 110; breakoutV[55] = 5000;
breakoutC[60] = 111; breakoutV[60] = 6000;
breakoutC[69] = 112;
assertSame('boPriceFlags', breakoutC);
assertSame('breakout', breakoutC, breakoutV);

assertSame('pivots', 110, 100, 105);
const pv = engine.pivots(110,100,105);
assertSame('pivZone', 105, pv);
assertSame('pivZone', pv.r1, pv);
assertSame('pivZone', pv.s2-1, pv);

const hSeries = Array.from({length: 130}, (_,i)=>100+i*0.5);
const lSeries = hSeries.map(x=>x-10);
assertSame('hi52', hSeries);
assertSame('lo52', lSeries);
assert.equal(engine.hi52(hSeries.slice(0,119)), null);
assert.equal(engine.lo52(lSeries.slice(0,119)), null);

console.log('PASS frontend market/structure foundation parity vs index.html baseline');

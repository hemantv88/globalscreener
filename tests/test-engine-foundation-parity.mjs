import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-foundation.mjs';

const indexPath = path.resolve(new URL('../index.html', import.meta.url).pathname);
const html = fs.readFileSync(indexPath, 'utf8');

function extractFunction(source, name) {
  const re = new RegExp('\\bfunction\\s+' + name + '\\s*\\(');
  const m = re.exec(source);
  assert.ok(m, 'baseline function not found: ' + name);
  const start = m.index;
  const brace = source.indexOf('{', start);
  assert.ok(brace >= 0, 'opening brace not found: ' + name);

  let depth = 0;
  let inString = null;
  let escaped = false;
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
  let inBlockComment = false;

  for (let i = brace; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (inLineComment) { if (ch === '\\n') inLineComment = false; continue; }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  assert.fail('unclosed function: ' + name);
}

const names = ["ema","sma","rsi","rsiSeries","emaSeries","pctChange","pctChangeHist","barChange","benchPctBetween","benchLegPct","rsPosition","rspHistory"];
const oracleSources = names.map(name => extractFunction(html, name));
const sandbox = { console, Number, Math, Array, Object, String, isFinite, Infinity, NaN };
vm.runInNewContext(oracleSources.join('\n\n'), sandbox, { filename: 'index.html:engine-oracle' });

function assertSame(name, ...args) {
  const expected = sandbox[name](...args);
  const actual = engine[name](...args);
  assert.deepEqual(actual, expected, name + ' diverged from index.html baseline');
}

const fixtures = [
  [Array.from({length: 5}, (_, i) => i + 1), 3],
  [Array.from({length: 30}, (_, i) => 100 + Math.sin(i/3) * 7 + i * 0.25), 10],
  [Array.from({length: 80}, (_, i) => 50 + (i % 7) * 2 + i * 0.15), 20],
];

for (const [values, period] of fixtures) {
  assertSame('ema', values, period);
  assertSame('sma', values, period);
  assertSame('emaSeries', values, period);
  assertSame('pctChange', values, Math.max(1, Math.min(period - 1, 7)));
  assertSame('barChange', values, Math.max(1, Math.min(period - 1, 7)));
}

for (const values of [
  [100, 101, 102, 100, 99, 101, 103, 102, 104, 105, 103, 106, 107, 105, 108],
  [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86],
]) {
  assertSame('rsi', values, 14);
  assertSame('rsiSeries', values, 14);
}

const returns = Array.from({length: 100}, (_, i) => 100 + i * 0.37 + Math.sin(i) * 3);
assertSame('pctChangeHist', returns, 21, 30);

const benchMap = new Map([
  ['2026-09-28', 100],
  ['2026-09-29', 101],
  ['2026-09-30', 102],
  ['2026-10-01', 101.5],
  ['2026-10-02', 103]
]);
const bi = { at: d => benchMap.get(d) ?? null };

const dates = ['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'];
const closes = [50, 51, 52, 51.5, 53];

assertSame('benchPctBetween', bi, dates[0], dates.at(-1));
assertSame('benchLegPct', bi, closes, 2);
assertSame('rsPosition', closes, dates, bi, 4);
assertSame('rspHistory', closes, dates, bi, 4, 3);

const holeDates = ['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'];
const holeBi = { at: d => d === '2026-09-30' ? null : benchMap.get(d) ?? null };
assert.equal(engine.rsPosition(closes, holeDates, holeBi, 4), sandbox.rsPosition(closes, holeDates, holeBi, 4));
assert.equal(engine.rsPosition(closes, holeDates, holeBi, 5), null);

console.log('PASS frontend calculation foundation parity vs index.html baseline');

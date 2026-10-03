import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file=path.resolve(new URL('../qa/engine-browser.html',import.meta.url).pathname);
const html=fs.readFileSync(file,'utf8');

for(const needle of [
  "import { computeTech } from '../generator/src/engine/frontend-compute-tech.mjs';",
  "import { rankRSItems } from '../generator/src/engine/frontend-rankrs.mjs';",
  "BROWSER QA PASSED",
  "computeTech module executed",
  "benchmark-relative RS attachment",
  "Early breakout attachment",
  "browser numeric stability"
]){
  assert.ok(html.includes(needle),'browser QA page missing: '+needle);
}

assert.ok(html.includes("new Date(Date.UTC(2026,0,1+i))"));
assert.ok(html.includes("does not modify <code>index.html</code>"));
assert.ok(!html.includes("functions/api.js"));
assert.ok(!html.includes("GS_DATA"));
console.log('PASS browser engine QA page static checks');

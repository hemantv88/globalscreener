import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const html = await fs.readFile(new URL('../qa/india-data-qa.html', import.meta.url), 'utf8');
assert.match(html, /<title>GlobalScreener — India Data QA<\/title>/);
assert.match(html, /id="files"/);
assert.match(html, /id="stockTable"/);
assert.match(html, /id="generateSample"/);
assert.match(html, /gsde-data-v2/);
assert.match(html, /gsde-raw-v2\.1/);
assert.match(html, /function generateSample\(\)/);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 1);
new vm.Script(scripts[0], {filename:'india-data-qa.inline.js'});
console.log('PASS India QA page static DOM/script checks');

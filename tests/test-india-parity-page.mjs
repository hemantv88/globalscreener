import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const html = await fs.readFile(new URL('../qa/india-parity.html', import.meta.url), 'utf8');
assert.match(html, /<title>GlobalScreener — India Data Parity QA<\/title>/);
for (const id of ['files','sample','download','table','detail']) assert.match(html,new RegExp('id="'+id+'"'));
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,1);
new vm.Script(scripts[0],{filename:'india-parity.inline.js'});
console.log('PASS India parity QA page static DOM/script checks');

import assert from 'node:assert/strict';
import {buildDerived,normaliseDate,percentileRank} from '../generator/src/core.mjs';
assert.equal(normaliseDate('01/10/2026'),'2026-10-01');
assert.equal(percentileRank([10,20,30],30),100);
const daily=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),o:100+i,h:101+i,l:99+i,c:100+i,v:1000+i,delivery:45}));
const benchmark={daily:daily.map((x,i)=>({...x,c:100+i*0.5}))};
const d=buildDerived({daily},benchmark);assert.ok(Number.isFinite(d.ema20));assert.ok(Number.isFinite(d.rs21));assert.ok(Number.isFinite(d.rs55));assert.equal(d.rs_overlap_bars,80);
console.log('PASS core + date-aligned benchmark-relative RS');

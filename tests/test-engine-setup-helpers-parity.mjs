import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-setup-helpers.mjs';

const html=fs.readFileSync(path.resolve(new URL('../index.html',import.meta.url).pathname),'utf8');

function extractFunction(source,name){
  const re=new RegExp('\\bfunction\\s+'+name+'\\s*\\(');
  const m=re.exec(source); assert.ok(m,'baseline function not found: '+name);
  const start=m.index,brace=source.indexOf('{',start);
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

const names=['ema','sma','emaSeries','wkMondayKey','wkSundayKey','weeklyResample','hi52','lo52','stage2','isQualitySetup','setupBaseAge','consolidation','candlePattern'];
const sandbox={console,Number,Math,Array,Object,String,Date,Map,Set,isFinite,Infinity,NaN,H52_MIN_BARS:120,H52_WIN:252,WK_MONDAY:new Map(),WK_SUNDAY:new Map()};
vm.runInNewContext(names.map(n=>extractFunction(html,n)).join('\n\n'),sandbox);

function same(name,...args){
  assert.equal(JSON.stringify(engine[name](...args)),JSON.stringify(sandbox[name](...args)),name+' diverged from index.html baseline');
}

const n=240;
const dates=Array.from({length:n},(_,i)=>{const d=new Date(Date.UTC(2026,0,1+i));return d.toISOString().slice(0,10)});
const C=Array.from({length:n},(_,i)=>100+i*0.4+Math.sin(i/7)*3);
const H=C.map((x,i)=>x+1.8+(i%13===0?0.5:0));
const L=C.map((x,i)=>x-1.5-(i%17===0?0.4:0));
const V=Array.from({length:n},(_,i)=>1000+(i%11)*80+i*3);
const O=C.map((x,i)=>x+(i%2?0.2:-0.2));

same('setupBaseAge',C,H,L,V,dates,O);
same('setupBaseAge',C.slice(-180),H.slice(-180),L.slice(-180),V.slice(-180),dates.slice(-180),O.slice(-180));
same('consolidation',C,20,10);
same('consolidation',C,10,5);
same('consolidation',[100,101,100.5,99.8,100.2],5,2);
same('candlePattern',99,103,98,102,101,100);
same('candlePattern',103,105,99,100,102,104);
same('candlePattern',100,100,100,100,100,100);
same('candlePattern',100,102,98,100.05,99,100);
same('candlePattern',100,100,100,100,99,100);
for(const d of [
  null,
  {h52d:-30,price:110,e10:100,e20:101,e50:102,e100:103,e200:104,rs21:1,s2:{score:9,total:9}},
  {h52d:-31,price:110,e10:100,rs21:1,s2:{score:9,total:9}},
  {h52d:-10,price:100,e10:90,e20:95,rs21:1,s2:{score:8,total:9}}
]) same('isQualitySetup',d);

console.log('PASS setup/quality helper parity vs index.html baseline');

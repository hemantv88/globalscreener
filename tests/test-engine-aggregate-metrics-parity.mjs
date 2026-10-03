import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { calcMetrics } from '../generator/src/engine/frontend-aggregate-metrics.mjs';

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

const sandbox={console,Number,Math,Array,Object,String,Map,Set,isFinite,Infinity,NaN,
  ABOVE_PIV_ZONES:['PP→R1','R1→R2','R2+']};
vm.runInNewContext(extractFunction(html,'calcMetrics'),sandbox);

const items=[
  {e20:90,e200:80,price:100,rsi14:65,dpz:'PP→R1',h52d:-5,vRatio:2,boGain:10,boCnt:1},
  {e20:110,e200:120,price:100,rsi14:55,dpz:'S1→PP',h52d:null,vRatio:1,boGain:null,boCnt:0},
  {e20:null,e200:95,price:100,rsi14:60,dpz:'R1→R2',h52d:-12,vRatio:1.5,boGain:3,boCnt:2},
  null
];
sandbox.UNI={india:items.map((_,i)=>({s:'T'+i}))};
sandbox.SD={T0:items[0],T1:items[1],T2:items[2]};
const expected=sandbox.calcMetrics('india');
const actual=calcMetrics(items);
assert.equal(JSON.stringify(actual),JSON.stringify(expected));
assert.equal(calcMetrics([]),null);
assert.equal(calcMetrics([{price:100,h52d:null,e20:90,e200:80,rsi14:60,dpz:'R2+',vRatio:2,boGain:1,boCnt:1}],['R2+']).total,1);
console.log('PASS aggregate metrics parity vs index.html baseline');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as engine from '../generator/src/engine/frontend-early.mjs';

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

const names=["earlyFinite","earlyMinTrigger","earlyRSPLead","earlyCompression","earlyVolumeScore","earlyTrendScore","earlyStructureScore","calcEarlyBreakout"];
const sandbox={console,Number,Math,Array,Object,String,isFinite,Infinity,NaN};
vm.runInNewContext(names.map(n=>extractFunction(html,n)).join('\n\n'),sandbox);

function same(name,...args){
 assert.deepEqual(engine[name](...args),sandbox[name](...args),name+' diverged from index.html baseline');
}

const d={price:100,dBoxTop:103,vcpLid:104,ipoLid:106,dBoxState:'near',vcpToLid:2,ipoToLid:4,
 rsp21:92,rsp55:88,rsSlope:1.5,rs21:3,rspHist21:[72,78,81,91],
 coil:.68,tight:49,consolDays:12,sq:78,
 volDryRatio:.70,earlyPostThrustPre:.72,earlyVolTrend:1.6,earlyUpDown10:1.7,
 pct20e:4,pct50e:2,pct200e:-4,slope200:.7,boAge:2,marketRegime:'bull'};
for(const n of names){
 same(n,d);
}
same('earlyMinTrigger',{price:100,dBoxTop:103,vcpLid:105,ipoLid:102});
same('earlyMinTrigger',{price:100});
same('earlyRSPLead',{rsp21:91,rsp55:86,rsSlope:1,rs21:2,rspHist21:[80,91]});
same('earlyCompression',{coil:.8,tight:55,consolDays:6,sq:70});
same('earlyVolumeScore',{volDryRatio:.8,earlyPostThrustPre:.8,earlyVolTrend:1.2,earlyUpDown10:1.3});
same('earlyTrendScore',{pct20e:1,pct50e:1,pct200e:-2,slope200:.1});
same('earlyStructureScore',d);

const result=engine.calcEarlyBreakout(d,'IN');
const expected=sandbox.calcEarlyBreakout(d,'IN');
assert.deepEqual(result,expected);
assert.equal(result.score,result.trend+result.rs+result.compression+result.volume+result.structure);
console.log('PASS Early breakout parity vs index.html baseline');

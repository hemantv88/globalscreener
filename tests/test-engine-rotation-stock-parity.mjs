import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-rotation-stock.mjs';

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

const names=['numOk','rsChangeOf','stockRsAccelOf','rotPctRank','rotStockState','rotLeaderScore','rotV5StateRank','rotV5EarlyLabel'];
const sandbox={console,Number,Math,Array,Object,String,isFinite,Infinity,NaN};
vm.runInNewContext(names.map(n=>extractFunction(html,n)).join('\n\n'),sandbox);

function same(name,...args){
  assert.equal(JSON.stringify(engine[name](...args)),JSON.stringify(sandbox[name](...args)),name+' diverged from index.html baseline');
}

for(const v of [null,0,1,-1,1.2,'1',Infinity,NaN]) same('numOk',v);
for(const h of [
  [1,2,3,4,5,6],
  [1,2,3,4,5,6,8,9,12],
  [1,2,3],
  [1,2,3,4,5,null,8]
]){ same('rsChangeOf',{rsHist:h}); same('stockRsAccelOf',{rsHist:h}); }

for(const args of [
  [50,[10,20,30,40,50]],
  [25,[10,20,30,40,50]],
  [null,[10,20]],
  [50,[]]
]) same('rotPctRank',...args);

for(const args of [[70,70],[60,40],[40,70],[40,30],[null,70]]) same('rotStockState',...args);

const fixtures=[
  null,
  {contextScore:80,e:{score:90,triggerDist:2},peerRsRank:80,peerMomRank:75,peerAccelRank:70,h52:-5},
  {contextScore:60,e:{score:65,triggerDist:12},peerRsRank:55,peerMomRank:45,peerAccelRank:35,h52:-25},
  {e:{score:100,triggerDist:0},peerRsRank:null,peerMomRank:null,peerAccelRank:null,h52:null}
];
for(const x of fixtures) same('rotLeaderScore',x);

for(const s of ['prime','watch','accumulation','developing','breakout','unknown','']) {
  same('rotV5StateRank',s); same('rotV5EarlyLabel',s);
}

console.log('PASS stock rotation helper parity vs index.html baseline');

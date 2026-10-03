import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as engine from '../generator/src/engine/frontend-rankrs.mjs';
import { weeklyResample } from '../generator/src/engine/frontend-market-structure.mjs';

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

const depNames=['benchIndex','benchPctBetween','benchLegPctHist','benchLegPct','wkMondayKey','wkSundayKey','weeklyResample','emaSeries','rsPosition','rspHistory','earlyFinite','earlyMinTrigger','earlyRSPLead','earlyCompression','earlyVolumeScore','earlyTrendScore','earlyStructureScore','calcEarlyBreakout','rankRS'];
const sandbox={
 console,Number,Math,Array,Object,String,Map,Date,Set,isFinite,Infinity,NaN,
 WK_MONDAY:new Map(),WK_SUNDAY:new Map(),
 FRESH_RSP_LEN:21,FRESH_LOOKBACK:{rsp:5},FRESH_RSP_BASE:5,FRESH_RSP_HIST:11
};
vm.runInNewContext(depNames.filter(n=>n!=='benchLegPct').map(n=>extractFunction(html,n)).join('\n\n'),sandbox);

function benchLegPctLocal(bi,tail,N){
 if(!bi||!Array.isArray(tail)||tail.length<N+1)return null;
 const a=bi.at(tail[tail.length-1-N]),b=bi.at(tail[tail.length-1]);
 if(a==null||b==null||!a||!isFinite(a)||!b||!isFinite(b))return null;
 return (b/a-1)*100;
}
sandbox.benchLegPct=benchLegPctLocal;

function clone(x){return JSON.parse(JSON.stringify(x));}

const n=100;
const dates=Array.from({length:n},(_,i)=>{
 const d=new Date(Date.UTC(2026,0,1+i)); return d.toISOString().slice(0,10);
});
const bC=dates.map((_,i)=>100+i*0.25+Math.sin(i/5));
const bH=bC.map(x=>x+1),bL=bC.map(x=>x-1),bV=Array(n).fill(10000);

function makeItem(mult,withS2=true){
 const c=bC.map((x,i)=>x*(1+mult*i/1000));
 const rsTail=c.slice(-56), rsDates=dates.slice(-56);
 const wk=weeklyResample(c,c.map(x=>x+1),c.map(x=>x-1),Array(n).fill(1000),dates);
 return {
  s:'TEST'+mult,pc21:null,pc55:null,pc10w:null,
  pcHist21:null,rsDates,rsCloses:rsTail,rsWkDates:wk.dates.slice(-11),
  dBoxTop:110,vcpLid:112,ipoLid:115,dBoxState:'near',vcpToLid:1,ipoToLid:2,
  coil:.8,tight:55,consolDays:8,sq:70,volDryRatio:.8,earlyPostThrustPre:.9,
  earlyVolTrend:1.2,earlyUpDown10:1.3,pct20e:2,pct50e:1,pct200e:-2,slope200:.5,
  price:c.at(-1),boAge:null,marketRegime:'unknown',
  s2:withS2?{score:0,total:9,details:Array.from({length:9},(_,i)=>({label:'r'+i,pass:i===0}))}:null
 };
}
const items=[makeItem(1),makeItem(2),makeItem(-1),makeItem(0.5)];
items.forEach((d)=>{
 const c=d.rsCloses;
 d.pc21=(c.at(-1)/c.at(-22)-1)*100;
 d.pc55=(c.at(-1)/c.at(-56)-1)*100;
 const wkC=weeklyResample(c,c.map(x=>x+1),c.map(x=>x-1),Array(c.length).fill(1000),d.rsDates).closes;
 d.pc10w=wkC.length>10?(wkC.at(-1)/wkC.at(-11)-1)*100:null;
 d.pcHist21=Array.from({length:30},(_,i)=>{
   const k=c.length-30+i; return (c[k]/c[k-21]-1)*100;
 });
 d.rsDates=d.rsDates.slice(-56);
});

const benchmark={dates,bC,bH,bL,bV};
const input1=clone(items);
const input2=clone(items);

// Baseline rankRS uses UNI/SD/BENCHMARK_DATA globals.
sandbox.UNI={india:input1.map(d=>({s:d.s}))};
sandbox.SD=Object.fromEntries(input1.map(d=>[d.s,d]));
sandbox.BENCHMARK_DATA={india:{dates,bC:bC,H:bH,L:bL,V:bV,C:bC}};
sandbox.emA=undefined;
sandbox.emaSeries=sandbox.emaSeries;
sandbox.earlyFinite=sandbox.earlyFinite;
sandbox.weeklyResample=sandbox.weeklyResample;
sandbox.benchIndex=sandbox.benchIndex;
sandbox.benchLegPct=sandbox.benchLegPct;
sandbox.benchLegPctHist=sandbox.benchLegPctHist;
sandbox.rsPosition=sandbox.rsPosition;
sandbox.rspHistory=sandbox.rspHistory;
sandbox.calcEarlyBreakout=sandbox.calcEarlyBreakout;

sandbox.rankRS('india');

const expected=input1.sort((a,b)=>a.s.localeCompare(b.s));
const actual=engine.rankRSItems(input2,{dates,C:bC,H:bH,L:bL,V:bV},'india').sort((a,b)=>a.s.localeCompare(b.s));
assert.equal(JSON.stringify(actual),JSON.stringify(expected),'rankRS outputs diverged from index.html baseline');
console.log('PASS benchmark-relative RS attachment parity vs index.html baseline');

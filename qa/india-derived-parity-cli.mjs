import fs from 'node:fs/promises';

const csvPath=process.argv[2]||'state/Data_India.csv';
const rawPath=process.argv[3]||'state/IN.raw.json';
const outPath=process.env.OUT||'test-output/india-derived-parity-report.json';
const csv=(await fs.readFile(csvPath,'utf8')).trim().split(/\r?\n/);
const h=csv[0].split(','); const ix=Object.fromEntries(h.map((x,i)=>[x.toLowerCase(),i]));
const by=new Map();
for(const line of csv.slice(1)){
  const p=line.split(','), t=p[ix.ticker]?.trim().toUpperCase().replace(/\.NS$/,'');
  const ds=p[ix.date]?.trim(), m=ds?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/), d=m?m[3]+'-'+m[2]+'-'+m[1]:ds;
  if(!t||!d) continue; if(!by.has(t)) by.set(t,[]); by.get(t).push({d,c:+p[ix.close]});
}
const raw=JSON.parse(await fs.readFile(rawPath,'utf8')), rm=new Map(raw.securities.map(s=>[s.ticker.toUpperCase(),s]));
const ema=(a,n)=>{let e=null,k=2/(n+1),seed=0;for(let i=0;i<a.length;i++){const v=a[i];if(i<n){seed+=v;if(i===n-1)e=seed/n}else e=v*k+e*(1-k)}return e};
const pct=(a,n)=>a.length>n?a.at(-1)/a.at(-1-n)-1:null;
const metric=(c,b)=>{const e10=ema(c,10),e20=ema(c,20),e50=ema(c,50),p=c.at(-1),h=Math.max(...c.slice(-252));return{price:p,e10,e20,e50,h,rs21:(pct(c,21)-pct(b,21))*100,rs55:(pct(c,55)-pct(b,55))*100,trend:p>e10&&e10>=e20&&e20>=e50?'bull':p<e10&&e10<=e20&&e20<=e50?'bear':'mixed'}};
const bd=by.get('MONIFTY500'), br=rm.get('MONIFTY500');
if(!bd||!br) throw new Error('MONIFTY500 benchmark is missing from the control or NSE dataset');
const bmap=new Map(bd.map(x=>[x.d,x.c])), braw=new Map(br.daily.map(x=>[x.date,x.c]));
let compared=0,diffTrend=0,diffRs55=0,diffEma=0,diffH52=0,exceptions=[];
const rel=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-9);
for(const [sym,sheet] of by){
  if(sym==='MONIFTY500'||!rm.has(sym)) continue;
  const r=rm.get(sym), sm=new Map(sheet.map(x=>[x.d,x])), rmap=new Map(r.daily.map(x=>[x.date,x.c]));
  const common=[...sm.keys()].filter(d=>bmap.has(d)&&braw.has(d)&&rmap.has(d)).sort().slice(-300);
  if(common.length<56) continue;
  const a=metric(common.map(d=>sm.get(d).c),common.map(d=>bmap.get(d))), b=metric(common.map(d=>rmap.get(d)),common.map(d=>braw.get(d)));
  compared++; const flags=[];
  if(rel(a.e10,b.e10)>0.001) flags.push('ema10');
  if(rel(a.e20,b.e20)>0.001) flags.push('ema20');
  if(rel(a.e50,b.e50)>0.001) flags.push('ema50');
  if(rel(a.h,b.h)>0.001) flags.push('h52');
  if(Math.abs(a.rs55-b.rs55)>0.5) flags.push('rs55');
  if(a.trend!==b.trend) flags.push('trend');
  if(flags.length){exceptions.push({ticker:sym,flags,control:a,nse:b});if(flags.includes('trend'))diffTrend++;if(flags.includes('rs55'))diffRs55++;if(flags.some(x=>x.startsWith('ema')))diffEma++;if(flags.includes('h52'))diffH52++;}
}
const report={compared,diffTrend,diffRs55,diffEma,diffH52,exceptionCount:exceptions.length,exceptions};
await fs.mkdir('test-output',{recursive:true}); await fs.writeFile(outPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({compared,diffTrend,diffRs55,diffEma,diffH52,exceptionCount:exceptions.length,top:exceptions.slice(0,20)},null,2));

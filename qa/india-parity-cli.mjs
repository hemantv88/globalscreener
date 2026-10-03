import fs from 'node:fs/promises';

const csvPath = process.env.SHEET_CSV || process.argv[2] || 'state/Data_India.csv';
const rawPath = process.env.RAW_JSON || process.argv[3] || 'state/IN.raw.json';
const outPath = process.env.OUT || 'test-output/india-parity-report.json';

function csvParse(text) {
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if(q){ if(ch==='"'&&nx==='"'){cell+='"';i++;} else if(ch==='"') q=false; else cell+=ch; continue; }
    if(ch==='"'){q=true;continue;}
    if(ch===','){row.push(cell);cell='';continue;}
    if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';continue;}
    cell+=ch;
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows;
}
const norm=s=>String(s??'').trim().toLowerCase().replace(/[ _-]+/g,'');
const tickerKey=s=>String(s??'').trim().toUpperCase().replace(/\.NS$/,'');
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null};
function date(v){
  const s=String(v??'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const d=new Date(s); return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
const rel=(a,b)=>a==null||b==null?null:Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-12);

const csv=await fs.readFile(csvPath,'utf8');
const raw=JSON.parse(await fs.readFile(rawPath,'utf8'));
const rows=csvParse(csv);
if(!rows.length) throw new Error('Google Sheets CSV is empty');
const h=rows[0].map(norm);
const idx={ticker:h.findIndex(x=>['ticker','symbol','sym'].includes(x)),date:h.findIndex(x=>x==='date'),open:h.findIndex(x=>x==='open'),high:h.findIndex(x=>x==='high'),low:h.findIndex(x=>x==='low'),close:h.findIndex(x=>x==='close'),volume:h.findIndex(x=>x==='volume')};
if(Object.values(idx).some(v=>v<0)) throw new Error('Data_India CSV is missing required Ticker/Date/OHLCV columns');

const sheet=new Map();
for(const r of rows.slice(1)){
  const sym=tickerKey(r[idx.ticker]), d=date(r[idx.date]);
  if(!sym||!d) continue;
  if(!sheet.has(sym)) sheet.set(sym,new Map());
  sheet.get(sym).set(d,{o:num(r[idx.open]),h:num(r[idx.high]),l:num(r[idx.low]),c:num(r[idx.close]),v:num(r[idx.volume])});
}
const result=[];
let commonBars=0, withinBars=0, exactBars=0, closeBad=0, volumeBad=0, missing=0;
const rawLatest=raw.securities?.flatMap(s=>(s.daily||[]).map(b=>b.date)).sort().at(-1)||null;
for(const s of raw.securities||[]){
  const sym=tickerKey(s.ticker), sm=sheet.get(sym), rm=new Map((s.daily||[]).map(b=>[b.date,{o:num(b.o),h:num(b.h),l:num(b.l),c:num(b.c),v:num(b.v)}]));
  if(!sm){missing++;continue;}
  const dates=[...rm.keys()].filter(d=>sm.has(d)).sort();
  let ex=0, wi=0, cb=0, vb=0;
  for(const d of dates){
    const a=sm.get(d), b=rm.get(d);
    const exact=['o','h','l','c','v'].every(k=>a[k]!=null&&b[k]!=null&&a[k]===b[k]);
    const within=['o','h','l','c'].every(k=>a[k]==null||b[k]==null||rel(a[k],b[k])<=0.001) && (a.v==null||b.v==null||rel(a.v,b.v)<=0.005);
    const cBad=a.c!=null&&b.c!=null&&rel(a.c,b.c)>0.001;
    const vBad=a.v!=null&&b.v!=null&&rel(a.v,b.v)>0.005;
    if(exact) ex++; if(within) wi++; if(cBad) cb++; if(vBad) vb++;
  }
  commonBars+=dates.length; exactBars+=ex; withinBars+=wi; closeBad+=cb; volumeBad+=vb;
  result.push({ticker:sym,sheetBars:sm.size,rawBars:rm.size,commonBars:dates.length,latestCommon:dates.at(-1)||null,exactBars:ex,withinToleranceBars:wi,closeMismatchesOver0_1pct:cb,volumeMismatchesOver0_5pct:vb});
}
result.sort((a,b)=>b.commonBars-a.commonBars||a.ticker.localeCompare(b.ticker));
const report={ok:commonBars>0,generatedAt:new Date().toISOString(),rawLatest,sheetTickers:sheet.size,rawTickers:(raw.securities||[]).length,tickersCompared:result.length,rawTickersMissingFromSheet:missing,commonBars,exactBars,withinToleranceBars:withinBars,exactRate:commonBars?+(exactBars/commonBars*100).toFixed(2):0,withinToleranceRate:commonBars?+(withinBars/commonBars*100).toFixed(2):0,closeMismatchesOver0_1pct:closeBad,volumeMismatchesOver0_5pct:volumeBad,tickers:result};
await fs.mkdir('test-output',{recursive:true});
await fs.writeFile(outPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report, tickers:undefined, missingRawTickers:result.filter(x=>x.commonBars===0).map(x=>x.ticker), volumeMismatchTickers:result.filter(x=>x.volumeMismatchesOver0_5pct>0).map(x=>({ticker:x.ticker,latestCommon:x.latestCommon,mismatches:x.volumeMismatchesOver0_5pct}))},null,2));
if(!report.ok) process.exit(1);

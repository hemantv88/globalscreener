import fs from 'node:fs/promises';
import path from 'node:path';

/*
 * Build the compact server API payload consumed by GlobalScreener's existing
 * API parser. The payload is written to a staging directory for later upload
 * to private R2; it is NOT committed to git.
 *
 * Wire shape:
 * {
 *   status: 'success',
 *   shape: 'sm1',
 *   region: 'India'|'US'|'ETF',
 *   updated: 'YYYY-MM-DD',
 *   tickers: [...],
 *   dates: [...shared date dictionary...],
 *   series: [{d:[date indexes],o:[...],h:[...],l:[...],c:[...],v:[...]}]
 * }
 *
 * India symbols are stored by NSE without the .NS suffix. The existing
 * GlobalScreener universe uses .NS, so this builder adds the suffix only on the
 * API wire for India. This keeps the existing UI/data contract unchanged.
 *
 * Benchmark compatibility:
 * The existing screener's selectable India benchmarks are first-class NSE
 * instruments (NIFTYBEES.NS, MONIFTY500.NS, HDFCSML250.NS). The builder
 * therefore includes all acquired India securities, including those symbols.
 * The official NSE index series remain available in the raw snapshot for
 * validation; they are not silently substituted for the UI's configured ETF
 * benchmark.
 */

const ROOT = process.env.GS_ROOT ? path.resolve(process.env.GS_ROOT) : path.resolve(process.cwd(), '..');
const OUT = path.join(ROOT, process.env.API_OUT_DIR || 'api-staging');
const MARKETS = [
  {file:'IN.raw.json',code:'IN',region:'India',versionPrefix:'gsde-raw', india:true},
  {file:'US.raw.json',code:'US',region:'US',versionPrefix:'gsde-us', india:false},
  {file:'ETF.raw.json',code:'ETF',region:'ETF',versionPrefix:'gsde-etf', india:false}
];

function cleanBar(b){
  if(!b || !b.date) return null;
  const c=Number(b.c);
  if(!Number.isFinite(c)) return null;
  const o=Number(b.o),h=Number(b.h),l=Number(b.l),v=Number(b.v);
  return {
    date:String(b.date).slice(0,10),
    o:Number.isFinite(o)?o:c,
    h:Number.isFinite(h)?h:c,
    l:Number.isFinite(l)?l:c,
    c,
    v:Number.isFinite(v)?v:0
  };
}

function apiTicker(ticker,india){
  const t=String(ticker||'').trim().toUpperCase();
  if(!t) return '';
  return india && !t.endsWith('.NS') ? t+'.NS' : t;
}

async function buildOne(cfg){
  const raw=JSON.parse(await fs.readFile(path.join(ROOT,'state',cfg.file),'utf8'));
  const dateSet=new Set();
  const items=[];

  for(const sec of (raw.securities||[])){
    const ticker=apiTicker(sec.ticker||sec.sym,cfg.india);
    if(!ticker) continue;
    const bars=(sec.daily||[]).map(cleanBar).filter(Boolean);
    if(!bars.length) continue;
    for(const b of bars) dateSet.add(b.date);
    items.push({ticker,bars});
  }

  /*
   * Add benchmark aliases explicitly when present in the raw security universe.
   * This is primarily documentation/validation protection: the rows are already
   * included above, but we retain the configured benchmark list in the manifest.
   */
  const dates=[...dateSet].sort();
  const index=new Map(dates.map((d,i)=>[d,i]));
  const series=[];
  const tickers=[];

  for(const item of items.sort((a,b)=>a.ticker.localeCompare(b.ticker))){
    const s={d:[],o:[],h:[],l:[],c:[],v:[]};
    for(const b of item.bars){
      const di=index.get(b.date);
      if(di===undefined) continue;
      s.d.push(di); s.o.push(b.o); s.h.push(b.h); s.l.push(b.l); s.c.push(b.c); s.v.push(b.v);
    }
    if(!s.c.length) continue;
    tickers.push(item.ticker);
    series.push(s);
  }

  const latest=dates.at(-1)||raw.end_date||null;
  const payload={
    status:'success',
    shape:'sm1',
    region:cfg.region,
    updated:latest,
    tickers,
    dates,
    series
  };

  const outPath=path.join(OUT,cfg.code+'.sm1.json');
  await fs.mkdir(OUT,{recursive:true});
  await fs.writeFile(outPath,JSON.stringify(payload));
  return {market:cfg.code,region:cfg.region,tickers:tickers.length,dates:dates.length,bytes:Buffer.byteLength(JSON.stringify(payload)),path:outPath};
}

const results=[];
for(const cfg of MARKETS){
  try{
    results.push(await buildOne(cfg));
  }catch(err){
    console.error('[api-snapshot]',cfg.code,err.message);
    process.exitCode=1;
  }
}

console.log(JSON.stringify({status:process.exitCode?'failed':'ok',results},null,2));

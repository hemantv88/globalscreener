import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.env.GS_ROOT ? path.resolve(process.env.GS_ROOT) : path.resolve(process.cwd(), '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_DIR = path.join(ROOT, 'state');
const PUBLIC_DIR = path.join(ROOT, 'public', 'data');
const days = Number(process.env.BACKFILL_DAYS || 300);
if (!Number.isInteger(days) || days < 5 || days > 320) throw new Error('BACKFILL_DAYS must be an integer from 5 to 320');
const symbolsFile = path.resolve(process.env.US_UNIVERSE_FILE || path.join(ROOT, 'config', 'US_UNIVERSE.txt'));
const symbols = (await fs.readFile(symbolsFile, 'utf8')).split(/\r?\n/).map(x => x.trim().toUpperCase()).filter(x => x && !x.startsWith('#'));
if (!symbols.length) throw new Error('US universe is empty');
await fs.mkdir(STATE_DIR,{recursive:true});
await fs.mkdir(PUBLIC_DIR,{recursive:true});

const env = { ...process.env, DATA_DIR, PYTHONPATH: path.resolve(process.cwd()), GS_TARGET_SESSIONS: String(days), GS_US_BUDGET_SECONDS: String((Number(process.env.MAX_BUDGET_MINUTES)||0)*60), GS_US_YEARS: String(Number(process.env.US_YEARS || 2)), GS_SYMBOLS: symbols.join(',') };

const py = String.raw`
import os, json, io, sys
from contextlib import redirect_stdout
from data_kit import us

symbols = [x.strip().upper() for x in os.environ['GS_SYMBOLS'].split(',') if x.strip()]
budget = us.Budget(int(os.environ.get('GS_US_BUDGET_SECONDS','0')))
captured = io.StringIO()
with redirect_stdout(captured):
    us.update(symbols, years=int(os.environ.get('GS_US_YEARS','2')), recent='1mo', budget=budget)
    frames = us.frames(symbols)

progress = captured.getvalue()
if progress:
    print(progress, file=sys.stderr, end='' if progress.endswith('\n') else '\n')

def rows(df, limit):
    out=[]
    for idx, row in df.tail(limit).iterrows():
        vals=[row.get(k) for k in ('open','high','low','close','volume')]
        if any(v is None for v in vals[:4]):
            continue
        out.append({'date':idx.strftime('%Y-%m-%d'),'o':float(vals[0]),'h':float(vals[1]),'l':float(vals[2]),'c':float(vals[3]),'v':float(vals[4] or 0)})
    return out

limit=int(os.environ['GS_TARGET_SESSIONS'])
secs=[{'ticker':s,'daily':rows(frames[s],limit)} for s in symbols if s in frames]
bench={s:{'name':s,'daily':rows(frames[s],limit)} for s in ('SPY','QQQ') if s in frames}
out={'version':'gsde-us-v1','market':'US','target_sessions':limit,'requested_symbols':symbols,'securities':secs,'benchmarks':bench,'split_ledger':us.ledger()}
print(json.dumps(out,separators=(',',':')))
`;

const r = spawnSync('python3',['-c',py],{env,encoding:'utf8',maxBuffer:1024*1024*512});
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(r.status || 1); }
if (r.stderr) process.stderr.write(r.stderr);
const raw = JSON.parse(r.stdout);
raw.sessions_on_file = [...new Set(raw.securities.flatMap(s=>(s.daily||[]).map(x=>x.date)))].length;
await fs.writeFile(path.join(STATE_DIR,'US.raw.json'),JSON.stringify(raw));
console.log(JSON.stringify({market:'US',requested:raw.requested_symbols.length,received:raw.securities.length,sessions_on_file:raw.sessions_on_file,benchmarks:Object.keys(raw.benchmarks),split_tickers:Object.keys(raw.split_ledger)},null,2));
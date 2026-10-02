import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.env.GS_ROOT ? path.resolve(process.env.GS_ROOT) : path.resolve(process.cwd(), '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_DIR = path.join(ROOT, 'state');
const PUBLIC_DIR = path.join(ROOT, 'public', 'data');
const days = Number(process.env.BACKFILL_DAYS || 300);
if (!Number.isInteger(days) || days < 1 || days > 320) throw new Error('BACKFILL_DAYS must be an integer from 1 to 320');
const endDate = process.env.END_DATE || new Date().toISOString().slice(0,10);

await fs.mkdir(STATE_DIR,{recursive:true});
await fs.mkdir(PUBLIC_DIR,{recursive:true});

const env = {
  ...process.env,
  DATA_DIR,
  PYTHONPATH: path.resolve(process.cwd())
};

// The NSE data-kit writes progress messages to stdout while updating sessions.
// Keep stdout reserved for the final JSON payload so Node can parse it reliably.
const py = `
import os, json, sys, io
from contextlib import redirect_stdout
from data_kit import nse

end = os.environ['GS_END_DATE']
target = int(os.environ['GS_TARGET_SESSIONS'])
captured = io.StringIO()

with redirect_stdout(captured):
    nse.update_sessions(
        target_sessions=target,
        end_date=end,
        budget=nse.Budget(int(os.environ.get('GS_BUDGET_SECONDS','0'))),
        sleep=float(os.environ.get('GS_NSE_SLEEP','0.5')),
        enrich_delivery=True
    )
    rep = {}
    frames = nse.frames(None, active_days=target, report=rep)
    indices = nse.index_frames(['NIFTY 50','NIFTY 500','INDIA VIX'])

# Send acquisition/progress diagnostics to stderr so stdout remains valid JSON.
progress = captured.getvalue()
if progress:
    print(progress, file=sys.stderr, end='' if progress.endswith('\\n') else '\\n')

def barrows(df):
    out = []
    for idx, row in df.iterrows():
        out.append({
            'date': idx.strftime('%Y-%m-%d'),
            'o': None if row['open'] != row['open'] else float(row['open']),
            'h': None if row['high'] != row['high'] else float(row['high']),
            'l': None if row['low'] != row['low'] else float(row['low']),
            'c': float(row['close']),
            'v': float(row['volume'] or 0),
            'delivery': (
                None if row['delivery'] != row['delivery']
                else float(row['delivery']) if row['delivery'] is not None else None
            ),
            'isin': row['isin'] if isinstance(row['isin'], str) else None,
            'series': row['series'] if isinstance(row['series'], str) else None
        })
    return out

secs = []
for sym, df in frames.items():
    secs.append({
        'ticker': sym,
        'isin': next((x for x in df['isin'][::-1] if isinstance(x, str) and x), None),
        'series': next((x for x in df['series'][::-1] if isinstance(x, str) and x), None),
        'daily': barrows(df)
    })

bench = {}
for name, df in indices.items():
    bench[name] = {
        'name': name,
        'daily': [{
            'date': idx.strftime('%Y-%m-%d'),
            'o': float(row['open']),
            'h': float(row['high']),
            'l': float(row['low']),
            'c': float(row['close'])
        } for idx, row in df.iterrows()]
    }

out = {
    'version': 'gsde-raw-v2.1',
    'market': 'IN',
    'end_date': end,
    'target_sessions': target,
    'sessions_on_file': len(nse.sessions()),
    'securities': secs,
    'benchmarks': bench,
    'adjustment_report': rep
}
print(json.dumps(out, separators=(',',':')))
`;

const r = spawnSync('python3', ['-c', py], {
  env: {
    ...env,
    GS_END_DATE: endDate,
    GS_TARGET_SESSIONS: String(days),
    GS_BUDGET_SECONDS: String(Number(process.env.MAX_BUDGET_SECONDS || 0)),
    GS_NSE_SLEEP: String(Number(process.env.NSE_SLEEP || 0.35))
  },
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 512
});

if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}

const raw = JSON.parse(r.stdout);
await fs.writeFile(path.join(STATE_DIR,'IN.raw.json'), JSON.stringify(raw));

console.log(JSON.stringify({
  market: 'IN',
  sessions_on_file: raw.sessions_on_file,
  securities: raw.securities.length,
  benchmarks: Object.keys(raw.benchmarks),
  adjusted_symbols: Object.keys(raw.adjustment_report).length
}, null, 2));

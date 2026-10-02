import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const generatorDir = path.resolve(process.cwd());
const repoDir = path.resolve(generatorDir, '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gs-phase1-1-snapshot-'));

const iso = i => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const makeBars = (base, step) => Array.from({length: 300}, (_, i) => {
  const c = base + i * step;
  return {
    date: iso(i),
    o: c - 1,
    h: c + 1,
    l: c - 2,
    c,
    v: 100000 + i,
    delivery: 40 + (i % 10)
  };
});

const benchmarkDaily = makeBars(100, 0.2).map(b => ({...b, c: 100 + (Number(b.date.slice(-3)) || 0) * 0.2}));
const raw = {
  version: 'gsde-raw-v2.1',
  market: 'IN',
  end_date: iso(299),
  target_sessions: 300,
  sessions_on_file: 300,
  securities: [
    {ticker: 'AAA', isin: 'INEAAA000001', series: 'EQ', daily: makeBars(50, 0.15)},
    {ticker: 'BBB', isin: 'INEBBB000002', series: 'EQ', daily: makeBars(75, 0.1)},
    {ticker: 'CCC', isin: 'INECCC000003', series: 'EQ', daily: makeBars(120, -0.05)}
  ],
  benchmarks: {
    'NIFTY 500': {name: 'NIFTY 500', daily: benchmarkDaily},
    'NIFTY 50': {name: 'NIFTY 50', daily: benchmarkDaily},
    'INDIA VIX': {name: 'INDIA VIX', daily: benchmarkDaily.map(b => ({...b, c: 15}))}
  },
  adjustment_report: {
    AAA: {applied: [['2025-02-01', 0.5, 'bonus 1:1']], not_confirmed: []}
  }
};

try {
  await fs.mkdir(path.join(tmp, 'state'), {recursive: true});
  await fs.writeFile(path.join(tmp, 'state', 'IN.raw.json'), JSON.stringify(raw));

  const build = spawnSync('node', [path.join(repoDir, 'generator', 'src', 'build-snapshot.mjs')], {
    cwd: generatorDir,
    env: {...process.env, GS_ROOT: tmp},
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const snapshot = JSON.parse(await fs.readFile(path.join(tmp, 'public', 'data', 'IN.json'), 'utf8'));
  assert.equal(snapshot.universe, 5);
  assert.equal(snapshot.screening_universe, 3);
  assert.equal(snapshot.rights_entitlement_universe, 1);
  assert.equal(snapshot.stale_non_re_universe, 1);
  assert.ok(snapshot.screening_symbols.includes('AAA'));
  assert.ok(!snapshot.screening_symbols.includes('DDD_RE'));
  assert.ok(!snapshot.screening_symbols.includes('EEE'));
  assert.equal(snapshot.securities.find(s=>s.sym==='DDD_RE').screenEligible,false);
  assert.equal(snapshot.securities.find(s=>s.sym==='DDD_RE').eligibilityReason,'RIGHTS_ENTITLEMENT');
  assert.equal(snapshot.securities.find(s=>s.sym==='EEE').screenEligible,false);
  assert.equal(snapshot.securities.find(s=>s.sym==='EEE').eligibilityReason,'NO_TRADE_ON_LATEST_MARKET_SESSION');
  assert.equal(snapshot.market, 'IN');
  assert.equal(snapshot.latest_trade_date, iso(299));
  assert.equal(snapshot.benchmark_for_rs, 'NIFTY 500');
  assert.equal(snapshot.adjustment_summary.symbols_with_adjustments, 1);
  assert.ok(Number.isFinite(snapshot.securities[0].derived.rs21));
  assert.ok(Number.isFinite(snapshot.securities[0].derived.rs55));
  assert.equal(snapshot.securities[0].derived.rs_overlap_bars, 300);

  const validate = spawnSync('node', [path.join(repoDir, 'generator', 'src', 'validate.mjs')], {
    cwd: generatorDir,
    env: {
      ...process.env,
      GS_ROOT: tmp,
      MIN_TARGET_SESSIONS: '300',
      MIN_UNIVERSE: '3',
      MIN_MEDIAN_HISTORY: '299'
    },
    encoding: 'utf8'
  });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);

  const report = JSON.parse(await fs.readFile(path.join(tmp, 'test-output', 'india-validation-report.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(report.history.median_bars, 300);
  assert.equal(report.history.securities_ge_300, 3);
  assert.equal(report.integrity.duplicate_dates, 0);
  assert.equal(report.integrity.invalid_ohlc, 0);
  assert.equal(report.integrity.negative_volume, 0);
  assert.equal(report.integrity.bad_delivery_pct, 0);
  assert.equal(report.integrity.securities_with_short_benchmark_overlap, 0);

  console.log('PASS snapshot + validation end-to-end fixture');
} finally {
  await fs.rm(tmp, {recursive: true, force: true});
}

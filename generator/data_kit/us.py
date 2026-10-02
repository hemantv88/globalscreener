"""US stocks (and their benchmarks) from Yahoo Finance - five years once, then only the latest days.

THE STORE (under data/raw/us/):
  days/<ISO>.csv.gz   one file per session: ticker, open, high, low, close, volume - the prices as Yahoo gave them the day they
                      were fetched (auto_adjust=False: split-adjusted at that moment, not dividend-adjusted)
  splits.csv          the store's own split ledger: ticker, ex_date, factor, found_on
  seeded.txt          the tickers that have had their five-year download

HOW IT STAYS RIGHT WITHOUT RE-DOWNLOADING YEARS. Every run fetches the last month for every ticker. When a stock splits, Yahoo
re-scales its whole history, so the month's older sessions come back at a constant ratio to what is stored (2:1 -> x0.5) while
the sessions after the split agree: the first agreeing session is the ex-date, and (ticker, ex_date, factor) goes into splits.csv.
Reading applies the ledger: a stored price before an ex-date x its factor (volume / factor). A one-off disagreement that is not a
clean block at one ratio is logged and left alone. A ticker new to the list gets its own five-year download.
"""
import csv
import datetime as dt
import gzip
import io
import os
import statistics
import time

from .common import Budget, log, path

BATCH, PAUSE = 60, 0.4


def _dir(*p):
    return path("raw", "us", *p)


def _day_path(iso):
    return _dir("days", iso + ".csv.gz")


def day_list():
    d = _dir("days")
    return sorted(f[:10] for f in os.listdir(d) if f.endswith(".csv.gz")) if os.path.isdir(d) else []


def _read_day(iso):
    out = {}
    try:
        with gzip.open(_day_path(iso), "rt", encoding="utf-8") as f:
            for r in csv.reader(f):
                if r and r[0] != "ticker":
                    out[r[0]] = [float(x) if x not in ("", "None") else None for x in r[1:6]]
    except FileNotFoundError:
        pass
    return out


def _write_day(iso, rows):
    os.makedirs(_dir("days"), exist_ok=True)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["ticker", "open", "high", "low", "close", "volume"])
    for t in sorted(rows):
        o, h, l, c, v = rows[t]
        w.writerow([t] + [("" if x is None else (round(x, 4) if i < 4 else int(x))) for i, x in enumerate((o, h, l, c, v))])
    with gzip.open(_day_path(iso) + ".tmp", "wt", encoding="utf-8") as f:
        f.write(buf.getvalue())
    os.replace(_day_path(iso) + ".tmp", _day_path(iso))


def ledger():
    """{ticker: [(ex ISO, factor)]}"""
    out, p = {}, _dir("splits.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8")):
            try:
                out.setdefault(r["ticker"], []).append((r["ex_date"], float(r["factor"])))
            except (KeyError, ValueError):
                pass
    return out


def _factor_at(events, iso):
    f = 1.0
    for ex, x in events:
        if iso < ex:
            f *= x
    return f


def _yahoo(tickers, period):
    """{ticker: {ISO: [o, h, l, c, v]}} - batched; Yahoo's holiday pads and an unfinished US session are dropped."""
    import yfinance as yf
    try:
        from zoneinfo import ZoneInfo
        now_ny = dt.datetime.now(ZoneInfo("America/New_York"))
    except Exception:
        now_ny = dt.datetime.utcnow() - dt.timedelta(hours=5)
    unfinished = now_ny.date().isoformat() if (now_ny.hour, now_ny.minute) < (16, 15) else None
    out = {}
    for i in range(0, len(tickers), BATCH):
        chunk, raw = tickers[i:i + BATCH], None
        for _ in range(3):
            try:
                raw = yf.download(chunk, period=period, interval="1d", group_by="ticker", auto_adjust=False, progress=False, threads=True)
                break
            except Exception:
                time.sleep(2)
        if raw is None:
            log(f"  Yahoo batch failed at {i}"); continue
        for t in chunk:
            try:
                d = (raw[t] if len(chunk) > 1 else raw).copy()
                d.columns = [str(c).lower() for c in d.columns]
                d = d.dropna(subset=["open", "high", "low", "close"])
                ser, prev = {}, None
                for idx, row in d.iterrows():
                    iso = str(idx)[:10]
                    o, h, l, c = float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"])
                    v = float(row.get("volume") or 0)
                    v = 0.0 if v != v else v
                    if (v <= 0 and h == l and prev is not None and c == prev) or iso == unfinished:
                        prev = c; continue          # a holiday pad (flat, no volume, the previous close) / today before the close
                    prev = c
                    ser[iso] = [o, h, l, c, v]
                if ser:
                    out[t] = ser
            except Exception:
                pass
        time.sleep(PAUSE)
    return out


def update(tickers, years=5, recent="1mo", budget=None):
    """Five-year download for tickers not seeded yet; the last month for the rest (split detection); save."""
    budget = budget or Budget(0)
    tickers = sorted(set(tickers))
    seeded_p = _dir("seeded.txt")
    seeded = set(open(seeded_p).read().split()) if os.path.exists(seeded_p) else set()
    dirty, days = set(), {}
    def day(iso):
        if iso not in days:
            days[iso] = _read_day(iso)
        return days[iso]
    todo = [t for t in tickers if t not in seeded]
    if todo:
        log(f"US: {years}-year download for {len(todo)} tickers")
        for i in range(0, len(todo), 300):
            if budget.out():
                log("  time budget reached - the next run resumes the download"); break
            part = todo[i:i + 300]
            got = _yahoo(part, f"{years}y")
            for t, ser in got.items():
                for iso, row in ser.items():
                    day(iso)[t] = row; dirty.add(iso)
                seeded.add(t)
            log(f"  {min(i + 300, len(todo))}/{len(todo)} ({len(got)} with data)")
    rest = [t for t in tickers if t in seeded and t not in todo]
    led, new_splits, skipped, added = ledger(), [], [], 0
    if rest and not budget.out():
        got = _yahoo(rest, recent)
        for t, ser in got.items():
            ev = led.get(t, [])
            overlap = [d for d in sorted(ser) if t in day(d)]
            ratios = []
            for d in overlap:
                st = day(d)[t][3]
                if st:
                    ratios.append((d, ser[d][3] / (st * _factor_at(ev, d))))
            off = [(d, r) for d, r in ratios if abs(r - 1) > 0.005]
            if off:
                f = statistics.median(r for _, r in off)
                clean = all(abs(r / f - 1) < 0.01 for _, r in off) and [d for d, _ in ratios[:len(off)]] == [d for d, _ in off]
                later = [d for d in sorted(ser) if d > off[-1][0]]
                if clean and later and (f < 0.95 or f > 1.05):
                    led.setdefault(t, []).append((later[0], f))
                    new_splits.append((t, later[0], f))
                else:
                    skipped.append(t); continue     # not a clean split: leave the stored history alone this run
            for d, row in ser.items():
                if t not in day(d):
                    day(d)[t] = row; dirty.add(d); added += 1
        log(f"US: last {recent} for {len(rest)} tickers: {added} new rows"
            + (f"; splits found: " + ", ".join(f"{t} {d} x{f:.4f}" for t, d, f in new_splits) if new_splits else "")
            + (f"; {len(skipped)} with an unclear re-adjustment, left alone: {', '.join(skipped[:10])}" if skipped else ""))
    for iso in sorted(dirty):
        _write_day(iso, days[iso])
    os.makedirs(_dir(), exist_ok=True)
    with open(seeded_p, "w") as f:
        f.write("\n".join(sorted(seeded)) + "\n")
    if new_splits or not os.path.exists(_dir("splits.csv")):
        found = {}
        if os.path.exists(_dir("splits.csv")):
            for r in csv.DictReader(open(_dir("splits.csv"), encoding="utf-8")):
                found[(r.get("ticker"), r.get("ex_date"))] = r.get("found_on", "")
        today = dt.date.today().isoformat()
        for t, d, _ in new_splits:
            found[(t, d)] = today
        with open(_dir("splits.csv"), "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(["ticker", "ex_date", "factor", "found_on"])
            for t in sorted(led):
                for ex, x in led[t]:
                    w.writerow([t, ex, f"{x:.8f}", found.get((t, ex), "")])
    log(f"US: {len(day_list())} sessions on file, {len(seeded)} tickers seeded")


def frames(tickers=None):
    """{ticker: DataFrame(open, high, low, close, volume)} over every session on file, adjusted with the split ledger."""
    import pandas as pd
    want = set(tickers) if tickers else None
    acc = {}
    for iso in day_list():
        for t, row in _read_day(iso).items():
            if want is None or t in want:
                acc.setdefault(t, []).append((iso, row))
    led, out = ledger(), {}
    for t, rows in acc.items():
        ev = led.get(t, [])
        data = []
        for iso, (o, h, l, c, v) in rows:
            f = _factor_at(ev, iso)
            data.append([x * f if x is not None else None for x in (o, h, l, c)] + [(v or 0) / f])
        out[t] = pd.DataFrame(data, columns=["open", "high", "low", "close", "volume"], index=pd.to_datetime([r[0] for r in rows]))
    return out

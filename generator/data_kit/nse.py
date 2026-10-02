"""NSE daily market-data store for GlobalScreener.

Primary source: current NSE Full Bhavcopy + Security Deliverable data (delivery % included).
Fallback: current NSE CM-UDiFF Common Bhavcopy Final ZIP when Full Bhavcopy is unavailable.
Corporate actions and index closes come from NSE archives. The adjustment engine is adapted
from the LazyScreen admin's shared kit, with the acquisition layer updated for current UDiFF.

Raw prices remain as traded. Adjusted frames are produced only at read time from the NSE
corporate-action ledger plus conservative price-confirmation rules.
"""
import csv
import datetime as dt
import gzip
import io
import json
import math
import os
import re
import time
import zipfile

from .common import Budget, http_get, log, parse_date, path, read_gz_json, write_gz_json

UDIFF_URL = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_%s_F_0000.csv.zip"
FULL_BHAV_URL = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_%s.csv"
PR_URL = "https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR%s.zip"
IDX_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_%s.csv"
SYMCHG_URL = "https://nsearchives.nseindia.com/content/equities/symbolchange.csv"
SERIES = ("EQ", "BE", "SM", "ST", "BZ", "IV", "RR")
FV_RATIOS = (0.5, 0.25, 0.2, 0.1, 0.05)
norm = lambda s: (s or "").strip().upper().replace("-", "_").replace("&", "_")


def _dir(name):
    return path("raw", "nse", name)


def sessions():
    d = _dir("bhav")
    if not os.path.isdir(d):
        return []
    return sorted(f[:10] for f in os.listdir(d) if f.endswith(".json.gz") and len(f) == 18)


def _rows(raw):
    out = []
    for r in csv.DictReader(io.StringIO(raw)):
        extra = r.pop(None, None)
        r = {(k or "").strip(): (v or "").strip() for k, v in r.items() if isinstance(v, str) or v is None}
        if extra:
            r["_extra"] = ",".join(x for x in extra if isinstance(x, str))
        out.append(r)
    return out


def _zip_first_csv(blob):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        csv_names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if not csv_names:
            raise RuntimeError("NSE ZIP did not contain a CSV")
        # Prefer the main BhavCopy file when a ZIP contains multiple CSVs.
        csv_names.sort(key=lambda n: (0 if "bhavcopy" in os.path.basename(n).lower() else 1, n.lower()))
        name = csv_names[0]
        return name, z.read(name)


def _num(v):
    try:
        s = str(v).strip().replace(",", "")
        if s in ("", "-", "NA", "N/A", "null", "None"):
            return None
        n = float(s)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def _udiff_mapping(rows):
    sample = rows[0] if rows else {}
    key = lambda *names: next((n for n in names if n in sample), names[0])
    return {
        "ticker": key("TckrSymb", "SYMBOL"),
        "series": key("SctySrs", "SERIES"),
        "isin": key("ISIN", "ISINNO"),
        "date": key("TradDt", "TIMESTAMP", "DATE1"),
        "open": key("OpnPric", "OPEN_PRICE", "OPEN"),
        "high": key("HghPric", "HIGH_PRICE", "HIGH"),
        "low": key("LwPric", "LOW_PRICE", "LOW"),
        "close": key("ClsPric", "CLOSE_PRICE", "CLOSE"),
        "prev": key("PrvsClsgPric", "PREV_CLOSE", "PREVCLOSE"),
        "volume": key("TtlTradgVol", "TTL_TRD_QNTY", "TOTTRDQTY"),
        "turnover": key("TtlTrfVal", "TOTTRDVAL", "TURNOVER_LACS"),
    }


def _num(v):
    try:
        s = str(v).strip().replace(",", "")
        if s in ("", "-", "NA", "N/A", "null", "None"):
            return None
        n = float(s)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def _udiff_mapping(rows):
    """Return the current UDiFF-to-internal field mapping for compatibility/tests."""
    sample = rows[0] if rows else {}
    def key(*names):
        return next((n for n in names if n in sample), names[0])
    return {
        "ticker": key("TckrSymb", "SYMBOL"),
        "series": key("SctySrs", "SERIES"),
        "isin": key("ISIN", "ISINNO"),
        "date": key("TradDt", "TIMESTAMP", "DATE1", "DATE"),
        "open": key("OpnPric", "OPEN_PRICE", "OPEN"),
        "high": key("HghPric", "HIGH_PRICE", "HIGH"),
        "low": key("LwPric", "LOW_PRICE", "LOW"),
        "close": key("ClsPric", "CLOSE_PRICE", "CLOSE"),
        "prev": key("PrvsClsgPric", "PREV_CLOSE", "PREVCLOSE"),
        "volume": key("TtlTradgVol", "TTL_TRD_QNTY", "TOTTRDQTY"),
        "turnover": key("TtlTrfVal", "TOTTRDVAL", "TURNOVER_LACS", "TURNOVER"),
    }


def _select_security_rows(rows):
    """Normalize either NSE Full Bhavcopy or current UDiFF rows."""
    sample = rows[0] if rows else {}
    def key(*names):
        return next((n for n in names if n in sample), names[0])

    ticker_k = key("SYMBOL", "TckrSymb")
    series_k = key("SERIES", "SctySrs")
    isin_k = key("ISIN", "ISINNO")
    date_k = key("DATE1", "TradDt", "TIMESTAMP", "DATE")
    open_k = key("OPEN_PRICE", "OpnPric", "OPEN")
    high_k = key("HIGH_PRICE", "HghPric", "HIGH")
    low_k = key("LOW_PRICE", "LwPric", "LOW")
    close_k = key("CLOSE_PRICE", "ClsPric", "CLOSE")
    prev_k = key("PREV_CLOSE", "PrvsClsgPric", "PREVCLOSE")
    vol_k = key("TTL_TRD_QNTY", "TtlTradgVol", "TOTTRDQTY")
    turn_k = key("TURNOVER_LACS", "TtlTrfVal", "TOTTRDVAL", "TURNOVER")
    del_k = key("DELIV_PER", "DELIVERY_PERCENTAGE", "DelvryPct")

    session = next((parse_date(r.get(date_k)) for r in rows if parse_date(r.get(date_k))), None)
    if not session:
        return None, {}

    out, rank = {}, {}
    for r in rows:
        series = (r.get(series_k) or "").strip().upper()
        if series not in SERIES:
            continue
        ticker = norm(r.get(ticker_k))
        c = _num(r.get(close_k))
        if not ticker or c is None or c <= 0:
            continue
        vals = [_num(r.get(k)) for k in (open_k, high_k, low_k)]
        v = _num(r.get(vol_k)) or 0.0
        tr = _num(r.get(turn_k))
        dlv = _num(r.get(del_k))
        if dlv is not None and not (0 <= dlv <= 100):
            dlv = None
        rk = SERIES.index(series)
        if rk < rank.get(ticker, 99):
            out[ticker] = {
                "o": vals[0], "h": vals[1], "l": vals[2], "c": c, "v": v,
                "delivery": dlv, "isin": (r.get(isin_k) or "").strip() or None,
                "series": series, "prevClose": _num(r.get(prev_k)), "turnover": tr,
            }
            rank[ticker] = rk
    return session.isoformat(), out


def _fetch_full_bhav(day):
    # The current NSE Full Bhavcopy also carries DELIV_PER, so it removes a second request per session.
    b = http_get(FULL_BHAV_URL % day.strftime("%d%m%Y"), tries=2, timeout=20)
    if not b:
        return None, {}
    rows = _rows(b.decode("utf-8", "replace"))
    return _select_security_rows(rows)


def _fetch_udiff_bhav(day):
    b = http_get(UDIFF_URL % day.strftime("%Y%m%d"), tries=2, timeout=20)
    if not b:
        return None, {}
    _, raw_bytes = _zip_first_csv(b)
    rows = _rows(raw_bytes.decode("utf-8", "replace"))
    return _select_security_rows(rows)


def fetch_bhav(day):
    """Fetch one NSE session. Prefer current Full Bhavcopy; fall back to UDiFF."""
    try:
        session, rows = _fetch_full_bhav(day)
        if session and rows:
            return session, rows
    except Exception as e:
        log(f"  {day}: Full Bhavcopy failed ({e}); trying UDiFF")
    return _fetch_udiff_bhav(day)


def fetch_ca(iso):
    b = http_get(PR_URL % dt.date.fromisoformat(iso).strftime("%d%m%y"))
    if b is None:
        return None
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        bc = [n for n in z.namelist() if os.path.basename(n).lower().startswith("bc")]
        return z.read(bc[0]).decode("utf-8", "replace") if bc else ""


def fetch_idx(iso):
    b = http_get(IDX_URL % dt.date.fromisoformat(iso).strftime("%d%m%Y"))
    if b is None:
        return None
    out, own = {}, None
    for r in _rows(b.decode("utf-8", "replace")):
        own = own or parse_date(r.get("Index Date"))
        name = (r.get("Index Name") or "").strip().upper()
        vals = [_num(r.get(k)) for k in ("Open Index Value", "High Index Value", "Low Index Value", "Closing Index Value")]
        if name and vals[3] is not None:
            out[name] = vals
    if own and own.isoformat() != iso:
        return None
    return out


def _write_raw_session(iso, rows):
    rows = dict(rows); rows["_meta"] = {"source": "NSE_CM_Full_Bhavcopy_or_UDiFF", "session": iso}
    write_gz_json(os.path.join(_dir("bhav"), iso + ".json.gz"), rows)


def _merge_delivery(iso, delivery):
    if not delivery:
        return
    p = os.path.join(_dir("bhav"), iso + ".json.gz")
    rows = read_gz_json(p, {})
    changed = False
    for s, d in delivery.items():
        if s in rows and isinstance(rows[s], dict) and rows[s].get("delivery") != d:
            rows[s]["delivery"] = d; changed = True
    if changed: write_gz_json(p, rows)


def update_sessions(target_sessions=300, end_date=None, budget=None, sleep=0.35, enrich_delivery=True):
    """Fetch enough calendar dates backward to obtain target_sessions NSE trading sessions."""
    budget = budget or Budget(0)
    end = dt.date.fromisoformat(end_date) if end_date else dt.date.today()
    have = set(sessions())
    saved = 0; checked = 0; days_since = 0; max_calendar = max(target_sessions * 3, 600)
    while len(have) < target_sessions and days_since <= max_calendar:
        if budget.out():
            log(f"NSE: time budget reached; {len(have)} sessions on file")
            break
        d = end - dt.timedelta(days=days_since); days_since += 1
        iso_hint = d.isoformat(); checked += 1
        if iso_hint in have:
            continue
        try:
            session, rows = fetch_bhav(d)
        except Exception as e:
            log(f"  {d}: {e} - retried next run")
            continue
        if not session or not rows:
            time.sleep(sleep); continue
        if session not in have:
            _write_raw_session(session, rows); have.add(session); saved += 1
            if enrich_delivery and not any(v.get("delivery") is not None for v in rows.values() if isinstance(v, dict)):
                try:
                    _merge_delivery(session, fetch_delivery(session))
                except Exception as e:
                    log(f"  {session}: delivery enrichment skipped: {e}")
            time.sleep(sleep)
        if len(have) % 25 == 0:
            log(f"NSE: {len(have)}/{target_sessions} sessions on file; checked {checked} dates")
    # For every session we have, fill missing corporate action and index files. This is resumable.
    ss = [s for s in sessions() if s <= end.isoformat()]
    for sub in ("ca", "idx"):
        os.makedirs(_dir(sub), exist_ok=True)
    for i, iso in enumerate(ss, 1):
        if budget.out():
            log("NSE: time budget reached during CA/index enrichment; next run resumes")
            break
        ca_path = os.path.join(_dir("ca"), iso + ".csv")
        ca_none = ca_path + ".none"
        if not os.path.exists(ca_path) and not os.path.exists(ca_none):
            try:
                txt = fetch_ca(iso)
                if txt is None: open(ca_none, "w").close()
                else: open(ca_path, "w", encoding="utf-8", newline="").write(txt)
            except Exception as e:
                log(f"  CA {iso}: {e} - retried next run")
            time.sleep(sleep)
        idx_path = os.path.join(_dir("idx"), iso + ".json.gz")
        if not os.path.exists(idx_path):
            try:
                ix = fetch_idx(iso)
                if ix is not None: write_gz_json(idx_path, ix)
            except Exception as e:
                log(f"  IDX {iso}: {e} - retried next run")
            time.sleep(sleep)
        if i % 50 == 0: log(f"NSE CA/index: {i}/{len(ss)}")
    try:
        b = http_get(SYMCHG_URL)
        if b and b.count(b"\n") > 100:
            os.makedirs(path("raw", "nse"), exist_ok=True)
            with open(path("raw", "nse", "symbolchange.csv"), "wb") as f: f.write(b)
    except Exception as e:
        log("  symbolchange.csv not refreshed:", e)
    log(f"NSE: saved {saved} new sessions; total {len(sessions())}; index/corporate-action enrichment attempted")


# --- corporate-action ledger / adjustment engine (adapted from the shared kit) ---
def _factor(purpose):
    p = purpose
    m = re.search(r"BONUS\s*(\d+)\s*:\s*(\d+)", p)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a > 0 and b > 0: return b / (a + b), f"bonus {a}:{b}"
    m = re.search(r"(?:SPLT|SPLIT|SUB.?DIVISION).*?(?:RS\.?|RE\.?)\s*([\d.]+).*?(?:TO|-)(?:RS\.?|RE\.?)?\s*([\d.]+)", p)
    if m:
        x, y = float(m.group(1)), float(m.group(2))
        if 0 < y < x: return y / x, f"split {x:g} -> {y:g}"
    m = re.search(r"CONSOLIDAT.*?(?:RS\.?|RE\.?)\s*([\d.]+).*?(?:TO|-)(?:RS\.?|RE\.?)?\s*([\d.]+)", p)
    if m:
        x, y = float(m.group(1)), float(m.group(2))
        if 0 < x < y: return y / x, f"consolidation {x:g} -> {y:g}"
    return None, ""


def ledger():
    latest, d = {}, _dir("ca")
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if not (fn.endswith(".csv") and fn[:4].isdigit()): continue
            for r in _rows(open(os.path.join(d, fn), encoding="utf-8", errors="replace").read()):
                pur = re.sub(r"\s+", " ", ((r.get("PURPOSE") or "") + ("," + r["_extra"] if r.get("_extra") else "")).upper()).strip()
                sym, ex = norm(r.get("SYMBOL")), parse_date(r.get("EX_DT"))
                if sym and ex and pur: latest[(sym, pur, r.get("RECORD_DT") or ex.isoformat())] = ex.isoformat()
    ev, dem, seen = {}, {}, set()
    for (sym, pur, _), ex in latest.items():
        f, words = _factor(pur)
        if f is not None and (sym, ex, words) not in seen:
            seen.add((sym, ex, words)); ev.setdefault(sym, []).append((ex, f, words))
        elif f is None and re.search(r"DEMERG|ARRANGEMENT", pur): dem.setdefault(sym, set()).add(ex)
    return ev, dem


def symbol_changes():
    p, out = path("raw", "nse", "symbolchange.csv"), []
    if not os.path.exists(p): return out
    for line in open(p, encoding="utf-8", errors="replace"):
        parts = [x.strip() for x in line.strip().split(",")]
        if len(parts) >= 4:
            old, new, d = norm(parts[-3]), norm(parts[-2]), parse_date(parts[-1])
            if old and new and d and old != new: out.append((old, new, d.isoformat()))
    return out


def _load_raw(keys, since=None):
    want, out = set(keys), {}
    for s in sessions():
        if since and s < since: continue
        rows = read_gz_json(os.path.join(_dir("bhav"), s + ".json.gz"), {})
        for k in (want.intersection(rows) if want else (x for x in rows if not x.startswith("_"))):
            r = rows[k]
            if isinstance(r, dict) and r.get("c"):
                out.setdefault(k, []).append((s, r.get("o"), r.get("h"), r.get("l"), r.get("c"), r.get("v", 0), r.get("delivery"), r.get("isin"), r.get("series")))
    return out


def _adjust(rows, events, demergers):
    n = len(rows)
    if n < 2: return rows, [], []
    at, applied, refused, by_ex = {}, [], [], {}
    for ex, f, words in events:
        g = by_ex.setdefault(ex, [1.0, []]); g[0] *= f; g[1].append(words)
    for ex, (f, ws) in sorted(by_ex.items()):
        words = " + ".join(ws)
        idx = next((i for i, r in enumerate(rows) if r[0] >= ex), None)
        if idx is None or idx == 0: continue
        best = None
        for k in range(max(1, idx - 2), min(n, idx + 4)):
            a = (rows[k][4] / rows[k - 1][4]) / f
            if best is None or abs(math.log(max(a, 1e-12))) < abs(math.log(max(best[1], 1e-12))): best = (k, a)
        k, a = best
        if 0.75 <= a <= 1.35 and k not in at:
            at[k] = f; applied.append((rows[k][0], round(f, 6), words))
        else: refused.append((ex, words))
    for k in range(1, n):
        if k in at: continue
        (d0, _, _, _, c0, _, _, _, _), (d1, o1, _, _, c1, _, _, _, _) = rows[k - 1], rows[k]
        if not c0 or c1 / c0 > 0.6 or d1 in demergers or (dt.date.fromisoformat(d1) - dt.date.fromisoformat(d0)).days > 7: continue
        g = o1 / c0
        f = min(FV_RATIOS, key=lambda x: abs(math.log(g / x)))
        if abs(g / f - 1) > 0.025 or abs((c1 / c0) / f - 1) > 0.12: continue
        vb = [x[5] for x in rows[max(0, k - 20):k]]; va = [x[5] for x in rows[k:min(n, k + 10)]]
        if vb and va and sum(vb) > 0 and (sum(va) / len(va)) / (sum(vb) / len(vb)) >= 0.4 / f:
            at[k] = f; applied.append((d1, f, f"split 1:{round(1 / f)} (not on NSE's list)"))
    if not at: return rows, applied, refused
    mult, m = [1.0] * n, 1.0
    for i in range(n - 1, -1, -1):
        mult[i] = m
        if i in at: m *= at[i]
    out = []
    for i, (s, o, h, l, c, v, dlv, isin, series) in enumerate(rows):
        f = mult[i]
        out.append((s, o*f if o is not None else None, h*f if h is not None else None, l*f if l is not None else None, c*f if c is not None else None, (v or 0)/f, dlv, isin, series))
    return out, sorted(applied), refused


def frames(symbols=None, active_days=300, report=None):
    import pandas as pd
    ss = sessions(); changes = symbol_changes(); auto = symbols is None
    if auto:
        symbols = set()
        for s in ss[-active_days:]:
            symbols |= {k for k in read_gz_json(os.path.join(_dir("bhav"), s + ".json.gz"), {}) if not k.startswith("_")}
        since = ss[-active_days] if len(ss) >= active_days else (ss[0] if ss else "")
        renamed_away = {old for old, new, d in changes if old in symbols and new in symbols and d >= since}
        symbols -= renamed_away
    keys = {norm(s) for s in symbols}
    prev, nxt = {}, {}
    for old, new, d in changes:
        prev.setdefault(new, []).append((old, d)); nxt.setdefault(old, []).append((new, d))
    def walk(m, k, depth=0):
        out = []
        for x, d in m.get(k, []):
            out.append((x, d))
            if depth < 4: out += walk(m, x, depth + 1)
        return out
    olds = {k: walk(prev, k) for k in keys}; news = {k: walk(nxt, k) for k in keys}
    allkeys = keys | {o for v in olds.values() for o, _ in v} | {n for v in news.values() for n, _ in v}
    raw = _load_raw(allkeys)
    ev, dem = ledger(); out = {}
    for k in sorted(keys):
        rows, events, dems = list(raw.get(k, [])), list(ev.get(k, [])), set(dem.get(k, set()))
        for old, d in sorted(olds[k], key=lambda x: x[1], reverse=True):
            first = rows[0][0] if rows else None
            older = [r for r in raw.get(old, []) if r[0] < d and (first is None or r[0] < first)]
            if older:
                rows = older + rows; events += [e for e in ev.get(old, []) if e[0] < d]; dems |= {x for x in dem.get(old, set()) if x < d}
        for new, d in sorted(news[k], key=lambda x: x[1]):
            last = rows[-1][0] if rows else None
            if last and abs((dt.date.fromisoformat(d) - dt.date.fromisoformat(last)).days) <= 10:
                newer = [r for r in raw.get(new, []) if r[0] >= d and r[0] > last]
                if newer:
                    rows += newer; events += [e for e in ev.get(new, []) if e[0] >= d]; dems |= {x for x in dem.get(new, set()) if x >= d}
        if not rows: continue
        rows.sort(key=lambda r: r[0])
        adj, applied, refused = _adjust(rows, sorted(events), dems)
        if report is not None and (applied or refused): report[k] = {"applied": applied, "not_confirmed": refused}
        out[k] = pd.DataFrame([r[1:] for r in adj], columns=["open","high","low","close","volume","delivery","isin","series"], index=pd.to_datetime([r[0] for r in adj]))
    return out


def index_frames(names=None):
    import pandas as pd
    want = {n.upper() for n in names} if names else None; acc = {}; d = _dir("idx")
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".json.gz"):
                for k, v in (read_gz_json(os.path.join(d, fn), {}) or {}).items():
                    if (want is None or k.upper() in want) and v and v[3] is not None:
                        acc.setdefault(k.upper(), []).append((fn[:10], v[0] or v[3], v[1] or v[3], v[2] or v[3], v[3]))
    return {n: pd.DataFrame([r[1:] for r in rs], columns=["open","high","low","close"], index=pd.to_datetime([r[0] for r in rs])) for n, rs in acc.items()}

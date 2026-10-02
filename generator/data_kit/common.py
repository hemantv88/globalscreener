"""Shared helpers: polite HTTP with retries, gzip JSON files, dates, logging."""
import datetime as dt
import gzip
import json
import os
import time
import urllib.error
import urllib.request

# NSE's archive (nsearchives.nseindia.com) answers a plain browser-like request; it is not the walled www.nseindia.com API.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/",
}

# every store lives under DATA_DIR (default: ./data, i.e. inside the repo)
DATA_DIR = os.environ.get("DATA_DIR", "data")


def path(*parts):
    return os.path.join(DATA_DIR, *parts)


def log(*a):
    print(*a, flush=True)


def http_get(url, tries=3, timeout=30):
    """The body as bytes; None for a 404 (NSE answers a day it has no file for with 404). Other failures are retried,
    then raised."""
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
            time.sleep(3 * (k + 1))
        except Exception as e:
            last = e
            time.sleep(2 * (k + 1))
    raise RuntimeError(f"{url}: {last}")


def read_gz_json(p, default=None):
    try:
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_gz_json(p, obj):
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    with gzip.open(p + ".tmp", "wt", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(p + ".tmp", p)


def parse_date(s):
    """A date in any of the forms NSE uses (they changed formats in late Oct 2025), or None."""
    s = (s or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y", "%d-%B-%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


class Budget:
    """A time budget shared by the steps of one run (0 = no limit), so a long backfill stops cleanly and the next run resumes."""

    def __init__(self, seconds=0):
        self.t0, self.seconds = time.time(), seconds or 0

    def left(self):
        return float("inf") if not self.seconds else self.seconds - (time.time() - self.t0)

    def out(self):
        return self.left() <= 0

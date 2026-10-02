import tempfile
import re
from unittest import mock
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'generator'))

import data_kit.common as common
from data_kit import nse

def full_csv(iso):
    return (
        "SYMBOL,SERIES,ISIN,DATE1,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,"
        "PREV_CLOSE,TTL_TRD_QNTY,TURNOVER_LACS,DELIV_PER\n"
        f"TEST,EQ,INE000000000,{iso},99,101,98,100.5,98.5,12345,678900,42.5\n"
        f"TEST,BE,INE000000001,{iso},99,101,98,100.4,98.4,12345,678900,40.0\n"
        f"SECOND,EQ,INE000000002,{iso},199,201,198,200.5,198.5,22345,778900,55.0\n"
    ).encode()

def index_csv(iso):
    return (
        "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value\n"
        f"NIFTY 500,{iso},100,102,99,101\n"
        f"NIFTY 50,{iso},200,202,199,201\n"
        f"INDIA VIX,{iso},15,16,14,15.5\n"
    ).encode()

with tempfile.TemporaryDirectory() as td:
    old = common.DATA_DIR
    common.DATA_DIR = td
    try:
        responses = {
            "20261001": full_csv("01-Oct-2026"),
            "20260930": full_csv("30-Sep-2026"),
            "20260929": full_csv("29-Sep-2026"),
        }

        def fake_get(url, tries=3, timeout=30):
            if "sec_bhavdata_full_" in url:
                key = re.search(r"sec_bhavdata_full_(\d{8})\.csv$", url).group(1)
                key = f"{key[4:8]}{key[2:4]}{key[:2]}"  # DDMMYYYY -> YYYYMMDD
                return responses[key]
            if "ind_close_all_" in url:
                key = re.search(r"ind_close_all_(\d{8})\.csv$", url).group(1)
                # URL date is DDMMYYYY.
                iso = f"{key[4:8]}-{key[2:4]}-{key[:2]}"
                return index_csv(iso)
            if "PR" in url or "symbolchange" in url:
                return None
            raise AssertionError(f"Unexpected URL: {url}")

        with mock.patch.object(nse, "http_get", side_effect=fake_get):
            nse.update_sessions(target_sessions=3, end_date="2026-10-01",
                                budget=nse.Budget(30), sleep=0, enrich_delivery=True)
            assert nse.sessions() == ["2026-09-29", "2026-09-30", "2026-10-01"]

            frames = nse.frames(["TEST", "SECOND"], active_days=3)
            assert set(frames) == {"TEST", "SECOND"}
            assert len(frames["TEST"]) == 3
            assert frames["TEST"]["close"].iloc[-1] == 100.5
            assert frames["TEST"]["delivery"].iloc[-1] == 42.5

            indices = nse.index_frames(["NIFTY 500", "NIFTY 50", "INDIA VIX"])
            assert set(indices) == {"NIFTY 500", "NIFTY 50", "INDIA VIX"}
            assert len(indices["NIFTY 500"]) == 3
            assert indices["NIFTY 500"]["close"].iloc[-1] == 101

            # EQ must win over BE for the same ticker.
            assert frames["TEST"]["close"].iloc[-1] == 100.5

        print("PASS NSE acquisition -> store -> frames -> index_frames integration fixture")
    finally:
        common.DATA_DIR = old

import os, tempfile, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'generator'))
import data_kit.common as common
from data_kit import us

with tempfile.TemporaryDirectory() as td:
    old=common.DATA_DIR; common.DATA_DIR=td
    try:
        calls=[]
        def fake_yahoo(tickers, period):
            calls.append((tuple(tickers),period))
            return {t:{
                '2026-09-29':[100,102,99,101,1000],
                '2026-09-30':[101,103,100,102,1100],
                '2026-10-01':[102,104,101,103,1200]} for t in tickers}
        us._yahoo=fake_yahoo
        us.update(['AAA','SPY'], years=2, recent='1mo', budget=us.Budget(30))
        assert calls and calls[0][1]=='2y'
        frames=us.frames(['AAA','SPY'])
        assert set(frames)=={'AAA','SPY'}
        assert len(frames['AAA'])==3
        assert frames['AAA']['close'].iloc[-1]==103
        assert us.day_list()==['2026-09-29','2026-09-30','2026-10-01']
        print('PASS US acquisition -> store -> frames integration fixture')
    finally:
        common.DATA_DIR=old
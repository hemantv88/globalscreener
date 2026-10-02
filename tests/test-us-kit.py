import gzip, csv, os, tempfile, sys
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'generator'))
import data_kit.common as common
from data_kit import us

with tempfile.TemporaryDirectory() as td:
    old=common.DATA_DIR; common.DATA_DIR=td
    try:
        os.makedirs(Path(td)/'raw'/'us'/'days', exist_ok=True)
        us._write_day('2026-10-01', {'AAA':[99,101,98,100.5,1000], 'BBB':[49,51,48,50,2000]})
        with open(Path(td)/'raw'/'us'/'splits.csv','w',encoding='utf8') as f:
            f.write('ticker,ex_date,factor,found_on\nAAA,2026-10-01,0.5,2026-10-02\n')
        frames=us.frames(['AAA','BBB'])
        assert set(frames)=={'AAA','BBB'}
        assert frames['AAA']['close'].iloc[0] == 50.25
        assert frames['AAA']['volume'].iloc[0] == 2000
        assert frames['BBB']['close'].iloc[0] == 50
        print('PASS US split-ledger frame adjustment')
    finally:
        common.DATA_DIR=old
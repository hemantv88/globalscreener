import io, os, tempfile, zipfile
from unittest import mock
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'generator'))
from data_kit import nse

def makezip(text):
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('BhavCopy_NSE_CM_0_0_0_20261001_F_0000.csv',text)
    return b.getvalue()

csv='TckrSymb,SctySrs,ISIN,TradDt,OpnPric,HghPric,LwPric,ClsPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal\nTEST,EQ,INE000000000,2026-10-01,99,101,98,100.5,98.5,12345,678900\nSKIP,BE,INE000000001,2026-10-01,10,12,9,11,10,100,200\n'
old_data_dir=os.environ.get('DATA_DIR')
with tempfile.TemporaryDirectory() as td:
    data=makezip(csv)
    name,raw=nse._zip_first_csv(data)
    assert 'BhavCopy' in name
    rows=nse._rows(raw.decode())
    m=nse._udiff_mapping(rows)
    assert m['ticker']=='TckrSymb' and m['close']=='ClsPric'
    full_csv=b"""SYMBOL,SERIES,ISIN,DATE1,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY,TURNOVER_LACS,DELIV_PER
TEST,EQ,INE000000000,01-Oct-2026,99,101,98,100.5,98.5,12345,678900,42.5
"""
    with mock.patch.object(nse,'http_get',return_value=full_csv):
        got,parsed=nse.fetch_bhav(__import__('datetime').date(2026,10,1))
        assert got=='2026-10-01' and parsed['TEST']['c']==100.5 and parsed['TEST']['delivery']==42.5
    with mock.patch.object(nse,'http_get',side_effect=[RuntimeError('full unavailable'),data]):
        got,parsed=nse.fetch_bhav(__import__('datetime').date(2026,10,1))
        assert got=='2026-10-01' and parsed['TEST']['c']==100.5 and parsed['SKIP']['series']=='BE'
    # Real NSE corporate-action syntax variants must parse correctly.
    assert nse._factor("FVSPLT FRM RS 10 TO RE 1")[0] == 0.1
    assert nse._factor("FVSPLT FRMRS 100 TO RE 1")[0] == 0.01
    assert nse._factor("FVSPLT FRM RS 5 TO RS 2")[0] == 0.4
    assert nse._factor("BONUS 2:1")[0] == 1/3
    assert nse._factor("BONUS 4:1")[0] == 1/5

    # Combined 2:1 bonus + 10:1 face-value split should be ~1/30 price factor.
    rows_combined=[
      ('2026-09-29',3000,3005,2990,3000,1000,50,None,'EQ'),
      ('2026-10-01',100.5,101,99.5,100,30000,50,None,'EQ'),
    ]
    out,applied,refused=nse._adjust(
        rows_combined,
        [('2026-10-01',1/3,'bonus 2:1'),('2026-10-01',0.1,'split 10 -> 1')],
        set()
    )
    assert applied and abs(out[0][1]-100) < 0.1 and abs(out[0][5]-30000) < 10

    # split adjustment fixture: 1:1 bonus halves prior price and doubles prior volume.
    os.environ['DATA_DIR']=td
    rows=[
      ('2026-09-29',100,102,98,100,1000,50,None,'EQ'),
      ('2026-09-30',100,102,99,101,1100,50,None,'EQ'),
      ('2026-10-01',50.5,52,50,51,2200,50,None,'EQ'),
    ]
    out,applied,refused=nse._adjust(rows,[('2026-10-01',0.5,'bonus 1:1')],set())
    assert applied and out[0][1]==50 and out[0][5]==2000
if old_data_dir is not None: os.environ['DATA_DIR']=old_data_dir
else: os.environ.pop('DATA_DIR',None)
print('PASS NSE UDiFF parser + adjustment engine fixtures')


# Logging must not contaminate stdout used for machine-readable JSON bridges.
from data_kit.common import log
with mock.patch("sys.stderr") as err, mock.patch("sys.stdout") as out:
    log("diagnostic")
    assert out.write.call_count == 0
    assert err.write.call_count > 0

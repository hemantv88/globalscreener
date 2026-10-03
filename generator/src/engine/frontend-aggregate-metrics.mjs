/*
 * GlobalScreener GitHub-only aggregate metrics parity layer.
 * Baseline index.html blob: c2ade50a605a5d7c32df3e679d02e03e763fd4c4
 *
 * The browser baseline keeps the universe/state in globals. This extraction
 * makes the dependency explicit: pass the current universe items and the
 * pivot-above-zone vocabulary.
 */
export function calcMetrics(items,abovePivZones=['PP→R1','R1→R2','R2+']){
  const rows=(items||[]).filter(Boolean);
  const n=rows.length; if(!n) return null;
  return{
    a20:  rows.filter(d=>d.e20&&d.price>d.e20).length,
    a200: rows.filter(d=>d.e200&&d.price>d.e200).length,
    rhi:  rows.filter(d=>d.rsi14!=null&&d.rsi14>=60).length,
    apiv: rows.filter(d=>abovePivZones.includes(d.dpz)).length,
    n52:  rows.filter(d=>d.h52d!=null&&d.h52d>=-10).length,
    vexp: rows.filter(d=>d.vRatio!=null&&d.vRatio>=1.5).length,
    bo:   rows.filter(d=>d.boGain!=null&&d.boCnt>0).length,
    total:n,
  };
}

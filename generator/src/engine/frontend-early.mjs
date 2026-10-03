/* GlobalScreener Early Breakout parity layer. */

/* Mirrored from index.html baseline blob c2ade50a605a5d7c32df3e679d02e03e763fd4c4. */

export function earlyFinite(v){return typeof v==='number'&&isFinite(v);}

export function earlyMinTrigger(d){
  if(!d) return null;
  const p=earlyFinite(d.price)?d.price:null;
  if(p==null||p<=0) return null;
  const vals=[];
  if(earlyFinite(d.dBoxTop)&&d.dBoxTop>0) vals.push(100*(d.dBoxTop-p)/p);
  if(earlyFinite(d.vcpLid)&&d.vcpLid>0) vals.push(100*(d.vcpLid-p)/p);
  if(earlyFinite(d.ipoLid)&&d.ipoLid>0) vals.push(100*(d.ipoLid-p)/p);
  if(!vals.length) return null;
  return +Math.max(0,Math.min(...vals)).toFixed(2);
}

export function earlyRSPLead(d){
  if(!d) return {pts:0,lead:false,cross:false};
  let pts=0;
  if(earlyFinite(d.rsp21)){if(d.rsp21>=90) pts+=8; else if(d.rsp21>=80) pts+=5;}
  if(earlyFinite(d.rsp55)&&d.rsp55>=85) pts+=3;
  if(earlyFinite(d.rsSlope)&&d.rsSlope>0) pts+=5;
  if(earlyFinite(d.rs21)&&d.rs21>0) pts+=4;
  let cross=false;
  const h=d.rspHist21;
  if(Array.isArray(h)&&h.length>=2){
    for(let i=h.length-1;i>0;i--){
      const a=h[i-1],b=h[i];
      if(earlyFinite(a)&&earlyFinite(b)&&a<=80&&b>90){cross=true;break;}
    }
  }
  if(cross) pts=Math.min(20,pts+3);
  return {pts:Math.min(20,pts),lead:(earlyFinite(d.rsp21)&&d.rsp21>=90),cross};
}

export function earlyCompression(d){
  if(!d) return 0;
  let p=0;
  if(earlyFinite(d.coil)){if(d.coil<=0.70)p+=8;else if(d.coil<=0.85)p+=6;else if(d.coil<=1)p+=3;}
  if(earlyFinite(d.tight)){if(d.tight<=50)p+=5;else if(d.tight<=60)p+=4;else if(d.tight<=75)p+=2;}
  if(earlyFinite(d.consolDays)){if(d.consolDays>=10)p+=4;else if(d.consolDays>=5)p+=3;else if(d.consolDays>=3)p+=1;}
  if(earlyFinite(d.sq)){if(d.sq>=75)p+=3;else if(d.sq>=65)p+=2;}
  return Math.min(20,p);
}

export function earlyVolumeScore(d){
  if(!d) return {pts:0,phase:'unknown'};
  let p=0;
  if(earlyFinite(d.volDryRatio)){if(d.volDryRatio<0.75)p+=5;else if(d.volDryRatio<1)p+=3;}
  if(earlyFinite(d.earlyPostThrustPre)){if(d.earlyPostThrustPre<=0.75)p+=4;else if(d.earlyPostThrustPre<=1)p+=2;}
  if(earlyFinite(d.earlyVolTrend)){if(d.earlyVolTrend>=1.50)p+=6;else if(d.earlyVolTrend>=1.15)p+=4;else if(d.earlyVolTrend>=1.05)p+=2;}
  if(earlyFinite(d.earlyUpDown10)){if(d.earlyUpDown10>=1.50)p+=5;else if(d.earlyUpDown10>=1.20)p+=3;}
  const phase=earlyFinite(d.earlyVolTrend)&&d.earlyVolTrend>=1.15?'expanding':
              earlyFinite(d.volDryRatio)&&d.volDryRatio<1?'drying':'neutral';
  return {pts:Math.min(20,p),phase};
}

export function earlyTrendScore(d){
  if(!d) return 0;
  let p=0;
  if(earlyFinite(d.pct20e)&&d.pct20e>0)p+=5;
  if(earlyFinite(d.pct50e)&&d.pct50e>0)p+=5;
  if(earlyFinite(d.pct200e)&&d.pct200e>-10)p+=5;
  if(earlyFinite(d.slope200)&&d.slope200>0)p+=5;
  return p;
}

export function earlyStructureScore(d){
  if(!d) return {pts:0,dist:null};
  const dist=earlyMinTrigger(d); let p=0;
  if(dist!=null){if(dist<=3)p+=10;else if(dist<=5)p+=8;else if(dist<=10)p+=5;else if(dist<=15)p+=3;}
  if(d.dBoxState==='near'||d.dBoxState==='inside')p+=4;
  if(earlyFinite(d.vcpToLid)&&d.vcpToLid>=0&&d.vcpToLid<=3)p+=3;
  if(earlyFinite(d.ipoToLid)&&d.ipoToLid>=0&&d.ipoToLid<=3)p+=3;
  return {pts:Math.min(20,p),dist};
}

export function calcEarlyBreakout(d,market){
  if(!d) return null;
  const rs=earlyRSPLead(d), vol=earlyVolumeScore(d), tr=earlyTrendScore(d), co=earlyCompression(d), st=earlyStructureScore(d);
  const score=Math.max(0,Math.min(100,tr+rs.pts+co+vol.pts+st.pts));
  const bo=(d.boAge!=null&&isFinite(d.boAge)&&d.boAge<=5);
  let state='developing';
  if(bo) state='breakout';
  else if(score>=80 && st.dist!=null && st.dist<=5 && vol.phase==='expanding') state='prime';
  else if(score>=70 && st.dist!=null && st.dist<=10) state='watch';
  else if(score>=60) state='accumulation';
  const regime=d.marketRegime||'unknown';
  return {score,state,trend:tr,rs:rs.pts,rsLead:rs.lead,rsCross:rs.cross,compression:co,volume:vol.pts,volumePhase:vol.phase,structure:st.pts,triggerDist:st.dist,marketRegime:regime};
}


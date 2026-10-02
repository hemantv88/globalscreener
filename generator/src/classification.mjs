import fs from 'node:fs/promises';
import path from 'node:path';

const FIELDS=[
  'market','sym','isin','classification_source','classification_version',
  'macro_economic_sector','macro_code','sector','sector_code',
  'industry','industry_code','basic_industry','basic_industry_code',
  'mapping_status','effective_from','effective_to','verified_on','evidence_ref'
];

function splitCsv(line){
  const out=[]; let cur='', quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){ if(quoted && line[i+1]==='"'){cur+='"';i++;} else quoted=!quoted; }
    else if(ch===',' && !quoted){out.push(cur);cur='';}
    else cur+=ch;
  }
  out.push(cur); return out;
}

export async function loadClassificationMap(root, market='IN'){
  const file=path.join(root,'config','classification',market+'.csv');
  try{await fs.access(file);}catch{return new Map();}
  const raw=await fs.readFile(file,'utf8');
  const lines=raw.split(/\r?\n/).filter(x=>x.trim() && !x.trim().startsWith('#'));
  if(!lines.length)return new Map();
  const header=splitCsv(lines.shift()).map(x=>x.trim());
  for(const f of ['market','sym','classification_source','mapping_status']) if(!header.includes(f)) throw new Error(`Classification map missing required column: ${f}`);
  const pos=Object.fromEntries(header.map((x,i)=>[x,i]));
  const map=new Map();
  for(const line of lines){
    const v=splitCsv(line); const row={};
    for(const f of header) row[f]=(v[pos[f]]??'').trim()||null;
    const key=`${String(row.market||market).toUpperCase()}:${String(row.sym||'').toUpperCase()}`;
    if(!row.sym) throw new Error('Classification map contains row without sym');
    if(map.has(key)) throw new Error('Duplicate classification mapping: '+key);
    row.market=String(row.market||market).toUpperCase(); row.sym=String(row.sym).toUpperCase();
    if(!['verified','inferred','unmapped','historical'].includes(row.mapping_status)) throw new Error('Invalid mapping_status for '+key+': '+row.mapping_status);
    map.set(key,row);
  }
  return map;
}

export function applyClassification(stock, map, market='IN'){
  const key=`${market}:${String(stock?.sym??stock?.ticker??'').toUpperCase()}`;
  const m=map.get(key);
  const defaults={
    classification_source:null,classification_version:null,
    macro_economic_sector:null,macro_code:null,sector:null,sector_code:null,
    industry:null,industry_code:null,basic_industry:null,basic_industry_code:null,
    mapping_status:'unmapped',effective_from:null,effective_to:null,verified_on:null,evidence_ref:null
  };
  if(!m) return {...stock,...defaults};
  const out={...stock};
  for(const f of FIELDS) if(f!=='market'&&f!=='sym'&&m[f]!==undefined) out[f]=m[f];
  return out;
}

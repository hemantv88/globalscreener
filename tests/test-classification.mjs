import assert from 'node:assert/strict';
import {applyClassification, loadClassificationMap} from '../generator/src/classification.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gs-class-'));
try{
 await fs.mkdir(path.join(tmp,'config','classification'),{recursive:true});
 await fs.writeFile(path.join(tmp,'config','classification','IN.csv'),
  'market,sym,classification_source,mapping_status,sector,industry\n'+
  'IN,ABC,NSE_Indices,verified,Information Technology,IT Services\n');
 const map=await loadClassificationMap(tmp,'IN');
 assert.equal(map.size,1);
 const a=applyClassification({sym:'ABC'},map,'IN');
 assert.equal(a.sector,'Information Technology'); assert.equal(a.mapping_status,'verified');
 const b=applyClassification({sym:'XYZ'},map,'IN');
 assert.equal(b.mapping_status,'unmapped'); assert.equal(b.sector,null);
 console.log('PASS classification map loader/apply');
}finally{await fs.rm(tmp,{recursive:true,force:true});}

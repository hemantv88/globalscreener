import assert from 'node:assert/strict';
import {buildGroupRows,buildHierarchy} from '../generator/src/group-analytics.mjs';

const mk=(sym,sector,rs55,rs21,rs10w,p50=5,eligible=true)=>({
  sym,sector,industry:'Industry '+sector,macro_economic_sector:'Macro '+sector,screenEligible:eligible,
  derived:{rs55,rs21,rs10w,pct50e:p50}
});
const rows=buildGroupRows([
  mk('A','Tech',30,35,20),mk('B','Tech',20,25,15),mk('C','Tech',10,12,8),
  mk('D','Energy',-5,-2,-1),mk('E','Energy',-10,-4,-3),mk('F','Energy',-15,-6,-5),
  mk('G','Tech',100,100,100,10,false)
],{level:'sector',minMembers:3});
assert.equal(rows.length,2);
assert.equal(rows[0].name,'Tech');
assert.ok(['Powering Up','Turning Up','Cooling','Falling Back'].includes(rows[0].state));
assert.ok(rows[0].flow>=0&&rows[0].flow<=100);
assert.equal(rows[0].members,3);
const h=buildHierarchy([
  mk('A','Tech',30,35,20),mk('B','Tech',20,25,15),mk('C','Tech',10,12,8),
  mk('D','Energy',-5,-2,-1),mk('E','Energy',-10,-4,-3),mk('F','Energy',-15,-6,-5)
]);
assert.equal(h.macro.length,2);assert.equal(h.sector.length,2);assert.equal(h.industry.length,2);
console.log('PASS group analytics hierarchy and breadth');

import test from 'node:test';
import assert from 'node:assert/strict';
import {findCodeBoundary} from './find-processor-creation.mjs';
test('finds first code block including adjacent and exact upper-bound deployments',async()=>{
 for(const creation of [1n,42n,72360297n]){
  let calls=0;
  const got=await findCodeBoundary(async n=>{calls++;return n>=creation;},72360297n);
  assert.equal(got,creation);assert.ok(calls<=29);
 }
});
test('rejects missing/genesis code and propagates historical read failure',async()=>{
 await assert.rejects(findCodeBoundary(async()=>false,100n),/no processor code/);
 await assert.rejects(findCodeBoundary(async()=>true,100n),/genesis/);
 await assert.rejects(findCodeBoundary(async n=>{if(n===50n)throw Error('archive unavailable');return n>=70n;},100n),/archive unavailable/);
});

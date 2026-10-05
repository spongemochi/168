import test from 'node:test';import assert from 'node:assert/strict';
import {collectGasPrice} from './gas-price.mjs';
const chain={rpc:{urls:['https://a.test','https://b.test'],strictQuorum:2}};
const response=result=>({ok:true,json:async()=>({id:168,result})});
test('gas recommendations may differ; choose the larger valid independent quote',async()=>{
 const result=await collectGasPrice(chain,{fetchImpl:async url=>response(url.includes('a.test')?'0x1406f40':'0x1312d01')});
 assert.equal(result.price,'21000000');assert.equal(result.operators,2);
});
test('failed, malformed and repeated operator quotes cannot satisfy the operator count',async()=>{
 for(const bad of ['0x0','not-hex','0x'+'f'.repeat(65)])await assert.rejects(collectGasPrice(chain,{fetchImpl:async url=>response(url.includes('a.test')?'0x1406f40':bad)}),/1\/2/);
 await assert.rejects(collectGasPrice({...chain,rpc:{...chain.rpc,operatorOf:()=> 'same'}},{fetchImpl:async()=>response('0x1406f40')}),/1\/2/);
 await assert.rejects(collectGasPrice(chain,{fetchImpl:async()=>{throw Error('timeout');}}),/0\/2/);
});

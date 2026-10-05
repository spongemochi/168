import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyHistoricalProcessor} from './rebuild-identity.mjs';
import {PROCESSOR} from '../app/scoring/rules.mjs';
import {tchain} from '../vendor/tapesend.bundle.mjs';

test('real SDK pins processor 168 historically and reverse lookup needs no 80-entry scan',async()=>{
  const calls=[],block='0x450219a';
  const fetchImpl=async(url,init)=>{
    const payload=JSON.parse(init.body),batch=Array.isArray(payload),requests=batch?payload:[payload];
    const replies=requests.map(r=>{
      calls.push({url,method:r.method,params:r.params});
      if(r.method==='eth_chainId')return {id:r.id,result:'0xc4'};
      assert.equal(r.method,'eth_call');assert.equal(r.params[1],block);
      assert.equal(r.params[0].data,'0x4bc7cbbd'+168n.toString(16).padStart(64,'0'));
      return {id:r.id,result:'0x'+PROCESSOR.slice(2).padStart(64,'0')};
    });
    return Response.json(batch?replies:replies[0]);
  };
  const chain=tchain.createTapeSendChains({fetchImpl}).get(196);
  const result=await verifyHistoricalProcessor(chain,{committed_block:72360346});
  assert.equal(result.processor,PROCESSOR);assert.equal(result.block,block);
  const count=calls.length;
  assert.equal(await chain.identity.cpuIndexOf(PROCESSOR,block),168n);
  assert.equal(calls.length,count,'reverse lookup must reuse the strictly verified registry entry');
});
test('wrong historical registry mapping and unavailable reads never fall back to current state',async()=>{
  const requested=[],chain={chainId:196,assertChain:async()=>{},identity:{cpuAt:async(index,block)=>{requested.push({index,block});return '0x'+'9'.repeat(40);}}};
  await assert.rejects(verifyHistoricalProcessor(chain,{committed_block:10}),/does not match/);
  assert.deepEqual(requested,[{index:168n,block:'0xa'}]);
  chain.identity.cpuAt=async()=>{throw Error('two independent nodes unavailable');};
  await assert.rejects(verifyHistoricalProcessor(chain,{committed_block:10}),/two independent/);
  await assert.rejects(verifyHistoricalProcessor(chain,{committed_block:0}),/invalid historical/);
});
test('real SDK still rejects a single operator and conflicting historical mappings',async()=>{
  for(const conflict of [false,true]){
    const fetchImpl=async(url,init)=>{
      const host=new URL(url).hostname,payload=JSON.parse(init.body),batch=Array.isArray(payload);
      const replies=(batch?payload:[payload]).map(r=>{
        if(r.method==='eth_chainId')return {id:r.id,result:'0xc4'};
        if(host==='xlayer.drpc.org')return conflict?{id:r.id,result:'0x'+'9'.repeat(64)}:{id:r.id,error:{message:'unavailable'}};
        return {id:r.id,result:'0x'+PROCESSOR.slice(2).padStart(64,'0')};
      });return Response.json(batch?replies:replies[0]);
    };
    const chain=tchain.createTapeSendChains({fetchImpl}).get(196);
    await assert.rejects(verifyHistoricalProcessor(chain,{committed_block:10}),conflict?/不一致|conflict/:/不足|quorum/);
  }
});

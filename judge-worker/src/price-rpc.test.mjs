import test from 'node:test';
import assert from 'node:assert/strict';
import {createPriceChains,priceSafeBlock} from './price-rpc.mjs';
import {tchain} from '../../vendor/tapesend.bundle.mjs';
const response=(id,result)=>new Response(JSON.stringify({jsonrpc:'2.0',id,result}));
function fetcher({conflict=false,one=false,wrongChain=false}={}){
  return async(url,init)=>{
    const host=new URL(url).hostname,payload=JSON.parse(init.body),batch=Array.isArray(payload);
    const available=host==='bsc-mainnet.public.blastapi.io'||(!one&&host==='56.rpc.thirdweb.com');
    const replies=(batch?payload:[payload]).map(r=>{
      if(!available)return {id:r.id,error:{code:-32000,message:'archive unavailable'}};
      if(r.method==='eth_chainId')return {id:r.id,result:wrongChain?'0x1':'0x38'};
      if(r.method==='eth_getBlockByNumber')return {id:r.id,result:{number:host==='56.rpc.thirdweb.com'?'0x65':'0x64',timestamp:'0x10',hash:'0x'+'a'.repeat(64)}};
      return {id:r.id,result:conflict&&host==='56.rpc.thirdweb.com'?'0x22':'0x21'};
    });
    return new Response(JSON.stringify(batch?replies:replies[0]));
  };
}
test('oracle historical reads accept two independent matching providers without changing X Layer',async()=>{
  const fetchImpl=fetcher(),chains=createPriceChains({fetchImpl}),bnb=chains.get(56);
  assert.equal(bnb.rpc.strictQuorum,2);
  assert.equal(tchain.createTapeSendChains().get(196).rpc.strictQuorum,2); // original X Layer configuration
  assert.equal(chains.has(196),false);
  const original=tchain.createTapeSendChains().get(56);assert.equal(original.rpc.strictQuorum,3);
  await bnb.assertChain();
  assert.equal(await bnb.finalizedBlock(),100n);
  const [read]=await bnb.rpc.many([{method:'eth_call',params:[{to:'feed',data:'0x1234'},'0x50']}],{all:true});
  assert.equal(read.value,'0x21');
});
test('oracle disagreement is rejected even with two working nodes',async()=>{
  const bnb=createPriceChains({fetchImpl:fetcher({conflict:true})}).get(56);
  await assert.rejects(bnb.rpc.many([{method:'eth_call',params:[{},'0x50']}],{all:true}),/不一致|inconsistent|conflict/);
});
test('one oracle provider cannot supply a quorum or a safe head',async()=>{
  const bnb=createPriceChains({fetchImpl:fetcher({one:true})}).get(56);
  assert.equal(await bnb.finalizedBlock(),null);
  await assert.rejects(bnb.rpc.many([{method:'eth_call',params:[{},'0x50']}],{all:true}),/不足|quorum/);
});
test('multiple URLs of the same operator never count as two safe-head providers',async()=>{
  const chain={finalityTag:'finalized',rpc:{urls:['https://a.test','https://b.test'],operatorOf:()=> 'same'}};
  const fetchImpl=async(_url,init)=>response(JSON.parse(init.body).id,{number:'0x1',timestamp:'0x1',hash:'0x'+'b'.repeat(64)});
  assert.equal(await priceSafeBlock(chain,{fetchImpl}),null);
});
test('two matching responses on the wrong chain are rejected',async()=>{
  const bnb=createPriceChains({fetchImpl:fetcher({wrongChain:true})}).get(56);
  await assert.rejects(bnb.assertChain(),/chain 56/);
});

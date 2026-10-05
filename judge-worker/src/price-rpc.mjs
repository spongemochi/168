// Dedicated read-only oracle transport. Never used for X Layer identity or messages.
import {tchain} from '../../vendor/tapesend.bundle.mjs';
import {createRpc} from '../../vendor/tapesend-src/kernel/src/rpc.js';

export function createPriceChains({fetchImpl=fetch}={}) {
  const defaults=tchain.createTapeSendChains({fetchImpl}),chains=new Map();
  for(const chainId of [56,8453]){
    const base=defaults.get(chainId);
    const rpc=createRpc({urls:base.rpc.urls,operators:Object.fromEntries(base.rpc.urls.map(url=>[url,base.rpc.operatorOf(url)])),
      quorum:2,strictQuorum:2,fetchImpl});
    const chain=tchain.createTapeSendChain({network:base.network,rpc,fetchImpl});
    chain.finalizedBlock=()=>priceSafeBlock(chain,{fetchImpl});
    chains.set(chainId,chain);
  }
  return chains;
}

export async function priceSafeBlock(chain,{fetchImpl=fetch}={}){
  // Safe/finalized heads can differ; the minimum cannot move the search past finality.
  const responses=await Promise.allSettled(chain.rpc.urls.map(async url=>{
    const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:168,method:'eth_getBlockByNumber',params:[chain.finalityTag,false]}),
      signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json(),b=data.result;
    if(data.id!==168||data.error||!b||!/^0x[0-9a-f]+$/i.test(b.number)||
      !/^0x[0-9a-f]{64}$/i.test(b.hash)||!/^0x[0-9a-f]+$/i.test(b.timestamp))throw Error('invalid safe header');
    return {operator:chain.rpc.operatorOf(url),number:BigInt(b.number)};
  }));
  const valid=responses.filter(r=>r.status==='fulfilled').map(r=>r.value);
  if(new Set(valid.map(r=>r.operator)).size<2)return null;
  return valid.reduce((min,r)=>r.number<min?r.number:min,valid[0].number);
}

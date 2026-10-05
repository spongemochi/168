import {createPriceChains} from './price-rpc.mjs';
import {PRICE_RULE,validateClaim,decimal} from './price-rules.mjs';
const hex=n=>'0x'+BigInt(n).toString(16);
async function header(rpc,block) {
  const [r]=await rpc.many([{method:'eth_getBlockByNumber',params:[block,false],normalize:b=>({number:String(BigInt(b.number)),timestamp:String(BigInt(b.timestamp)),hash:b.hash.toLowerCase()})}],{all:true});
  if(!r.ok||!r.raw)throw Error('historical block quorum unavailable');
  return {number:Number(r.raw.number),timestamp:Number(r.raw.timestamp),hash:r.raw.hash};
}
export async function blockAtOrBefore(chain,at,{maxSteps=40}={}) {
  const safe=await chain.finalizedBlock();if(safe===null)throw Error('price source safe block unavailable');
  let high=await header(chain.rpc,hex(safe));
  if(high.timestamp<=at)throw Error('price source safe head has not passed T');
  // Bound the search near T; do not need an archive node to serve genesis.
  let distance=Math.max(64,Math.ceil((high.timestamp-at)*4)),low;
  for(let i=0;i<8;i++) {
    low=await header(chain.rpc,hex(Math.max(0,high.number-distance)));
    if(low.timestamp<=at)break;distance*=2;
  }
  if(low.timestamp>at)throw Error('historical time not bracketed');
  for(let i=0;i<maxSteps&&high.number-low.number>1;i++) {
    const ratio=(at-low.timestamp)/(high.timestamp-low.timestamp);
    const n=Math.max(low.number+1,Math.min(high.number-1,Math.floor(low.number+ratio*(high.number-low.number))));
    const middle=await header(chain.rpc,hex(n));
    if(middle.timestamp<=at)low=middle;else high=middle;
  }
  if(high.number!==low.number+1||low.timestamp>at||high.timestamp<=at)throw Error('historical block boundary not verified');
  return low;
}
async function feedAt(chainId,feed,at,{chains=createPriceChains()}={}) {
  const chain=chains.get(chainId);
  await chain.assertChain?.();
  const block=await blockAtOrBefore(chain,at),tag=hex(block.number);
  const results=await chain.rpc.many([
    {method:'eth_call',params:[{to:feed,data:'0xfeaf968c'},tag]},
    {method:'eth_call',params:[{to:feed,data:'0x313ce567'},tag]},
  ],{all:true});
  if(results.some(r=>!r.ok))throw Error('historical oracle read unavailable');
  const raw=String(results[0].value);if(!/^0x[0-9a-fA-F]{320}$/.test(raw))throw Error('malformed oracle round');
  const words=raw.slice(2).match(/.{64}/g).map(x=>BigInt('0x'+x));
  const answer=words[1],updated=Number(words[3]),decimals=Number(BigInt(results[1].value));
  if(answer<=0n||answer>=1n<<255n||decimals!==8||!Number.isSafeInteger(updated)||updated<=0||updated>at||at-updated>PRICE_RULE.chainlinkMaxAgeSeconds||words[4]<words[0])throw Error('invalid/stale oracle round');
  return {id:chainId===56?'chainlink-bnb':'chainlink-base',name:chainId===56?'Chainlink · BNB Chain':'Chainlink · Base',
    value:decimal(answer,decimals),at:updated,feed,chainId,roundId:String(words[0]),blockNumber:block.number,blockHash:block.hash,
    url:(chainId===56?'https://bscscan.com/address/':'https://basescan.org/address/')+feed};
}
export async function okxAt(instrument,at,{fetchImpl=fetch}={}) {
  const url=`https://www.okx.com/api/v5/market/history-index-candles?instId=${instrument}&bar=1m&after=${at*1000}&limit=3`;
  const response=await fetchImpl(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('OKX historical index unavailable');const data=await response.json();
  if(data.code!=='0'||!Array.isArray(data.data))throw Error('OKX response invalid');
  const candle=data.data.find(c=>c[0]===String((at-60)*1000));
  if(!candle||candle.length!==6||candle[5]!=='1')throw Error('confirmed OKX candle ending at T unavailable');
  return {id:'okx-usd-index',name:'OKX · '+instrument+' 美元指数',value:candle[4],at,url,candleStart:at-60,candleEnd:at,raw:candle};
}
export async function collectPrices(claim,at,options={}) {
  validateClaim(claim,at);const asset=PRICE_RULE.assets[claim.subject];
  const shared={...options,chains:options.chains||createPriceChains(options)};
  const results=await Promise.allSettled([feedAt(56,asset.bnb,at,shared),feedAt(8453,asset.base,at,shared),okxAt(asset.okx,at,options)]);
  const sources=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const names=['Chainlink BNB','Chainlink Base','OKX USD index'];
  const errors=results.flatMap((r,i)=>r.status==='rejected'?[names[i]+': '+String(r.reason.message||r.reason)]:[]);
  return {sources,errors};
}

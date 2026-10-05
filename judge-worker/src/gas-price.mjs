// eth_gasPrice is a node recommendation, not consensus chain state.
// Collect independent operators and use the highest valid quote. The executor
// still checks the resulting maximum fee against its transaction/day limits.
export async function collectGasPrice(chain,{fetchImpl=fetch}={}){
  const required=Math.max(2,Number(chain.rpc.strictQuorum||chain.rpc.quorum||2));
  if(!Number.isSafeInteger(required))throw Error('invalid gas quote operator requirement');
  const quotes=await Promise.all(chain.rpc.urls.map(async url=>{
    try{
      const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:168,method:'eth_gasPrice',params:[]}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('HTTP '+response.status);
      const body=await response.json();
      if(body.id!==168||body.error||typeof body.result!=='string'||!/^0x[0-9a-f]+$/i.test(body.result)||body.result.length>66)throw Error('invalid gas quote');
      const price=BigInt(body.result);if(price<=0n)throw Error('nonpositive gas quote');
      const operator=chain.rpc.operatorOf?chain.rpc.operatorOf(url):new URL(url).hostname;
      if(!operator)throw Error('unknown gas quote operator');
      return {operator,price};
    }catch{return null;}
  }));
  const operators=new Map();
  for(const quote of quotes)if(quote&&(!operators.has(quote.operator)||operators.get(quote.operator)<quote.price))operators.set(quote.operator,quote.price);
  if(operators.size<required)throw Error(`gas quote unavailable: ${operators.size}/${required} independent operators`);
  const price=[...operators.values()].reduce((a,b)=>a>b?a:b);
  return {price:price.toString(),operators:operators.size,quotes:[...operators].map(([operator,price])=>({operator,price:price.toString()}))};
}

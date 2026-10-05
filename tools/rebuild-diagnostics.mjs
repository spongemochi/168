// Public RPC diagnostics only; bounded observations and no signer/config secrets.
function compact(value){
  if(typeof value==='string')return value.length>200?value.slice(0,200)+'…':value;
  if(value&&typeof value==='object')return Object.fromEntries(['number','timestamp','hash','blockNumber','blockHash','transactionHash','from','to','status','code','message']
    .filter(k=>value[k]!==undefined).map(k=>[k,compact(value[k])]));
  return value;
}
export function createRebuildTrace(transport,{report=console.log,limit=80}={}){
  const observations=[];
  function append(row){observations.push(row);if(observations.length>limit)observations.shift();}
  async function fetchImpl(url,init={}){
    const requests=init.method==='POST'?JSON.parse(init.body):null;
    const list=requests?(Array.isArray(requests)?requests:[requests]):[];
    try{
      const response=await transport(url,init);
      if(list.length){
        let body;try{body=await response.clone().json();}catch{}
        const replies=Array.isArray(body)?body:[body];
        for(const r of list){const answer=replies.find(a=>a?.id===r.id);append({node:new URL(String(url)).hostname,method:r.method,params:r.params,
          httpStatus:response.status,result:compact(answer?.result),error:answer?.error||(!response.ok?'HTTP '+response.status:!answer?'missing RPC response':null)});}
      }
      return response;
    }catch(error){for(const r of list)append({node:new URL(String(url)).hostname,method:r.method,params:r.params,error:error.message});throw error;}
  }
  function wrap(chain,label){
    const many=chain.rpc.many.bind(chain.rpc);
    chain.rpc.many=async(requests,options)=>{
      try{return await many(requests,options);}catch(error){
        const matches=observations.filter(o=>requests.some(r=>r.method===o.method&&JSON.stringify(r.params)===JSON.stringify(o.params)));
        report('【失败 RPC】'+JSON.stringify({stage:label,chainId:chain.chainId,methods:requests.map(r=>({method:r.method,params:r.params})),
          error:error.message,detail:error.detail||null,observations:matches.slice(-20)}));throw error;
      }
    };
    return chain;
  }
  return {fetchImpl,wrap};
}

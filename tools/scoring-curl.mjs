// Read-only diagnostics transport for macOS users whose shell needs an explicit proxy.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export function curlResponse(stdout){
  const split=stdout.lastIndexOf('\n'),status=Number(stdout.slice(split+1));
  let body=stdout.slice(0,split),headers=new Headers();
  while(/^HTTP\/\S+ \d+/.test(body)){
    const boundary=body.match(/\r?\n\r?\n/);if(!boundary)throw Error('incomplete HTTP headers');
    headers=new Headers();
    for(const line of body.slice(0,boundary.index).split(/\r?\n/).slice(1)){
      const colon=line.indexOf(':');if(colon>0)headers.append(line.slice(0,colon).trim(),line.slice(colon+1).trim());
    }
    body=body.slice(boundary.index+boundary[0].length);
  }
  return new Response(body,{status,headers});
}
export function installReadOnlyProxy(proxy=process.env.SCORE_DIAGNOSTIC_PROXY){
  if(!proxy)return;
  globalThis.fetch=async(input,init={})=>{
    const url=String(input),method=init.method||'GET';
    if(!url.startsWith('https://'))throw Error('diagnostic requires HTTPS');
    if(method==='POST'){
      const requests=JSON.parse(init.body);for(const r of Array.isArray(requests)?requests:[requests]){
        if(!['eth_getBlockByNumber','eth_blockNumber','eth_chainId','eth_call','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getBalance','eth_gasPrice'].includes(r.method))throw Error('diagnostic rejects non-read RPC: '+r.method);
      }
    }else if(method!=='GET')throw Error('diagnostic only supports reads');
    const args=['--proxy',proxy,'--noproxy','','--suppress-connect-headers','-D','-','-sS','--connect-timeout','10','--max-time','25','-X',method,'-H','Content-Type: application/json','-w','\n%{http_code}',url];
    if(init.body)args.push('--data-raw',String(init.body));
    const {stdout}=await run('curl',args,{maxBuffer:8*1024*1024,signal:init.signal});
    return curlResponse(stdout);
  };
}

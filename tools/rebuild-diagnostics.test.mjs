import test from 'node:test';
import assert from 'node:assert/strict';
import {createRebuildTrace} from './rebuild-diagnostics.mjs';

test('failure diagnostics correlate batch responses by ID and preserve RPC quorum errors',async()=>{
  const reports=[],request={method:'eth_call',params:[{to:'0xfeed',data:'0x1234'},'0x50']};
  const trace=createRebuildTrace(async(_url,init)=>{
    const requests=JSON.parse(init.body);return Response.json(requests.map(r=>({id:r.id,error:{code:-32000,message:'historical state unavailable'}})).reverse());
  },{report:s=>reports.push(s)});
  const chain={chainId:196,rpc:{many:async requests=>{
    for(const host of ['a.test','b.test'])await trace.fetchImpl('https://'+host,{method:'POST',body:JSON.stringify(requests.map((r,i)=>({...r,id:i+1})))});
    throw Object.assign(Error('two operators required'),{detail:{errors:['historical state unavailable']}});
  }}};
  trace.wrap(chain,'endorsement');
  await assert.rejects(chain.rpc.many([request],{all:true}),/two operators required/);
  const report=JSON.parse(reports[0].slice(reports[0].indexOf('{')));
  assert.equal(report.chainId,196);assert.equal(report.stage,'endorsement');assert.equal(report.observations.length,2);
  assert.equal(report.observations[0].error.message,'historical state unavailable');assert.equal(report.methods[0].method,'eth_call');
});
test('transport errors are retained and successful JSON responses stay readable',async()=>{
  let fail=true,report;
  const request={id:1,method:'eth_getTransactionReceipt',params:['0xhash']};
  const trace=createRebuildTrace(async()=>{
    if(fail)throw Error('connection timed out');
    return Response.json({id:1,result:{transactionHash:'0xhash',status:'0x1',logs:[]}});
  },{report:s=>{report=s;}});
  await assert.rejects(trace.fetchImpl('https://node.test',{method:'POST',body:JSON.stringify(request)}),/timed out/);
  fail=false;const response=await trace.fetchImpl('https://node.test',{method:'POST',body:JSON.stringify(request)});
  assert.deepEqual((await response.json()).result.logs,[]);
  await assert.rejects(trace.wrap({chainId:196,rpc:{many:async()=>{throw Error('quorum unavailable');}}},'historical receipt').rpc.many([request]),/quorum unavailable/);
  assert.match(report,/connection timed out/);assert.match(report,/transactionHash/);
});

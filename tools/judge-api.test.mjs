import test from 'node:test';
import assert from 'node:assert/strict';
import {createJudgeApi,JUDGE_API} from './judge-api.mjs';
const id='0x'+'a'.repeat(64);
const row={id,authorContainer:'0x'+'b'.repeat(40),state:'sealed',openTime:3000,committedAt:1000,
  committedBlock:99,kind:'forecast',body:'must remain hidden',condition:'private',revealId:null};
const meta={asOf:1900,safeBlock:100,syncedAt:Math.floor(Date.now()/1000)};

test('API display hides any plaintext when no verified reveal exists',async()=>{
  let request;
  const api=createJudgeApi(async(url,options)=>{request={url,options};return Response.json({...meta,cases:[row],next:null});});
  const result=await api.list();
  assert.equal(result.items[0].body,null);
  assert.equal(result.items[0].condition,null);
  assert.equal(result.source,'index');
  assert.equal(result.stale,false);
  assert.equal(request.options.credentials,'omit');
  assert.equal(new URL(request.url).origin,JUDGE_API);
});

test('detail maps verified reveal and transaction evidence, and flags old synchronization',async()=>{
  const api=createJudgeApi(async()=>Response.json({...meta,syncedAt:1,
    case:{...row,state:'revealed-awaiting-verdict',revealId:'0x'+'c'.repeat(64)},
    records:[{valid:1,record_type:'commitment',tx_hint:'transaction'}],submissions:[]}));
  const result=await api.detail(id);
  assert.equal(result.item.status,'revealed');
  assert.equal(result.item.body,row.body);
  assert.equal(result.item.txHint,'transaction');
  assert.equal(result.stale,true);
});

test('unavailable or mismatched backend data fails instead of displaying a false case',async()=>{
  await assert.rejects(createJudgeApi(async()=>new Response('',{status:503})).list());
  await assert.rejects(createJudgeApi(async()=>Response.json({...meta,case:{...row,id:'0x'+'d'.repeat(64)},records:[]})).detail(id));
});

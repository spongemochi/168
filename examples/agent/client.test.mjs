import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLeaderboard,verifyIndexedCase,createAgentClient} from './client.mjs';
import {prepareForecast,HUB} from './forecast.mjs';
import {SCORE_RULE,PROCESSOR,rank,scoreUnits,estimate,digest,parameterHash} from '../../app/scoring/rules.mjs';
import {mod,tchain,judgeKeys} from '../../vendor/tapesend.bundle.mjs';
// Synthetic fixtures only; these are never exported to the public index or leaderboard.
const now=1800000000,hash=n=>'0x'+n.toString(16).padStart(64,'0'),wallet='0x'+'a'.repeat(40);
async function fixture(n=1,outcome='hit'){
  const committedAt=now-10800+600,openTime=committedAt+7200,cutoff=Math.floor(committedAt/3600)*3600;
  const candles=Array.from({length:4320},(_,i)=>({at:cutoff-(4319-i)*3600,close:String(100+i%5)}));
  const claim={ruleVersion:SCORE_RULE.priceRule,metric:'price',subject:'BTC/USD',op:'>',value:'101',at:openTime};
  const initialAt=Math.floor(committedAt/60)*60,source=(at,value)=>[{id:'chainlink-base',at,value},{id:'okx-usd-index',at,value}];
  const p={version:SCORE_RULE.version,caseId:hash(n),committedAt,openTime,claim,slot:{chainId:196,processor:PROCESSOR,circuitId:String(n+100),tapeoutTx:hash(n+1000)},
    authorWallet:wallet,residentId:'2',initialAt,px0:'100',initialSources:source(initialAt,'100'),salt:hash(n+2000),historyHash:await digest(candles),...estimate(claim,committedAt,openTime,'100',candles)};
  const r={caseId:p.caseId,verified:true,receiptId:hash(n+3000),parametersId:hash(n+4000),revealId:hash(n+5000),authorWallet:wallet,residentId:'2',pUnits:p.pUnits,openTime,outcome,scoreUnits:scoreUnits(p.pUnits,outcome)};
  const detail={asOf:now,case:{id:p.caseId,committedAt,openTime,kind:'forecast',claim,revealId:r.revealId,verdictId:hash(n+6000),outcome,sources:source(openTime,outcome==='hit'?'102':'100')},
    scoring:{verified:1,receipt_id:r.receiptId,receipt_at:committedAt+60,parameters_id:r.parametersId,parameters_hash:await parameterHash(p),parameters_json:JSON.stringify(p),p_units:p.pUnits},scoringResult:{outcome,scoreUnits:r.scoreUnits}};
  return {r,detail,evidence:{candles},p};
}
function board(records=[]){const rows=rank(records,now);return {version:SCORE_RULE.version,minimumSamples:10,enabled:true,asOf:now,records,rows,
  allocationRanking:rows.filter(r=>r.eligible).map((r,i)=>({rank:i+1,authorWallet:r.authorWallet,residentId:r.residentId,scoreUnits:r.scoreUnits,settled:r.settled,cases:r.cases}))};}

test('empty and nine-sample histories never produce a formal candidate; ten do',async()=>{
  assert.equal(inspectLeaderboard(board(),{now}).suggestedContact,null);
  const fixtures=await Promise.all(Array.from({length:10},(_,i)=>fixture(i+1)));
  assert.equal(inspectLeaderboard(board(fixtures.slice(0,9).map(f=>f.r)),{now}).decision,'awaiting-qualified-history');
  const report=inspectLeaderboard(board(fixtures.map(f=>f.r)),{now});
  assert.equal(report.suggestedContact,'2.2.168');assert.equal(report.resourceTransfer,false);
});
test('recompute both positive and negative scores from committed parameters and 4320 candles',async()=>{
  for(const outcome of ['hit','miss']){const f=await fixture(1,outcome);const result=await verifyIndexedCase(f.r,f.detail,f.evidence);assert.equal(result.scoreUnits,f.r.scoreUnits);}
});
test('reject tampered prices, history, parameters, late receipt and wallet attribution',async()=>{
  for(const mutate of [
    f=>{f.evidence.candles[0].close='999';},
    f=>{f.detail.case.sources[0].value='100';},
    f=>{const p=JSON.parse(f.detail.scoring.parameters_json);p.pUnits++;f.detail.scoring.parameters_json=JSON.stringify(p);},
    f=>{f.detail.scoring.receipt_at=f.detail.case.openTime;},
    f=>{f.r.authorWallet='0x'+'b'.repeat(40);}
  ]){const f=await fixture();mutate(f);await assert.rejects(verifyIndexedCase(f.r,f.detail,f.evidence));}
});
test('reject duplicate cases, altered scores, fake formal rows and stale data',async()=>{
  const {r}=await fixture();
  assert.throws(()=>inspectLeaderboard(board([r,r]),{now}),/duplicate/);
  assert.throws(()=>inspectLeaderboard(board([{...r,scoreUnits:999}]),{now}),/score mismatch/);
  const b=board([r]);b.allocationRanking=[{rank:1}];assert.throws(()=>inspectLeaderboard(b,{now}),/formal/);
  assert.throws(()=>inspectLeaderboard(board(),{now:now+901}),/stale/);
});
test('client uses GET only and refuses failed requests and unresolved evidence',async()=>{
  const f=await fixture(),calls=[],b=board([f.r]);
  const fetchImpl=async(url,options)=>{assert.equal(options.method,'GET');calls.push(url.pathname);return Response.json(url.pathname==='/api/leaderboard'?b:url.pathname.endsWith('/scoring-evidence')?f.evidence:f.detail);};
  const result=await createAgentClient({fetchImpl}).read({now});assert.equal(result.checked.length,1);assert.equal(calls.length,3);
  await assert.rejects(createAgentClient({fetchImpl:async()=>new Response('',{status:503})}).read({now}),/503/);
  await assert.rejects(createAgentClient({fetchImpl}).read({now,maxCases:0}),/partial/);
});
test('real Agent transaction seals original rule, separates reveal key and never broadcasts',async()=>{
  const pair=judgeKeys.generateJudgeKey(),authorContainer='0x'+'2'.repeat(40),judgeContainer='0x'+'3'.repeat(40);
  const endpoint=(id,container)=>({status:'ok',chainId:196,circuits:PROCESSOR,tokenId:BigInt(id),container,holder:wallet,opened:true,
    endpoint:tchain.endpointId(196,container),key:{usable:true,key:pair.publicKey,chainsBits:'4'}});
  const author=endpoint(2,authorContainer),judge=endpoint(1,judgeContainer),encoder=tchain.createTapeSendChains().get(196);
  const chain={finalizedBlock:async()=>100n,assertFreshBlock:async()=>{},resolveEndpoint:async name=>name==='1.2.168'?judge:author,encodeSend:args=>encoder.encodeSend(args)};
  const draft={residentId:'2',wallet,body:'Synthetic Agent forecast used only in a local test',subject:'BTC/USD',op:'>',value:'101',openTime:now+7200};
  try{
    const prepared=await prepareForecast(draft,{chain,now});
    assert.equal(prepared.transaction.to,HUB);assert.ok(prepared.transaction.data.startsWith('0x'));assert.equal(prepared.transaction.key,undefined);
    const b=prepared.backup;assert.equal(mod.parsePayload(mod.hexToBytes(b.payload)).kind,'sealed');
    const content=JSON.parse(new TextDecoder().decode(mod.openWithContentKey({payload:mod.hexToBytes(b.payload),key:b.key,from:author.endpoint,to:judge.endpoint,hub:HUB,ref:b.ref})));
    assert.equal(content.scv.claim.ruleVersion,SCORE_RULE.priceRule);assert.equal(content.body,draft.body);assert.equal(content.scv.scoringVersion,undefined);
    const slot={chainId:196,processor:PROCESSOR,circuitId:'3',tapeoutTx:hash(999)};
    await assert.rejects(prepareForecast({...draft,slot},{chain,now}),/not ready/);
    const scored=await prepareForecast({...draft,slot},{chain,now,readRules:async()=>({enabled:true,ready:true,rule:SCORE_RULE})});
    const plain=JSON.parse(new TextDecoder().decode(mod.openWithContentKey({payload:mod.hexToBytes(scored.backup.payload),key:scored.backup.key,from:author.endpoint,to:judge.endpoint,hub:HUB,ref:scored.backup.ref})));
    assert.deepEqual(plain.scv.slot,slot);assert.equal(plain.scv.scoringVersion,SCORE_RULE.version);
    await assert.rejects(prepareForecast({...draft,wallet:'0x'+'b'.repeat(40)},{chain,now}),/holder/);
    await assert.rejects(prepareForecast(draft,{chain:{...chain,finalizedBlock:async()=>null},now}),/safe block unavailable/);
    await assert.rejects(prepareForecast({...draft,slot:{...slot,circuitId:'2'}},{chain,now,readRules:async()=>({enabled:true,ready:true,rule:SCORE_RULE})}),/resident circuit/);
  }finally{pair.secretKey.fill(0);}
});

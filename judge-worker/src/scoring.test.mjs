import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {mod} from '../../vendor/tapesend.bundle.mjs';
import {SCORE_RULE,scoreRef,parameterHash,canonical,estimate,digest} from '../../app/scoring/rules.mjs';
import {ingestScore,verifyScores,leaderboard,scoreTransaction,collectHistory} from './scoring.mjs';
import {JUDGE_ENDPOINT} from './adjudicator.mjs';
const cid='0x'+'a'.repeat(64),author='0x'+'0'.repeat(8)+(196).toString(16).padStart(16,'0')+'b'.repeat(40),at=1800000000,open=at+3600;
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const f of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql'])sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const db={prepare(q){const s=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};}};
 const claim={metric:'price',subject:'BTC/USD',op:'>',value:'100',at:open,ruleVersion:SCORE_RULE.priceRule},slot={chainId:196,processor:'0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',circuitId:'3',tapeoutTx:'0x'+'e'.repeat(64)};
 sql.prepare(`INSERT INTO cases (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at,reveal_id,revealed_claim,revealed_scoring)
 VALUES (?,0,?,'container','forecast',?,'ref','payload',10,?,'reveal',?,?)`).run(cid,author,open,at,JSON.stringify(claim),JSON.stringify({version:SCORE_RULE.version,slot}));
 const entry={id:'receipt-id',timestamp:at+300,fromEndpoint:JUDGE_ENDPOINT,to:author};
 const candles=Array.from({length:4320},(_,i)=>({at:at-(4319-i)*3600,close:i%2?'101':'99'}));
 const sources=['chainlink-bnb','chainlink-base','okx-usd-index'].map(id=>({id,name:id,value:'100',at,url:'https://example.com'}));
 const parameters={version:SCORE_RULE.version,caseId:cid,claim,slot,authorWallet:'wallet',residentId:'2',committedAt:at,openTime:open,initialAt:at,px0:'100',...estimate(claim,at,open,'100',candles),initialSources:sources,salt:'0x'+'f'.repeat(64)};
 const message=(type,fields)=>({ref:scoreRef(type,cid),payload:mod.encodePublic(new TextEncoder().encode(JSON.stringify({v:1,kind:'message',body:'score',score:{version:SCORE_RULE.version,type,caseId:cid,...fields}})))});
 return {sql,db,entry,candles,parameters,sources,message};
}
test('receipt timing, authority, immutable hash and deferred parameter verification',async()=>{
 const f=fixture();try{
  f.parameters.historyHash=await digest(f.candles);const hash=await parameterHash(f.parameters),r=f.message('receipt',{parametersHash:hash});
  await assert.rejects(ingestScore(f.db,{}, {...f.entry,timestamp:at+601},r,'out'),/late/);
  await assert.rejects(ingestScore(f.db,{}, {...f.entry,fromEndpoint:author},r,'out'),/authority/);
  await ingestScore(f.db,{},f.entry,r,'out');
  await ingestScore(f.db,{}, {...f.entry,id:'second'},f.message('receipt',{parametersHash:'0x'+'1'.repeat(64)}),'out');
  assert.equal(f.sql.prepare('SELECT parameters_hash FROM score_receipts').get().parameters_hash,hash);
  const e={...f.entry,id:'parameters-id',timestamp:open+1};
  await assert.rejects(ingestScore(f.db,{},e,f.message('parameters',{parameters:{...f.parameters,pUnits:5}}),'out'),/match/);
  await ingestScore(f.db,{},e,f.message('parameters',{parameters:f.parameters}),'out');
  assert.equal(f.sql.prepare('SELECT verified FROM score_receipts').get().verified,0);
  const options={chain:{},history:async()=>f.candles,endorse:async()=>({authorWallet:'wallet',residentId:'2'}),prices:async()=>({sources:f.sources,errors:[]})};
  await verifyScores(f.db,options);assert.equal(f.sql.prepare('SELECT verified,error FROM score_receipts').get().error,null);
  assert.equal(f.sql.prepare('SELECT verified FROM score_receipts').get().verified,1);
  const sources=f.sources.map(s=>({...s,at:open,value:'101'}));
  f.sql.prepare("UPDATE cases SET verdict_id='v',outcome='hit',verdict_sources=?").run(JSON.stringify(sources));
  const first=await leaderboard(f.db,open+100);assert.equal(first.rows[0].scoreUnits,1000000-f.parameters.pUnits);
  await verifyScores(f.db,options);assert.deepEqual(await leaderboard(f.db,open+100),first);
 }finally{f.sql.close();}
});
test('reused endorsement cannot score a second case',async()=>{
 const f=fixture();try{
  f.parameters.historyHash=await digest(f.candles);
  await ingestScore(f.db,{},f.entry,f.message('receipt',{parametersHash:await parameterHash(f.parameters)}),'out');
  await ingestScore(f.db,{}, {...f.entry,id:'p',timestamp:open},f.message('parameters',{parameters:f.parameters}),'out');
  f.sql.exec("INSERT INTO cases (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at) VALUES ('other',9,'other','other','forecast',1,'r','p',1,1)");
  f.sql.prepare("INSERT INTO score_receipts (case_id,receipt_id,parameters_hash,receipt_at,circuit_id) VALUES ('other','r2','h',1,'3')").run();
  await verifyScores(f.db,{chain:{},history:async()=>f.candles,endorse:async()=>({authorWallet:'wallet',residentId:'2'}),prices:async()=>({sources:f.sources,errors:[]})});
  assert.match(f.sql.prepare('SELECT error FROM score_receipts WHERE case_id=?').get(cid).error,/reused/);
 }finally{f.sql.close();}
});

test('an unchanged median cannot hide altered published initial source evidence',async()=>{
 const f=fixture();try{
  f.parameters.historyHash=await digest(f.candles);
  f.parameters.initialSources=structuredClone(f.sources);
  f.parameters.initialSources[0].value='99'; // The three-source median still equals 100.
  await ingestScore(f.db,{},f.entry,f.message('receipt',{parametersHash:await parameterHash(f.parameters)}),'out');
  await ingestScore(f.db,{}, {...f.entry,id:'parameters',timestamp:open},f.message('parameters',{parameters:f.parameters}),'out');
  await verifyScores(f.db,{chain:{},history:async()=>f.candles,endorse:async()=>({authorWallet:'wallet',residentId:'2'}),prices:async()=>({sources:f.sources,errors:[]})});
  const result=f.sql.prepare('SELECT verified,error FROM score_receipts').get();
  assert.equal(result.verified,0);assert.match(result.error,/initial evidence/);
 }finally{f.sql.close();}
});
test('score transaction cannot reveal parameters early or backfill a late receipt',async()=>{
 const f=fixture();try{
  f.parameters.historyHash=await digest(f.candles);
  f.sql.prepare("INSERT INTO score_candidates (case_id,state,reason,private_parameters,evidence_json,updated_at) VALUES (?,'prepared',NULL,?,NULL,?)").run(cid,canonical(f.parameters),at);
  const row=f.sql.prepare('SELECT * FROM cases').get();
  await assert.rejects(scoreTransaction(f.db,{...row,score_type:'receipt'},at+601),/expired/);
  await assert.rejects(scoreTransaction(f.db,{...row,score_type:'parameters'},at),/before/);
  const tx=await scoreTransaction(f.db,{...row,score_type:'receipt'},at+300);assert.equal(tx.value,'0x0');
 }finally{f.sql.close();}
});
test('historical collector fails closed on unconfirmed or incomplete data',async()=>{
 await assert.rejects(collectHistory('BTC/USD',at,{fetchImpl:async()=>({ok:true,json:async()=>({code:'0',data:[[String(at*1000-3600000),'1','1','1','1','0']]})})}),/unconfirmed/);
});

test('preparation authenticates sealed opt-in and a retry keeps the same private parameters',async()=>{
 const {prepareScores}=await import('./scoring.mjs');const {judgeKeys}=await import('../../vendor/tapesend.bundle.mjs');const {HUB}=await import('./protocol.mjs');
 const f=fixture();try{
   const pair=judgeKeys.generateJudgeKey(),ref='0x534356310102'+BigInt(open).toString(16).padStart(16,'0')+'00'.repeat(18);
   const scv={v:1,type:'commitment',kind:'forecast',open,condition:'fixed',claim:f.parameters.claim,slot:f.parameters.slot,scoringVersion:SCORE_RULE.version};
   const payload=mod.seal({content:new TextEncoder().encode(JSON.stringify({v:1,kind:'message',body:'sealed test',scv})),recipients:[mod.hexToBytes(pair.publicKey)],to:JUDGE_ENDPOINT,from:author,hub:HUB,ref});
   f.sql.prepare('UPDATE cases SET commitment_ref=?,payload_hex=?,reveal_id=NULL').run(ref,mod.bytesToHex(payload));
   const env={SCORING_ENABLED:'true',JUDGE_RECEIVE_KEY:mod.bytesToHex(pair.secretKey)};
   const options={now:at+10,chain:{},history:async()=>f.candles,prices:async()=>({sources:f.sources,errors:[]}),endorse:async()=>({authorWallet:'wallet',residentId:'2'})};
   await prepareScores(f.db,env,options);
   const first=f.sql.prepare('SELECT * FROM score_candidates').get();assert.equal(first.state,'prepared',first.reason);
   await prepareScores(f.db,env,options);assert.equal(f.sql.prepare('SELECT private_parameters FROM score_candidates').get().private_parameters,first.private_parameters);
   const tx=await scoreTransaction(f.db,{...f.sql.prepare('SELECT * FROM cases').get(),score_type:'receipt'},at+20);
   assert.ok(tx.data);assert.equal(tx.type,'receipt');
   pair.secretKey.fill(0);
 }finally{f.sql.close();}
});

test('v2 dual-source admission remains independently verifiable after the third provider recovers',async()=>{
 const f=fixture();try{
  f.parameters.initialSources=f.sources.filter(s=>s.id!=='chainlink-bnb');
  f.parameters.historyHash=await digest(f.candles);
  await ingestScore(f.db,{},f.entry,f.message('receipt',{parametersHash:await parameterHash(f.parameters)}),'out');
  await ingestScore(f.db,{}, {...f.entry,id:'parameters',timestamp:open},f.message('parameters',{parameters:f.parameters}),'out');
  await verifyScores(f.db,{chain:{},history:async()=>f.candles,endorse:async()=>({authorWallet:'wallet',residentId:'2'}),prices:async()=>({sources:f.sources,errors:[]})});
  assert.equal(f.sql.prepare('SELECT verified,error FROM score_receipts').get().verified,1);
 }finally{f.sql.close();}
});

test('sealed v2 opt-in through actual TapeSend receipt, reveal, verdict and parameters produces a replayable score',async()=>{
 const {prepareScores}=await import('./scoring.mjs');
 const {judgeKeys,tchain}=await import('../../vendor/tapesend.bundle.mjs');
 const {HUB,linkedRecord}=await import('./protocol.mjs');
 const {automaticTransaction,receivePublicKey}=await import('./executor.mjs');
 const {decidePrice}=await import('./price-rules.mjs');
 const ethers=(await import('../vendor/ethers.cjs')).default;
 const {JUDGE_CONTAINER}=await import('./adjudicator.mjs');
 const f=fixture();try{
  const pair=judgeKeys.generateJudgeKey(),ref='0x534356310102'+BigInt(open).toString(16).padStart(16,'0')+'00'.repeat(18);
  const scv={v:1,type:'commitment',kind:'forecast',open,condition:'fixed',claim:f.parameters.claim,slot:f.parameters.slot,scoringVersion:SCORE_RULE.version};
  const sealed=mod.seal({content:new TextEncoder().encode(JSON.stringify({v:1,kind:'message',body:'BTC fixed forecast',scv})),recipients:[mod.hexToBytes(pair.publicKey)],to:JUDGE_ENDPOINT,from:author,hub:HUB,ref,returnKey:true});
  f.sql.prepare('UPDATE cases SET commitment_ref=?,payload_hex=?,reveal_id=NULL,revealed_claim=NULL,revealed_scoring=NULL').run(ref,mod.bytesToHex(sealed.payload));
  const env={SCORING_ENABLED:'true',JUDGE_RECEIVE_KEY:mod.bytesToHex(pair.secretKey)},options={now:at+10,chain:{},history:async()=>f.candles,prices:async()=>({sources:f.sources,errors:[]}),endorse:async()=>({authorWallet:'wallet',residentId:'2'})};
  await prepareScores(f.db,env,options);
  const chain=tchain.createTapeSendChains().get(196),iface=new ethers.Interface(['function send(address,uint256,bytes32,bytes32,bytes)']);
  const decode=tx=>{const args=iface.parseTransaction({data:tx.data}).args;return {ref:args[3],payload:mod.hexToBytes(args[4]),txHint:'0x'+'9'.repeat(64)};};
  let row=f.sql.prepare('SELECT * FROM cases').get();
  const receipt=decode(await scoreTransaction(f.db,{...row,score_type:'receipt'},at+30));
  await ingestScore(f.db,chain,{...f.entry,id:'real-receipt',timestamp:at+31},receipt,'out');
  assert.equal((await leaderboard(f.db,at+32)).rows.length,0); // No secret score before disclosure.
  const reveal=decode(automaticTransaction(chain,row,{safeTime:open,secret:pair.secretKey,now:open+1}));
  const revealed=linkedRecord({from:JUDGE_CONTAINER,fromEndpoint:JUDGE_ENDPOINT,to:author,timestamp:open+2},reveal,'reveal',row,JUDGE_ENDPOINT);
  f.sql.prepare('UPDATE cases SET reveal_id=?,revealed_body=?,revealed_claim=?,revealed_scoring=?').run('real-reveal',revealed.body,JSON.stringify(revealed.claim),JSON.stringify(revealed.scoring));
  row=f.sql.prepare('SELECT * FROM cases').get();
  const sources=f.sources.map(s=>({...s,at:open,value:'101'})),decision=decidePrice(revealed.claim,open,sources);
  const verdict=decode(automaticTransaction(chain,{...row,job_state:'ready-for-chain',rule_version:revealed.claim.ruleVersion,proposed_outcome:decision.outcome,proposed_reason:decision.reason,sources_json:JSON.stringify(sources)},{safeTime:open,now:open+3}));
  const judged=linkedRecord({from:JUDGE_CONTAINER,fromEndpoint:JUDGE_ENDPOINT,to:author,timestamp:open+4},verdict,'verdict',row,JUDGE_ENDPOINT);
  f.sql.prepare('UPDATE cases SET verdict_id=?,outcome=?,verdict_sources=?').run('real-verdict',judged.outcome,JSON.stringify(judged.sources));
  const params=decode(await scoreTransaction(f.db,{...row,score_type:'parameters'},open+5));
  await ingestScore(f.db,chain,{...f.entry,id:'real-parameters',timestamp:open+6},params,'out');
  assert.equal((await leaderboard(f.db,open+7)).rows.length,0); // Disclosure alone is not verification.
  await verifyScores(f.db,options);
  const result=await leaderboard(f.db,open+8),p=JSON.parse(f.sql.prepare('SELECT parameters_json FROM score_receipts').get().parameters_json);
  assert.equal(result.rows[0].scoreUnits,1000000-p.pUnits);assert.equal(result.rows[0].settled,1);
  assert.equal(result.allocationRanking.length,0); // Ten samples are required for resource ranking.
  await verifyScores(f.db,options);assert.deepEqual(await leaderboard(f.db,open+8),result);
  const worker=(await import('./index.mjs')).default;
  const detail=async()=>await (await worker.fetch(new Request('https://example.test/api/cases/'+row.id),{DB:f.db})).json();
  assert.deepEqual((await detail()).scoringResult,{outcome:'hit',scoreUnits:1000000-p.pUnits});
  // A judge-signed decision can disagree with its evidence. Detail and rank
  // must both refuse that result even when the baseline p is verified.
  f.sql.prepare("UPDATE cases SET outcome='miss'").run();
  assert.equal((await detail()).scoringResult,null);
  const disputed=await leaderboard(f.db,open+8);
  assert.equal(disputed.records[0].scoreUnits,null);assert.equal(disputed.rows[0].settled,0);
  pair.secretKey.fill(0);
 }finally{f.sql.close();}
});

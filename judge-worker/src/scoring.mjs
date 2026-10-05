import {historyPage,cachedHistory} from './history-cache.mjs';
import {mod,tchain} from '../../vendor/tapesend.bundle.mjs';
import {SCORE_RULE,canonical,digest,estimate,validateRequest,scoreRef,scoreType,parameterHash,rank,scoreUnits,HEX32} from '../../app/scoring/rules.mjs';
import {JUDGE_ENDPOINT,JUDGE_CONTAINER,PROCESSOR} from './adjudicator.mjs';
import {HUB,strictContent,linkedRecord} from './protocol.mjs';
import {unwrapRevealKey} from './reveal-key.mjs';
import {collectPrices} from './price-sources.mjs';
import {scaled,decimal,decidePrice} from './price-rules.mjs';
import {verifyEndorsement} from './endorsement.mjs';
const chainFor=()=>tchain.createTapeSendChains().get(196);
export async function collectHistory(subject,committedAt,options={}){
  const cutoff=Math.floor(committedAt/3600)*3600,first=cutoff-(SCORE_RULE.historyHours-1)*3600;
  const rows=new Map();let before=cutoff*1000;
  for(let page=0;page<45&&rows.size<SCORE_RULE.historyHours;page++){
    const result=await historyPage(subject,before,options);before=result.nextBefore;
    for(const c of result.candles)if(c.at>=first&&c.at<=cutoff){
      if(rows.has(c.at)&&canonical(rows.get(c.at))!==canonical(c))throw Error('conflicting historical candles');rows.set(c.at,c);
    }
  }
  const candles=[...rows.values()].sort((a,b)=>a.at-b.at);
  if(candles.length!==SCORE_RULE.historyHours)throw Error('180-day history incomplete');return candles;
}
async function medianAt(claim,at,collect){
  const result=await collect({...claim,at},at);

  const validated=decidePrice({...claim,at},at,result.sources);
  return {px0:validated.price,sources:result.sources};
}
export async function prepareScores(db,env,{chain=chainFor(),now=Math.floor(Date.now()/1000),history=(subject,at)=>cachedHistory(db,subject,at),prices=collectPrices,endorse=verifyEndorsement}={}){
  if(env.SCORING_ENABLED!=='true'||!env.JUDGE_RECEIVE_KEY)return;
  const rows=await db.prepare(`SELECT cases.* FROM cases LEFT JOIN score_candidates s ON s.case_id=cases.id
    WHERE cases.open_time>? AND cases.committed_at>=? AND (s.case_id IS NULL OR (s.state='retry' AND s.updated_at<?)) ORDER BY cases.committed_block,cases.inbox_index LIMIT 25`).bind(now,now-SCORE_RULE.receiptWindow,now-60).all();
  for(const row of rows.results){
    let state='ignored',reason=null,parameters=null,evidence=null;
    try{
      const key=unwrapRevealKey({secret:mod.hexToBytes(env.JUDGE_RECEIVE_KEY,32),payload:mod.hexToBytes(row.payload_hex),to:JUDGE_ENDPOINT,from:row.author_endpoint,hub:HUB,ref:row.commitment_ref});
      const plain=strictContent(mod.openWithContentKey({payload:mod.hexToBytes(row.payload_hex),key,to:JUDGE_ENDPOINT,from:row.author_endpoint,hub:HUB,ref:row.commitment_ref}));
      const scv=plain.scv;
      if(scv?.scoringVersion===SCORE_RULE.version){
        if(scv.open!==row.open_time||scv.kind!==row.kind)throw Error('scoring metadata mismatch');
        const {claim,slot}=validateRequest(scv,row.committed_at);
        const attribution=await endorse(chain,{...row,judgeEndpoint:JUDGE_ENDPOINT},slot);
        const duplicate=await db.prepare('SELECT case_id FROM score_receipts WHERE circuit_id=?').bind(slot.circuitId).first();
        if(duplicate)throw Error('endorsement already used');
        const pending=await db.prepare("SELECT private_parameters FROM score_candidates WHERE state='prepared'").all();
        if(pending.results.some(r=>JSON.parse(r.private_parameters).slot.circuitId===slot.circuitId))throw Error('endorsement already reserved');
        const initialAt=Math.floor(row.committed_at/60)*60;
        const [baseline,candles]=await Promise.all([medianAt(claim,initialAt,prices),history(claim.subject,row.committed_at)]);
        const probability=estimate(claim,row.committed_at,row.open_time,baseline.px0,candles);
        parameters={version:SCORE_RULE.version,caseId:row.id,claim,slot,...attribution,committedAt:row.committed_at,openTime:row.open_time,
          initialAt,px0:baseline.px0,...probability,historyHash:await digest(candles),initialSources:baseline.sources,salt:mod.bytesToHex(crypto.getRandomValues(new Uint8Array(32)))};
        evidence={candles};state='prepared';
      }
    }catch(error){reason=String(error.message).slice(0,300);state=error.code==='PRICE_EVIDENCE_PENDING'||/unavailable|incomplete|quorum|timeout|fetch|可用节点不足|节点返回的结果不一致/i.test(reason)?'retry':'rejected';}
    // Keep secret parameters stable once prepared; no re-estimation after a receipt.
    await db.prepare("INSERT INTO score_candidates (case_id,state,reason,private_parameters,evidence_json,updated_at,slot_key) VALUES (?,?,?,?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,private_parameters=excluded.private_parameters,evidence_json=excluded.evidence_json,updated_at=excluded.updated_at,slot_key=excluded.slot_key WHERE score_candidates.state='retry'")
      .bind(row.id,state,reason,parameters?canonical(parameters):null,evidence?canonical(evidence):null,now,parameters?parameters.slot.circuitId:null).run();
    if(parameters||state==='retry')break;
  }
}
export async function scoreTransaction(db,row,now){
  const candidate=await db.prepare("SELECT * FROM score_candidates WHERE case_id=? AND state='prepared'").bind(row.id).first();
  if(!candidate)throw Error('score parameters unavailable');const parameters=JSON.parse(candidate.private_parameters);
  const type=row.score_type;
  if(type==='receipt'&&(now>=row.open_time||now>row.committed_at+SCORE_RULE.receiptWindow))throw Error('scoring admission window expired');
  if(type==='parameters'&&(now<row.open_time||!row.reveal_id))throw Error('scoring parameters cannot be public before verified reveal');
  const score={version:SCORE_RULE.version,type,caseId:row.id,...(type==='receipt'?{parametersHash:await parameterHash(parameters)}:{parameters})};
  const payload=mod.encodePublic(new TextEncoder().encode(JSON.stringify({v:1,kind:'message',subject:'168 · 判断计分',body:type==='receipt'?'事前计分参数承诺':'公开计分参数，供独立重算',ts:now*1000,score})));
  return {type,...chainFor().encodeSend({circuits:PROCESSOR,tokenId:1,to:row.author_endpoint,ref:scoreRef(type,row.id),payload}),value:'0x0'};
}
export async function selectScoreWork(db,now){
  // Reveal/verdict execution retains priority. Expired admission is never backfilled.
  const receipt=await db.prepare(`SELECT c.*,'receipt' AS score_type FROM cases c JOIN score_candidates s ON s.case_id=c.id
    WHERE s.state='prepared' AND c.open_time>? AND c.committed_at>=?
    AND NOT EXISTS(SELECT 1 FROM score_receipts r WHERE r.case_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM judge_transactions t WHERE t.case_id=c.id AND t.type='receipt')
    ORDER BY c.committed_block,c.inbox_index LIMIT 1`).bind(now,now-SCORE_RULE.receiptWindow).first();
  if(receipt)return receipt;
  return db.prepare(`SELECT c.*,'parameters' AS score_type FROM cases c JOIN score_receipts r ON r.case_id=c.id
    JOIN score_candidates s ON s.case_id=c.id WHERE r.parameters_id IS NULL AND c.reveal_id IS NOT NULL AND c.open_time<=?
    AND s.state='prepared' AND NOT EXISTS(SELECT 1 FROM judge_transactions t WHERE t.case_id=c.id AND t.type='parameters')
    ORDER BY c.open_time LIMIT 1`).bind(now).first();
}
export async function ingestScore(db,chain,entry,message,direction){
  const type=scoreType(message.ref);if(!type)return false;
  const parsed=mod.parsePayload(message.payload);if(parsed.kind!=='public')throw Error('score message must be public');
  const s=strictContent(parsed.content).score;
  if(s?.version!==SCORE_RULE.version||s.type!==type||!HEX32.test(s.caseId)||message.ref!==scoreRef(type,s.caseId)||direction!=='out'||entry.fromEndpoint!==JUDGE_ENDPOINT)throw Error('invalid score message authority');
  const row=await db.prepare('SELECT * FROM cases WHERE id=?').bind(s.caseId).first();
  if(!row||entry.to!==row.author_endpoint)throw Error('score recipient mismatch');
  if(type==='receipt'){
    if(!HEX32.test(s.parametersHash)||entry.timestamp<row.committed_at||entry.timestamp>=row.open_time||entry.timestamp>row.committed_at+SCORE_RULE.receiptWindow)throw Error('late or invalid scoring receipt');
    await db.prepare('INSERT OR IGNORE INTO score_receipts (case_id,receipt_id,parameters_hash,receipt_at,receipt_tx) VALUES (?,?,?,?,?)')
      .bind(row.id,entry.id,s.parametersHash,entry.timestamp,message.txHint||null).run();return true;
  }
  const r=await db.prepare('SELECT * FROM score_receipts WHERE case_id=?').bind(row.id).first();
  if(!r||entry.timestamp<row.open_time||!row.reveal_id||await parameterHash(s.parameters)!==r.parameters_hash)throw Error('score parameters do not match a timely receipt and reveal');
  if(r.parameters_id)return true;
  // Store the on-chain disclosure even if a price provider is down; verification retries independently.
  await db.prepare('UPDATE score_receipts SET parameters_id=?,parameters_tx=?,parameters_json=? WHERE case_id=? AND parameters_id IS NULL')
    .bind(entry.id,message.txHint||null,canonical(s.parameters),row.id).run();return true;
}
export async function verifyScores(db,{chain=chainFor(),history=(subject,at)=>cachedHistory(db,subject,at),endorse=verifyEndorsement,prices=collectPrices,now=Math.floor(Date.now()/1000)}={}){
  const rows=await db.prepare(`SELECT c.*,r.parameters_json FROM cases c JOIN score_receipts r ON r.case_id=c.id
    WHERE r.parameters_id IS NOT NULL AND r.verified=0 AND r.next_verify_at<=? ORDER BY r.next_verify_at,c.committed_block,c.inbox_index LIMIT 1`).bind(now).all();
  for(const row of rows.results){try{
    const p=JSON.parse(row.parameters_json),scoring=JSON.parse(row.revealed_scoring||'null'),claim=JSON.parse(row.revealed_claim||'null');
    validateRequest({v:1,type:'commitment',kind:row.kind,open:row.open_time,claim,slot:scoring?.slot,scoringVersion:scoring?.version},row.committed_at);
    if(!HEX32.test(p.salt)||!HEX32.test(p.historyHash)||p.version!==SCORE_RULE.version||p.caseId!==row.id||p.committedAt!==row.committed_at||p.openTime!==row.open_time||canonical(p.claim)!==canonical(claim)||canonical(p.slot)!==canonical(scoring.slot)||p.initialAt!==Math.floor(row.committed_at/60)*60)throw Error('disclosed parameters do not match original sealed request');
    const attribution=await endorse(chain,{...row,judgeEndpoint:JUDGE_ENDPOINT},p.slot);
    if(canonical(attribution)!==canonical({authorWallet:p.authorWallet,residentId:p.residentId}))throw Error('score attribution mismatch');
    // Recompute initial median from published evidence and verify historical oracle observations.
    const baseline=await medianAt(claim,p.initialAt,async(...args)=>{
      const collected=await prices(...args),ids=new Set(p.initialSources.map(s=>s.id));
      return {sources:collected.sources.filter(s=>ids.has(s.id)),errors:collected.errors};
    });
    decidePrice({...claim,at:p.initialAt},p.initialAt,p.initialSources);
    const ordered=sources=>[...sources].sort((a,b)=>a.id.localeCompare(b.id));
    if(canonical(ordered(p.initialSources))!==canonical(ordered(baseline.sources)))throw Error('initial evidence does not match historical sources');
    if(scaled(baseline.px0)!==scaled(p.px0))throw Error('initial price does not match historical sources');
    const candles=await history(claim.subject,row.committed_at);
    if(await digest(candles)!==p.historyHash)throw Error('history dataset hash mismatch');
    const result=estimate(claim,row.committed_at,row.open_time,p.px0,candles);
    for(const key of Object.keys(result))if(p[key]!==result[key])throw Error('probability recomputation mismatch');
    const used=await db.prepare('SELECT case_id FROM score_receipts WHERE circuit_id=? AND case_id!=?').bind(p.slot.circuitId,row.id).first();
    if(used)throw Error('endorsement reused');
    await db.prepare('UPDATE score_receipts SET verified=1,error=NULL,circuit_id=?,author_wallet=?,resident_id=?,p_units=? WHERE case_id=?')
      .bind(p.slot.circuitId,p.authorWallet,p.residentId,p.pUnits,row.id).run();
  }catch(error){await db.prepare('UPDATE score_receipts SET error=?,next_verify_at=? WHERE case_id=?').bind(String(error.message).slice(0,300),now+300,row.id).run();}}
}
export function settledScore(row){
  if(!row.verdict_id||!row.reveal_id||row.verified!==1)return null;
  try{
    const decision=decidePrice(JSON.parse(row.revealed_claim),row.open_time,JSON.parse(row.verdict_sources));
    if(decision.outcome!==row.outcome)return null;
    const value=scoreUnits(row.p_units,row.outcome);
    return value===null?null:{outcome:row.outcome,scoreUnits:value};
  }catch{return null;}
}
export async function leaderboard(db,asOf){
  const rows=await db.prepare('SELECT c.*,r.* FROM score_receipts r JOIN cases c ON c.id=r.case_id').all();
  const records=rows.results.map(r=>{
    const settled=settledScore(r);
    return {caseId:r.case_id,verified:r.verified===1,receiptId:r.receipt_id,parametersId:r.parameters_id,authorWallet:r.author_wallet,residentId:r.resident_id,pUnits:r.p_units,openTime:r.open_time,revealId:r.reveal_id,outcome:settled?.outcome||null,scoreUnits:settled?.scoreUnits??null};
  });
  const ranked=rank(records,asOf);
  return {version:SCORE_RULE.version,asOf,minimumSamples:SCORE_RULE.minRankSamples,rows:ranked,records,
    allocationRanking:ranked.filter(r=>r.eligible).map((r,index)=>({rank:index+1,authorWallet:r.authorWallet,residentId:r.residentId,scoreUnits:r.scoreUnits,settled:r.settled,cases:r.cases}))};
}

import {PRICE_RULE,isPriceRule,ruleFor,decidePrice,validateClaim} from './price-rules.mjs';
import {collectPrices} from './price-sources.mjs';
import {mod,tchain} from '../../vendor/tapesend.bundle.mjs';
import {linkedRef} from '../../app/protocol/scv1-ref.mjs';
import {HUB,CHAIN_ID} from './protocol.mjs';
export const JUDGE_CONTAINER='0xf053f07efcc2ade76d35dfbb6ed7c0f8eb976d35';
export const JUDGE_ENDPOINT=tchain.endpointId(CHAIN_ID,JUDGE_CONTAINER);
export const PROCESSOR='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282';

export async function prepareDecisions(db,{collect=collectPrices,now=Math.floor(Date.now()/1000),limit=1}={}) {
  const info=await db.prepare('SELECT MIN(safe_timestamp) AS at FROM cursors').first();
  const rows=await db.prepare(`SELECT cases.* FROM cases LEFT JOIN judge_jobs ON judge_jobs.case_id=cases.id
    WHERE cases.reveal_id IS NOT NULL AND cases.verdict_id IS NULL AND cases.open_time<=?
    AND (judge_jobs.case_id IS NULL OR (judge_jobs.state='awaiting-evidence' AND judge_jobs.retry_at<=?))
    ORDER BY cases.open_time LIMIT ?`).bind(Number(info?.at||0),now,limit).all();
  const done=[];
  for(const row of rows.results) {
    let state='awaiting-manual-review',reason='这条承诺需要判官核对公开证据。',outcome=null,sources=[],evidence=null;
    let rule=null,claim;try{claim=row.revealed_claim?JSON.parse(row.revealed_claim):null;}catch{}
    if(claim?.metric==='price') {
      try {
        validateClaim(claim,row.open_time);
        rule=ruleFor(claim);
        const collected=await collect(claim,row.open_time);sources=collected.sources;
        try{
          if(rule===PRICE_RULE&&collected.errors.length)throw Object.assign(Error('固定三源尚未齐备'),{code:'PRICE_EVIDENCE_PENDING'});
          const decision=decidePrice(claim,row.open_time,sources);outcome=decision.outcome;reason=decision.reason;
          evidence={price:decision.price,claim,rule,sourceErrors:collected.errors};
          state=isPriceRule(claim.ruleVersion)?'ready-for-chain':'awaiting-rule-review';
          if(state==='awaiting-rule-review')reason+=' 原封存未固定该取价规则，须判官确认，不能冒充事前约定的自动终判。';
        }catch(error){
          if(error.code!=='PRICE_EVIDENCE_PENDING')throw error;
          state='awaiting-evidence';reason=[error.message,...collected.errors].filter(Boolean).join('；');
        }
      }catch(error){state='awaiting-manual-review';reason=String(error.message);}
    }
    await db.prepare(`INSERT INTO judge_jobs (case_id,state,rule_version,outcome,reason,sources_json,evidence_json,prepared_at,updated_at,retry_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET state=excluded.state,rule_version=excluded.rule_version,outcome=excluded.outcome,
      reason=excluded.reason,sources_json=excluded.sources_json,evidence_json=excluded.evidence_json,updated_at=excluded.updated_at,retry_at=excluded.retry_at`)
      .bind(row.id,state,rule?.version||null,outcome,reason,JSON.stringify(sources),evidence?JSON.stringify(evidence):null,now,now,now+300).run();
    done.push({id:row.id,state});
  }
  return done;
}
export function verdictTransaction(row,decision,{now=Date.now()}={}) {
  if(!row.reveal_id||row.verdict_id||now<row.open_time*1000)throw Error('case not ready for verdict');
  if(!['hit','miss','undecidable'].includes(decision.outcome)||typeof decision.reason!=='string'||!decision.reason.trim()||decision.reason.length>4000||!Array.isArray(decision.sources))throw Error('invalid verdict');
  if(decision.outcome!=='undecidable'&&!decision.sources.length)throw Error('verdict requires public evidence');
  for(const source of decision.sources)if(typeof source.name!=='string'||!source.name||typeof source.value!=='string'||!source.value||!Number.isSafeInteger(source.at)||source.at<=0||source.at>Math.floor(now/1000)||!/^https:\/\//.test(source.url||''))throw Error('invalid evidence source');
  const ref=linkedRef('verdict',row.id);
  const content={v:1,kind:'message',subject:'168 · 判官裁决',body:decision.reason,ts:now,
    scv:{v:1,type:'verdict',commitment:{chainId:196,to:JUDGE_ENDPOINT,inboxIndex:row.inbox_index},
      outcome:decision.outcome,reason:decision.reason,sources:decision.sources,
      ...(decision.ruleVersion?{ruleVersion:decision.ruleVersion}:{}),scoring:row.revealed_scoring?'verify-separate-168-score-history-v1-receipt':'not-endorsed-no-score'}};
  const payload=mod.encodePublic(new TextEncoder().encode(JSON.stringify(content)));
  const tx=tchain.createTapeSendChains().get(196).encodeSend({circuits:PROCESSOR,tokenId:1,to:row.author_endpoint,ref,payload});
  if(tx.to!==HUB)throw Error('unexpected verdict destination');
  return {...tx,value:'0x0',ref,payload:mod.bytesToHex(payload)};
}

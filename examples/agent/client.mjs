// Agent adapter: public GETs and local arithmetic only. No signer or transaction sender.
import {SCORE_RULE,canonical,rank,scoreUnits,parameterHash,digest,estimate,validateRequest,units,HEX32} from '../../app/scoring/rules.mjs';
import {decidePrice} from '../../judge-worker/src/price-rules.mjs';

const address=/^0x[0-9a-f]{40}$/;
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b,message)=>requireValue(canonical(a)===canonical(b),message);

export function inspectLeaderboard(board,{now=Math.floor(Date.now()/1000),maxAge=900}={}){
  requireValue(board?.version===SCORE_RULE.version&&board.minimumSamples===SCORE_RULE.minRankSamples,'unsupported leaderboard rule');
  requireValue(Number.isSafeInteger(maxAge)&&maxAge>0,'invalid maximum age');
  requireValue(Number.isSafeInteger(board.asOf)&&board.asOf<=now+60&&now-board.asOf<=maxAge,'stale or invalid leaderboard snapshot');
  requireValue(board.enabled!==false,'scoring disabled');
  requireValue(Array.isArray(board.records)&&Array.isArray(board.rows)&&Array.isArray(board.allocationRanking),'incomplete leaderboard');
  const seen=new Set();
  for(const r of board.records){
    requireValue(HEX32.test(r.caseId)&&!seen.has(r.caseId),'invalid or duplicate case');seen.add(r.caseId);
    if(!r.verified)continue;
    requireValue(address.test(r.authorWallet)&&/^[1-9]\d*$/.test(r.residentId)&&r.residentId!=='1','invalid score attribution');
    requireValue([r.receiptId,r.parametersId,r.revealId].every(id=>HEX32.test(id))&&Number.isSafeInteger(r.openTime)&&r.openTime<=board.asOf,'missing public scoring records');
    requireValue(r.outcome===null||['hit','miss'].includes(r.outcome),'unsupported settlement');
    requireValue(r.scoreUnits===scoreUnits(r.pUnits,r.outcome),'case score mismatch');
  }
  const rows=rank(board.records,board.asOf);
  same(board.rows,rows,'leaderboard totals or order mismatch');
  const candidates=rows.filter(r=>r.eligible).map((r,i)=>({rank:i+1,authorWallet:r.authorWallet,residentId:r.residentId,scoreUnits:r.scoreUnits,settled:r.settled,cases:r.cases}));
  same(board.allocationRanking,candidates,'formal ranking mismatch');
  return {ruleVersion:board.version,asOf:board.asOf,settledRecords:board.records.filter(r=>r.verified&&r.outcome!==null).length,
    candidates,decision:candidates.length?'candidate-available':'awaiting-qualified-history',
    suggestedContact:candidates.length?`${candidates[0].residentId}.2.168`:null,
    action:'suggest-contact-only',resourceTransfer:false};
}

export async function verifyIndexedCase(record,detail,evidence){
  const c=detail?.case,s=detail?.scoring;
  requireValue(c?.id===record.caseId&&s?.verified===1,'case is not verified by the index');
  requireValue(s.receipt_id===record.receiptId&&s.parameters_id===record.parametersId&&c.revealId===record.revealId,'public message link mismatch');
  requireValue(Number.isSafeInteger(c.committedAt)&&Number.isSafeInteger(s.receipt_at)&&s.receipt_at>=c.committedAt&&s.receipt_at<c.openTime&&s.receipt_at<=c.committedAt+SCORE_RULE.receiptWindow,'late scoring receipt');
  const p=JSON.parse(s.parameters_json);
  requireValue(p.version===SCORE_RULE.version&&p.caseId===c.id&&p.committedAt===c.committedAt&&p.openTime===c.openTime&&p.openTime===record.openTime,'parameter attribution mismatch');
  same(p.claim,c.claim,'original claim mismatch');
  requireValue(p.authorWallet===record.authorWallet&&p.residentId===record.residentId&&p.pUnits===record.pUnits&&s.p_units===p.pUnits,'wallet or probability mismatch');
  validateRequest({type:'commitment',kind:c.kind,open:c.openTime,claim:p.claim,slot:p.slot,scoringVersion:p.version},c.committedAt);
  requireValue(HEX32.test(p.salt)&&HEX32.test(p.historyHash)&&await parameterHash(p)===s.parameters_hash,'parameter commitment mismatch');
  requireValue(p.initialAt===Math.floor(c.committedAt/60)*60,'invalid initial price time');
  const initial=decidePrice({...p.claim,at:p.initialAt},p.initialAt,p.initialSources);
  requireValue(units(initial.price)===units(p.px0),'initial price mismatch');
  requireValue(await digest(evidence?.candles)===p.historyHash,'history hash mismatch');
  const estimated=estimate(p.claim,c.committedAt,c.openTime,p.px0,evidence.candles);
  for(const key of Object.keys(estimated))requireValue(estimated[key]===p[key],'probability recomputation mismatch');
  requireValue(HEX32.test(c.verdictId)&&c.outcome===record.outcome,'missing or conflicting verdict');
  const verdict=decidePrice(c.claim,c.openTime,c.sources);
  requireValue(verdict.outcome===record.outcome,'price evidence disagrees with verdict');
  same(detail.scoringResult,{outcome:record.outcome,scoreUnits:scoreUnits(p.pUnits,record.outcome)},'detail score mismatch');
  return {caseId:c.id,pUnits:p.pUnits,scoreUnits:record.scoreUnits,circuitId:p.slot.circuitId,receiptId:s.receipt_id,parametersId:s.parameters_id,verdictId:c.verdictId};
}

export function createAgentClient({base='https://168-judge.joezuooo.workers.dev',fetchImpl=globalThis.fetch}={}){
  const origin=new URL(base);requireValue(origin.protocol==='https:'&&!origin.username&&!origin.password,'API requires HTTPS');
  async function get(path){
    const response=await fetchImpl(new URL(path,origin),{method:'GET',cache:'no-store',signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }
  return {get,
    async read({now=Math.floor(Date.now()/1000),maxAge=900,maxCases=100}={}){
      const startedAt=Date.now();
      const board=await get('/api/leaderboard'),report=inspectLeaderboard(board,{now,maxAge});
      const settled=board.records.filter(r=>r.verified&&r.outcome!==null);
      requireValue(settled.length<=maxCases,'case limit reached; refuse a partial ranking');
      const checked=[],slots=new Set();
      for(const record of settled){
        const detail=await get(`/api/cases/${record.caseId}`);
        requireValue(detail.asOf>=board.asOf,'case snapshot predates leaderboard');
        const evidence=await get(`/api/cases/${record.caseId}/scoring-evidence`);
        const verified=await verifyIndexedCase(record,detail,evidence);
        requireValue(!slots.has(verified.circuitId),'endorsement reused');slots.add(verified.circuitId);
        checked.push(verified);
      }
      // Recheck freshness after a possibly long evidence download.
      inspectLeaderboard(board,{now:now+Math.floor((Date.now()-startedAt)/1000),maxAge});
      return {...report,verification:'indexed-evidence-recomputed',checked,
        trust:'Index supplies chain authority and endorsement verification; this adapter recomputes disclosed hashes, historical p, prices, scores and ranking.'};
    }
  };
  // No background requests are started by constructing a client.
}

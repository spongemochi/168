import {leaderboard,settledScore} from './scoring.mjs';
import {SCORE_RULE} from '../../app/scoring/rules.mjs';
import {historyReadiness} from './history-cache.mjs';
import { displayState } from './protocol.mjs';
import { acceptSubmission } from './submission.mjs';
import { runJudge } from './service.mjs';
import { verdictTransaction } from './adjudicator.mjs';
import { PRICE_RULE,PRICE_RULE_V2,PRICE_RULES } from './price-rules.mjs';
import { executionStatus } from './executor.mjs';

const json = (value,status=200) => new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff'},
});
const project = (row,now) => ({
  id:row.id,residentId:row.resident_id,authorEndpoint:row.author_endpoint,authorContainer:row.author_container,kind:row.kind,openTime:row.open_time,
  committedAt:row.committed_at,committedBlock:row.committed_block,
  state:displayState(row,now),revealId:row.reveal_id,body:row.revealed_body,
  condition:row.revealed_condition,claim:row.revealed_claim ? JSON.parse(row.revealed_claim) : null,
  verdictId:row.verdict_id,outcome:row.outcome,reason:row.verdict_reason,
  sources:row.verdict_sources ? JSON.parse(row.verdict_sources) : [],
});
const syncInfo = async db => {
  const row = await db.prepare('SELECT MIN(safe_timestamp) AS timestamp, MIN(safe_block) AS block, MIN(updated_at) AS updated FROM cursors').first();
  return {asOf:Number(row?.timestamp || 0),safeBlock:Number(row?.block || 0),syncedAt:Number(row?.updated || 0)};
};

const worker = {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    const publicRead = ['/health','/api/cases','/api/judge/jobs','/api/judge/rules','/api/scoring/rules','/api/leaderboard'].includes(path) || /^\/api\/cases\/0x[0-9a-f]{64}(?:\/scoring-evidence)?$/.test(path);
    // These records are public. CORS never enables signed writes or admin routes.
    if (publicRead && request.method === 'OPTIONS') return new Response(null,{status:204,headers:{
      'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS',
    }});
    const response = await worker.handle(request,env);
    if (publicRead && request.method === 'GET') response.headers.set('access-control-allow-origin','*');
    return response;
  },
  async handle(request,env) {
    if (!env.DB) return json({error:'D1 binding is missing'},503);
    const url = new URL(request.url);
    try {
      if(url.pathname==='/admin')return Response.redirect(url.origin+'/admin/',302);
      if(url.pathname.startsWith('/admin/')&&env.ASSETS)return env.ASSETS.fetch(request);
      if (request.method === 'GET' && url.pathname === '/health') {
        const cursors = await env.DB.prepare('SELECT * FROM cursors ORDER BY stream').all();
        const run=await env.DB.prepare("SELECT * FROM service_runs WHERE name='judge'").first();
        const transactions=await env.DB.prepare('SELECT case_id,type,tx_hash,state,created_at,updated_at,error FROM judge_transactions ORDER BY created_at DESC LIMIT 10').all();
        const fresh=cursors.results.length===2&&cursors.results.every(r=>Math.floor(Date.now()/1000)-r.updated_at<900);
        return json({ok:fresh,chainId:196,judge:'1.2.168',cursors:cursors.results,run,transactions:transactions.results,
          automation:{priceEvidence:true,...executionStatus(env),automaticReveal:Boolean(env.AUTO_EXECUTE==='true'&&env.JUDGE_PRIVATE_KEY&&env.JUDGE_RECEIVE_KEY),
            priceVerdicts:'only-precommitted-price-rule',eventVerdicts:'public-evidence-review-required',scoring:env.SCORING_ENABLED==='true'?SCORE_RULE.version:'disabled'}});
      }
      if(request.method==='GET'&&url.pathname==='/api/scoring/rules'){
        const enabled=env.SCORING_ENABLED==='true',history=enabled?await historyReadiness(env.DB):{ready:false,assets:[]};
        const info=await syncInfo(env.DB),fresh=info.asOf>0&&Date.now()/1000-info.syncedAt<300;
        return json({enabled,ready:enabled&&history.ready&&fresh&&env.AUTO_EXECUTE==='true'&&Boolean(env.JUDGE_PRIVATE_KEY&&env.JUDGE_RECEIVE_KEY),history,rule:SCORE_RULE});
      }
      if(request.method==='GET'&&url.pathname==='/api/leaderboard'){
        const info=await syncInfo(env.DB);
        return json({...await leaderboard(env.DB,info.asOf),...info,enabled:env.SCORING_ENABLED==='true'});
      }
      if(request.method==='GET'&&url.pathname==='/api/judge/rules')return json({...PRICE_RULE,defaultVersion:PRICE_RULE_V2.version,versions:Object.values(PRICE_RULES)});
      if(request.method==='GET'&&url.pathname==='/api/judge/jobs') {
        const rows=await env.DB.prepare(`SELECT cases.*,judge_jobs.state AS job_state,judge_jobs.outcome AS proposed_outcome,
          judge_jobs.reason AS proposed_reason,judge_jobs.sources_json,judge_jobs.evidence_json,judge_jobs.rule_version
          FROM cases LEFT JOIN judge_jobs ON judge_jobs.case_id=cases.id ORDER BY cases.open_time LIMIT 100`).all();
        return json({jobs:rows.results.map(row=>({...project(row,Math.floor(Date.now()/1000)),
          jobState:row.verdict_id?'published':!row.reveal_id?'awaiting-public-reveal':row.job_state||'awaiting-evaluation',
          proposed:row.proposed_outcome?{outcome:row.proposed_outcome,reason:row.proposed_reason,
            sources:JSON.parse(row.sources_json||'[]'),ruleVersion:row.rule_version}:null,
          jobReason:row.proposed_reason||null})),...await syncInfo(env.DB)});
      }
      if(request.method==='POST'&&url.pathname==='/api/judge/prepare-verdict') {
        const raw=await request.text();if(raw.length>16000)return json({error:'verdict too large'},413);
        const input=JSON.parse(raw);if(!/^0x[0-9a-f]{64}$/.test(input.caseId||''))return json({error:'invalid case id'},400);
        const row=await env.DB.prepare('SELECT * FROM cases WHERE id=?').bind(input.caseId).first();
        if(!row)return json({error:'case not found'},404);
        const info=await syncInfo(env.DB);if(info.asOf<row.open_time)return json({error:'safe block has not reached open time'},409);
        return json({caseId:row.id,transaction:verdictTransaction(row,input.decision),
          note:'Unsigned transaction only. A judge-holder wallet must confirm it; no verdict is final until indexed from X Layer.'});
      }
      if (request.method === 'GET' && url.pathname === '/api/cases') {
        const limit = Math.min(50,Math.max(1,Math.floor(Number(url.searchParams.get('limit')) || 20)));
        const after = url.searchParams.get('after');
        const residentId=url.searchParams.get('resident');
        let query = 'SELECT * FROM cases';
        let args = [];
        if (after) {
          if (!/^0x[0-9a-f]{64}$/.test(after)) return json({error:'invalid pagination cursor'},400);
          const cursor = await env.DB.prepare('SELECT committed_block,inbox_index FROM cases WHERE id = ?').bind(after).first();
          if (!cursor) return json({error:'pagination cursor not found'},400);
          query += ' WHERE (committed_block < ? OR (committed_block = ? AND inbox_index < ?))';
          args = [cursor.committed_block,cursor.committed_block,cursor.inbox_index];
        }
        if(residentId){
          if(!/^[1-9]\d*$/.test(residentId)||residentId==='1')return json({error:'invalid resident id'},400);
          query+=(after?' AND':' WHERE')+' resident_id=?';args.push(residentId);
        }
        const [rows,info] = await Promise.all([
          env.DB.prepare(query+' ORDER BY committed_block DESC,inbox_index DESC LIMIT ?').bind(...args,limit+1).all(),
          syncInfo(env.DB),
        ]);
        const page = rows.results.slice(0,limit);
        return json({cases:page.map(row=>project(row,info.asOf)),...info,
          next:rows.results.length>limit ? page.at(-1).id : null,
          source:'X Layer safe-block index'});
      }
      const evidenceMatch=/^\/api\/cases\/(0x[0-9a-f]{64})\/scoring-evidence$/.exec(url.pathname);
      if(evidenceMatch&&request.method==='GET'){
        const evidence=await env.DB.prepare(`SELECT s.evidence_json FROM score_candidates s
          JOIN cases c ON c.id=s.case_id JOIN score_receipts r ON r.case_id=c.id
          WHERE c.id=? AND c.reveal_id IS NOT NULL AND r.parameters_id IS NOT NULL`).bind(evidenceMatch[1]).first();
        if(!evidence?.evidence_json)return json({error:'published scoring evidence unavailable'},404);
        return json(JSON.parse(evidence.evidence_json));
      }
      const match = /^\/api\/cases\/(0x[0-9a-f]{64})$/.exec(url.pathname);
      if (match && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(match[1]).first();
        if (!row) return json({error:'case not found'},404);
        const [records,submissions,info] = await Promise.all([
          env.DB.prepare('SELECT id,direction,record_type,valid,reason,block_number,tx_hint FROM chain_records WHERE case_id = ? ORDER BY block_number,id').bind(match[1]).all(),
          env.DB.prepare('SELECT kind,endpoint_name,signer,text,source_url,issued_at,signature,created_at FROM public_submissions WHERE case_id = ? ORDER BY id').bind(match[1]).all(),
          syncInfo(env.DB),
        ]);
        const score=await env.DB.prepare('SELECT receipt_id,receipt_tx,receipt_at,parameters_hash,parameters_id,parameters_tx,parameters_json,verified,p_units,error FROM score_receipts WHERE case_id=?').bind(row.id).first();
        const candidate=await env.DB.prepare('SELECT state,reason FROM score_candidates WHERE case_id=?').bind(row.id).first();
        const deadline=row.committed_at+SCORE_RULE.receiptWindow;
        const admission=candidate?{...candidate,deadline,state:!score&&['prepared','retry'].includes(candidate.state)&&Date.now()/1000>deadline?'expired':candidate.state}:null;
        return json({case:project(row,info.asOf),scoring:score,scoringResult:score?settledScore({...row,...score}):null,scoringAdmission:admission,...info,records:records.results,submissions:submissions.results,
          note:'Evidence and objections are signed public Worker records. Commitment, reveal, verdict and scoring receipt/parameter messages are on X Layer.'});
      }
      const submit = /^\/api\/cases\/(0x[0-9a-f]{64})\/submissions$/.exec(url.pathname);
      if (submit && request.method === 'POST') {
        if (env.ENABLE_PUBLIC_SUBMISSIONS !== 'true') return json({error:'public submissions are not enabled'},503);
        const raw = await request.text();
        if (raw.length > 6000) return json({error:'submission too large'},413);
        const body = JSON.parse(raw);
        const result = await acceptSubmission(env.DB,{...body,caseId:submit[1]});
        return json(result,201);
      }
      if (url.pathname === '/admin/sync' && request.method === 'POST') {
        if (!env.SYNC_TOKEN || request.headers.get('authorization') !== `Bearer ${env.SYNC_TOKEN}`) return json({error:'unauthorized'},401);
        return json(await runJudge(env.DB,{env}));
      }
      return json({error:'not found'},404);
    } catch (error) {
      return json({error:String(error.message || error)},400);
    }
  },
  async scheduled(_event,env,ctx) {
    ctx.waitUntil(runJudge(env.DB,{env}));
  },
};
export default worker;

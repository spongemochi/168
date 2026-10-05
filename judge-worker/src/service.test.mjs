import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {runJudge} from './service.mjs';import {observeTransactions} from './executor.mjs';
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const f of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql'])sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const db={prepare(q){const s=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};}};
 return {sql,db};
}
test('safe-block outage still tracks a mined transaction and warms history without signing or confirming the case',async()=>{
 const {sql,db}=fixture(),hash='0x'+'a'.repeat(64),events=[];try{
  sql.exec("INSERT INTO cases (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at) VALUES ('c',0,'a','a','forecast',3000,'r','p',1,1000)");
  sql.prepare("INSERT INTO judge_transactions VALUES ('c','reveal','wallet',0,?,'raw','100','broadcast',1000,1000,1,NULL)").run(hash);
  const chain={rpc:{many:async requests=>[{ok:true,raw:requests[0].normalize({transactionHash:hash,blockNumber:'0x2',blockHash:'0x'+'b'.repeat(64),status:'0x1'})}]}};
  await assert.rejects(runJudge(db,{env:{SCORING_ENABLED:'true'},observe:db=>observeTransactions(db,{chain}),
    sync:async()=>{throw Error('X Layer safe block quorum unavailable');},warm:async()=>events.push('warm'),execute:async()=>events.push('sign')}),/safe block/);
  assert.equal(sql.prepare('SELECT state FROM judge_transactions').get().state,'mined-awaiting-safe-index');
  assert.equal(sql.prepare('SELECT reveal_id FROM cases').get().reveal_id,null);
  assert.deepEqual(events,['warm']);assert.equal(sql.prepare('SELECT ok FROM service_runs').get().ok,0);
 }finally{sql.close();}
});
test('a tracking or scoring outage cannot prevent existing reveal/verdict work',async()=>{
 const {sql,db}=fixture(),events=[];try{
  await runJudge(db,{env:{SCORING_ENABLED:'true'},observe:async()=>{throw Error('receipt RPC timeout');},
    sync:async()=>({inbox:{nextIndex:1,total:1},outbox:{nextIndex:1,total:1}}),decide:async()=>[],
    execute:async()=>{events.push('execute');return {state:'broadcast'};},warm:async()=>{events.push('warm');throw Error('history timeout');}});
  assert.deepEqual(events,['execute','warm']);const run=sql.prepare('SELECT * FROM service_runs').get();
  assert.equal(run.ok,1);assert.match(run.tracking_error,/timeout/);assert.match(run.scoring_error,/timeout/);
 }finally{sql.close();}
});

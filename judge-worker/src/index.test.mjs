import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql']) {
    sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  }
  sqlite.exec("INSERT INTO cursors VALUES ('in',3,100,2000,1900),('out',0,100,2000,1900)");
  for (let index=1;index<=3;index++) sqlite.prepare(`INSERT INTO cases
    (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at)
    VALUES (?,?,?,?,'forecast',3000,'ref','sealed',99,1800)`)
    .run('0x'+String(index).repeat(64),index,'endpoint','0x'+'a'.repeat(40));
  const DB = {prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    return {bind(...values){args=values;return this;},async first(){return statement.get(...args) || null;},
      async all(){return {results:statement.all(...args)};}};
  }};
  return {DB,sqlite};
}

test('public submission writes stay closed in the initial deployment', async () => {
  const id = `0x${'a'.repeat(64)}`;
  const response = await worker.fetch(new Request(`https://example.test/api/cases/${id}/submissions`, {
    method: 'POST', body: '{}',
  }), { DB: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'public submissions are not enabled');
});

test('public pagination retains records in the same block without duplication',async()=>{
  const {DB,sqlite} = fixture();
  try {
    const request = query=>worker.fetch(new Request('https://example.test/api/cases?'+query),{DB});
    const firstResponse = await request('limit=2');
    const first = await firstResponse.json();
    assert.equal(firstResponse.headers.get('access-control-allow-origin'),'*');
    assert.deepEqual(first.cases.map(row=>row.id),['0x'+'3'.repeat(64),'0x'+'2'.repeat(64)]);
    assert.equal(first.cases[0].body,null);
    assert.equal(first.cases[0].state,'sealed');
    assert.equal(first.asOf,1900);
    assert.equal(first.safeBlock,100);
    assert.equal(first.syncedAt,2000);
    const second = await (await request('limit=2&after='+first.next)).json();
    assert.deepEqual(second.cases.map(row=>row.id),['0x'+'1'.repeat(64)]);
    assert.equal(second.next,null);
    assert.equal((await request('after=garbage')).status,400);
  } finally {sqlite.close();}
});

test('read-only browser access does not enable writes or admin CORS',async()=>{
  const response = await worker.fetch(new Request('https://example.test/api/cases',{method:'OPTIONS'}),{});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-methods'),'GET, OPTIONS');
  const admin = await worker.fetch(new Request('https://example.test/admin/sync',{method:'POST'}),{DB:{}});
  assert.equal(admin.status,401);
  assert.equal(admin.headers.get('access-control-allow-origin'),null);
});

test('health identifies the executor and exposes transaction state without signed bytes',async()=>{
 const {DB,sqlite}=fixture();try{
  const id='0x'+'1'.repeat(64);
  sqlite.prepare("INSERT INTO judge_transactions VALUES (?,'reveal','wallet',0,'tx-hash','PRIVATE_SIGNED_PAYLOAD','100','broadcast',1800,1801,1,NULL)").run(id);
  const response=await worker.fetch(new Request('https://example.test/health'),{DB});
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.automation.executorVersion,'168-scoring-v6');
  assert.equal(data.transactions[0].state,'broadcast');assert.equal(data.transactions[0].tx_hash,'tx-hash');
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE_SIGNED_PAYLOAD|raw_tx/);
 }finally{sqlite.close();}
});

test('sealed scoring parameters and historical evidence stay private until on-chain disclosure',async()=>{
  const {DB,sqlite}=fixture(),id='0x'+'1'.repeat(64);
  try{
    const parameters=JSON.stringify({salt:'PRIVATE_SALT',pUnits:500000});
    sqlite.prepare("INSERT INTO score_candidates (case_id,state,private_parameters,evidence_json,updated_at) VALUES (?,'prepared',?,?,1801)")
      .run(id,parameters,JSON.stringify({candles:['PRIVATE_HISTORY']}));
    sqlite.prepare('INSERT INTO score_receipts (case_id,receipt_id,parameters_hash,receipt_at) VALUES (?,?,?,1802)')
      .run(id,'receipt','0x'+'a'.repeat(64));
    const request=path=>worker.fetch(new Request('https://example.test'+path),{DB});
    for(const path of ['/api/cases','/api/cases/'+id,'/api/leaderboard','/health']){
      const response=await request(path);assert.equal(response.status,200);
      assert.doesNotMatch(await response.text(),/PRIVATE_SALT|PRIVATE_HISTORY|private_parameters|evidence_json/);
    }
    const detail=await (await request('/api/cases/'+id)).json();
    assert.equal(detail.scoring.parameters_json,null);
    assert.equal((await request('/api/cases/'+id+'/scoring-evidence')).status,404);
    sqlite.prepare('UPDATE cases SET reveal_id=? WHERE id=?').run('reveal',id);
    assert.equal((await request('/api/cases/'+id+'/scoring-evidence')).status,404);
    sqlite.prepare('UPDATE score_receipts SET parameters_id=?,parameters_json=? WHERE case_id=?').run('parameters',parameters,id);
    const publicEvidence=await request('/api/cases/'+id+'/scoring-evidence');assert.equal(publicEvidence.status,200);
    assert.deepEqual(await publicEvidence.json(),{candles:['PRIVATE_HISTORY']});
  }finally{sqlite.close();}
});

test('resident pagination filters the complete index rather than just the latest global page',async()=>{
 const {DB,sqlite}=fixture();try{
  sqlite.prepare('UPDATE cases SET resident_id=? WHERE id=?').run('2','0x'+'1'.repeat(64));
  sqlite.prepare('UPDATE cases SET resident_id=? WHERE id=?').run('2','0x'+'3'.repeat(64));
  sqlite.prepare('UPDATE cases SET resident_id=? WHERE id=?').run('3','0x'+'2'.repeat(64));
  const request=query=>worker.fetch(new Request('https://example.test/api/cases?'+query),{DB});
  const first=await (await request('resident=2&limit=1')).json();
  assert.equal(first.cases[0].residentId,'2');assert.equal(first.cases[0].id,'0x'+'3'.repeat(64));
  const second=await (await request('resident=2&limit=1&after='+first.next)).json();
  assert.equal(second.cases[0].id,'0x'+'1'.repeat(64));assert.equal(second.next,null);
  assert.equal((await request('resident=1')).status,400);
 }finally{sqlite.close();}
});
test('paid scoring readiness requires warmed history, recent synchronization and signing configuration',async()=>{
 const {DB,sqlite}=fixture(),now=Math.floor(Date.now()/1000),cutoff=Math.floor(now/3600)*3600;
 const env={DB,SCORING_ENABLED:'true',AUTO_EXECUTE:'true',JUDGE_PRIVATE_KEY:'test-present',JUDGE_RECEIVE_KEY:'test-present'};
 const read=async()=>await (await worker.fetch(new Request('https://example.test/api/scoring/rules'),env)).json();
 try{
  let result=await read();assert.equal(result.enabled,true);assert.equal(result.ready,false);
  const insert=sqlite.prepare('INSERT INTO price_history VALUES (?,?,?)');
  for(const subject of ['BTC/USD','ETH/USD'])for(let i=0;i<4320;i++)insert.run(subject,cutoff-i*3600,'100');
  assert.equal((await read()).ready,false); // History alone does not replace chain synchronization.
  sqlite.prepare('UPDATE cursors SET updated_at=?,safe_timestamp=?').run(now,now-180);
  result=await read();assert.equal(result.ready,true);assert.equal(result.rule.priceRule,'168-price-usd-v2');
  delete env.JUDGE_PRIVATE_KEY;assert.equal((await read()).ready,false);
 }finally{sqlite.close();}
});

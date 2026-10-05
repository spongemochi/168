import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {PRICE_RULE,PRICE_RULE_V2,decidePrice} from './price-rules.mjs';
import {blockAtOrBefore,okxAt} from './price-sources.mjs';
import {prepareDecisions,verdictTransaction,JUDGE_ENDPOINT} from './adjudicator.mjs';
import {mod,tchain} from '../../vendor/tapesend.bundle.mjs';
import {linkedRecord} from './protocol.mjs';
const open=2000000040,claim={metric:'price',subject:'BTC/USD',op:'>',value:'100',at:open};
const sources=[{id:'chainlink-bnb',name:'BNB',value:'99',at:open-10,url:'https://bscscan.com/'},
  {id:'chainlink-base',name:'Base',value:'100',at:open-20,url:'https://basescan.org/'},
  {id:'okx-usd-index',name:'OKX USD',value:'101',at:open,url:'https://www.okx.com/'}];
function fixture(){
  const sql=new DatabaseSync(':memory:');for(const name of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql'])sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const id='0x'+'1'.repeat(64),author=tchain.endpointId(196,'0x'+'2'.repeat(40));
  sql.prepare(`INSERT INTO cases (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at,reveal_id,revealed_claim)
    VALUES (?,4,?,?,'forecast',?,'ref','cipher',50,100,?,?)`).run(id,author,'0x'+'2'.repeat(40),open,'0x'+'3'.repeat(64),JSON.stringify(claim));
  sql.prepare('INSERT INTO cursors VALUES (?,?,100,?,?)').run('in',5,open+30,open+20);
  const DB={prepare(q){const statement=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};}};
  return {sql,DB,id,author};
}
test('three fixed USD sources, exact threshold and stale/future evidence guards',()=>{
  assert.equal(decidePrice(claim,open,sources).outcome,'miss'); // equality
  assert.equal(decidePrice({...claim,value:'99.999999999999999999'},open,sources).outcome,'hit');
  assert.throws(()=>decidePrice(claim,open,sources.slice(0,2)),/three/);
  assert.throws(()=>decidePrice(claim,open,[...sources.slice(0,2),{...sources[2],at:open+1}]),/future/);
  assert.throws(()=>decidePrice({...claim,subject:'BTC/USDT'},open,sources),/unsupported/);
});
test('v2 allows two providers only with bounded spread and matching threshold outcomes',()=>{
  const c={...claim,ruleVersion:PRICE_RULE_V2.version,value:'98'};
  assert.equal(decidePrice(c,open,[sources[1],sources[2]]).outcome,'hit');
  assert.throws(()=>decidePrice(c,open,sources.slice(0,2)),/OKX/);
  assert.throws(()=>decidePrice(c,open,[sources[1],sources[1]]),/duplicate/);
  assert.throws(()=>decidePrice({...c,value:'100'},open,[sources[1],sources[2]]),/disagree/);
  assert.throws(()=>decidePrice(c,open,[sources[1],{...sources[2],value:'102.00000001'}]),/spread/);
  assert.equal(decidePrice(c,open,[sources[1],{...sources[2],value:'102'}]).outcome,'hit');
  assert.equal(decidePrice({...c,value:'103'},open,[sources[1],sources[2]]).outcome,'miss');
  assert.equal(decidePrice({...c,value:'100'},open,[{...sources[1],value:'100'},{...sources[2],value:'100'}]).outcome,'miss');
  assert.equal(decidePrice({...c,value:'100'},open,sources).outcome,'miss');
  assert.throws(()=>decidePrice({...c,ruleVersion:'unknown'},open,sources),/version/);
  assert.throws(()=>decidePrice({...c,ruleVersion:PRICE_RULE.version},open,[sources[1],sources[2]]),/three/);
});
test('v2 partial evidence can publish, while ambiguous two-source evidence retries without an outcome',async()=>{
  const f=fixture();try{
    const c={...claim,ruleVersion:PRICE_RULE_V2.version,value:'98'};
    f.sql.prepare('UPDATE cases SET revealed_claim=?').run(JSON.stringify(c));
    const collect=async()=>({sources:[sources[1],sources[2]],errors:['BNB archive unavailable']});
    await prepareDecisions(f.DB,{now:open+100,collect});
    let job=f.sql.prepare('SELECT * FROM judge_jobs').get();
    assert.equal(job.state,'ready-for-chain');assert.equal(job.rule_version,PRICE_RULE_V2.version);assert.equal(job.outcome,'hit');
    f.sql.prepare('DELETE FROM judge_jobs').run();
    f.sql.prepare('UPDATE cases SET revealed_claim=?').run(JSON.stringify({...c,value:'100'}));
    await prepareDecisions(f.DB,{now:open+100,collect});
    job=f.sql.prepare('SELECT * FROM judge_jobs').get();assert.equal(job.state,'awaiting-evidence');assert.equal(job.outcome,null);
    assert.match(job.reason,/disagree/);
    // A v1 commitment may never use the same partial evidence to issue a verdict.
    f.sql.prepare('DELETE FROM judge_jobs').run();
    f.sql.prepare('UPDATE cases SET revealed_claim=?').run(JSON.stringify({...c,ruleVersion:PRICE_RULE.version}));
    await prepareDecisions(f.DB,{now:open+100,collect});
    assert.equal(f.sql.prepare('SELECT state FROM judge_jobs').get().state,'awaiting-evidence');
  }finally{f.sql.close();}
});
test('delayed job finds the last block before T, never the current feed state',async()=>{
  const chain={async finalizedBlock(){return 1000n;},rpc:{async many(requests){return requests.map(r=>{const n=Number(BigInt(r.params[0]));return {ok:true,raw:{number:String(n),timestamp:String(1000+n*2),hash:'h'+n}};});}}};
  const block=await blockAtOrBefore(chain,2001);assert.equal(block.number,500);assert.equal(block.timestamp,2000);
});
test('OKX must return the completed USD index candle ending at T',async()=>{
  const fetchImpl=async()=>({ok:true,async json(){return {code:'0',data:[[String((open-60)*1000),'98','101','97','100','1']]};}});
  assert.equal((await okxAt('BTC-USD',open,{fetchImpl})).value,'100');
  await assert.rejects(okxAt('BTC-USD',open,{fetchImpl:async()=>({ok:true,async json(){return {code:'0',data:[[String(open*1000),'98','101','97','100','1']]};}})}),/unavailable/);
});
test('legacy price records produce a review candidate, not a final chain verdict or retroactive score',async()=>{
  const f=fixture();try{
    await prepareDecisions(f.DB,{now:open+100,collect:async()=>({sources,errors:[]})});
    const job=f.sql.prepare('SELECT * FROM judge_jobs').get();assert.equal(job.state,'awaiting-rule-review');assert.equal(job.outcome,'miss');
    assert.equal(f.sql.prepare('SELECT verdict_id FROM cases').get().verdict_id,null);
    assert.deepEqual(await prepareDecisions(f.DB,{now:open+500,collect:async()=>{throw Error('must not fetch again');}}),[]);
  }finally{f.sql.close();}
});
test('missing evidence retries without inventing an outcome; future and unrevealed rows never evaluate',async()=>{
  const f=fixture();try{
    await prepareDecisions(f.DB,{now:open+100,collect:async()=>({sources:[],errors:['offline']})});
    assert.equal(f.sql.prepare('SELECT outcome FROM judge_jobs').get().outcome,null);
    assert.equal(f.sql.prepare('SELECT state FROM judge_jobs').get().state,'awaiting-evidence');
    f.sql.prepare('UPDATE cases SET reveal_id=NULL').run();assert.deepEqual(await prepareDecisions(f.DB,{now:open+1000}),[]);
  }finally{f.sql.close();}
});
test('prepared verdict is a valid SCV1 judge-to-author public message, not an arbitrary payment',()=>{
  const id='0x'+'1'.repeat(64),author=tchain.endpointId(196,'0x'+'2'.repeat(40));
  const row={id,inbox_index:4,author_endpoint:author,open_time:open,reveal_id:'revealed',verdict_id:null};
  const tx=verdictTransaction(row,{outcome:'miss',reason:'threshold equality',sources},{now:(open+100)*1000});
  const parsed=linkedRecord({fromEndpoint:JUDGE_ENDPOINT,to:author},{ref:tx.ref,payload:mod.hexToBytes(tx.payload)},'verdict',row,JUDGE_ENDPOINT);
  assert.equal(parsed.outcome,'miss');assert.equal(tx.value,'0x0');
  assert.throws(()=>verdictTransaction({...row,reveal_id:null},{outcome:'hit',reason:'x',sources}),/not ready/);
  assert.throws(()=>verdictTransaction(row,{outcome:'hit',reason:'x',sources:[]},{now:(open+100)*1000}),/evidence/);
});

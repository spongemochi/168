import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {warmHistory,cachedHistory,historyReadiness} from './history-cache.mjs';
const at=1800000000;
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(q){const s=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};}};
 return {sql,db};
}
const feed=(log=[],mutate=x=>x)=>async url=>{
 const q=new URL(url).searchParams,before=Number(q.get('after'));log.push({subject:q.get('instId'),before});
 return Response.json({code:'0',data:Array.from({length:100},(_,i)=>mutate([String(before-(i+1)*3600000),'100','100','100','100','1']))});
};
test('bounded warmup resumes checkpoints, serves a complete immutable window and needs only one new page each hour',async()=>{
 const {sql,db}=fixture(),log=[];try{
  const options={now:at,pagesPerAsset:4,fetchImpl:feed(log)};
  const first=await warmHistory(db,options);assert.equal(log.length,8);assert.equal(first.ready,false);assert.equal(first.assets[0].candles,400);
  await assert.rejects(cachedHistory(db,'BTC/USD',at),/incomplete/);
  for(let i=0;i<10;i++)await warmHistory(db,options);
  const ready=await historyReadiness(db,at);assert.equal(ready.ready,true);assert.equal(ready.assets[0].candles,4320);
  const calls=log.length;await warmHistory(db,options);assert.equal(log.length,calls);
  const old=await cachedHistory(db,'BTC/USD',at);assert.equal(old[0].at,at-4319*3600);assert.equal(old.at(-1).at,at);
  await warmHistory(db,{...options,now:at+3600});assert.equal(log.length,calls+2);
  assert.deepEqual(await cachedHistory(db,'BTC/USD',at),old);
  assert.equal((await cachedHistory(db,'BTC/USD',at+3600)).at(-1).at,at+3600);
 }finally{sql.close();}
});
test('a failed or contradictory page cannot mark history ready or replace past data',async()=>{
 const {sql,db}=fixture();try{
  await warmHistory(db,{now:at,pagesPerAsset:1,fetchImpl:async()=>{throw Error('fetch timeout');}});
  assert.match((await historyReadiness(db,at)).assets[0].error,/timeout/);
  await warmHistory(db,{now:at,pagesPerAsset:1,fetchImpl:feed()});
  sql.prepare('UPDATE history_sync SET cutoff=? WHERE subject=?').run(at-3600,'BTC/USD');
  await warmHistory(db,{now:at,pagesPerAsset:1,fetchImpl:feed([],c=>[...c.slice(0,4),'101',c[5]])});
  assert.match((await historyReadiness(db,at)).assets[0].error,/conflicting/);
  assert.equal(sql.prepare("SELECT close FROM price_history WHERE subject='BTC/USD' AND at=?").get(at).close,'100');
 }finally{sql.close();}
});

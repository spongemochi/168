import test from 'node:test';
import assert from 'node:assert/strict';
import {syncJudge} from './indexer.mjs';

function fixture({gap=false}={}) {
  const cursors={in:1,out:0}, fetched=[];
  const DB={prepare(sql){let args;return {bind(...v){args=v;return this;},async first(){return {next_index:cursors[args[0]]};},async all(){return {results:[]};},async run(){if(sql.startsWith('INSERT INTO cursors'))cursors[args[0]]=args[1];}};}};
  const entry=index=>({index,blockNumber:90,id:'message-'+index});
  const chain={async finalizedBlock(){return 100n;},rpc:{async many(){return [{ok:true,raw:{timestamp:2000}}];}},
    async resolveEndpoint(){return {status:'ok',chainId:196,endpoint:'judge',container:'container',circuits:'0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282'};},
    async inbox(){return {count:3,items:gap?[entry(2),entry(0)]:[entry(2),entry(1),entry(0)]};},
    async outbox(){return {count:0,items:[]};},
    async fetchMessage(e){fetched.push(e.index);return {ref:'0x'+'0'.repeat(64)};}};
  return {DB,chain,cursors,fetched};
}
test('incremental sync skips the old prefix and processes every new message once',async()=>{
  const f=fixture(); const result=await syncJudge(f.DB,{chain:f.chain});
  assert.deepEqual(f.fetched,[1,2]);assert.equal(result.inbox.processed,2);assert.equal(f.cursors.in,3);
  await syncJudge(f.DB,{chain:f.chain});assert.deepEqual(f.fetched,[1,2]);
});
test('a gap never advances the directory cursor',async()=>{
  const f=fixture({gap:true});await assert.rejects(syncJudge(f.DB,{chain:f.chain}),/incomplete in page/);
  assert.equal(f.cursors.in,1);assert.deepEqual(f.fetched,[]);
});

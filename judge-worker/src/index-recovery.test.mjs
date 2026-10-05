import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {syncJudge} from './indexer.mjs';
import {mod,tchain,judgeKeys} from '../../vendor/tapesend.bundle.mjs';
import {commitmentRef} from '../../app/protocol/scv1-ref.mjs';
import {CHAIN_ID,HUB} from './protocol.mjs';
const judge=tchain.endpointId(196,'0xf053f07efcc2ade76d35dfbb6ed7c0f8eb976d35');
const circuits='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282';
function fixture({oldRejection=false,reason='可用节点不足：需要 2 个节点给出相同结果',badAuthor=false}={}){
  const sql=new DatabaseSync(':memory:');
  for(const name of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql'])sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  sql.prepare('INSERT INTO cursors VALUES (?,?,?,?,?)').run('in',oldRejection?5:4,400,1000,1000);
  sql.prepare('INSERT INTO cursors VALUES (?,?,?,?,?)').run('out',0,400,1000,1000);
  const id=mod.messageId(CHAIN_ID,HUB,judge,4),from='0x'+'a'.repeat(40),fromEndpoint=tchain.endpointId(196,from);
  const state={fail:false,calls:0},ref=commitmentRef('forecast',1791119700);
  const key=judgeKeys.generateJudgeKey();
  const sealed=mod.seal({content:new TextEncoder().encode('{}'),recipients:[mod.hexToBytes(key.publicKey)],to:judge,from:fromEndpoint,hub:HUB,ref,returnKey:true});
  key.secretKey.fill(0);
  const message={ref,payload:sealed.payload,txHint:'0x'+'b'.repeat(64)};
  if(oldRejection)sql.prepare('INSERT INTO chain_records VALUES (?,?,?,?,?,?,?,?)').run(id,'in','commitment',null,0,reason,450,message.txHint);
  const DB={prepare(q){const statement=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};}};
  const entries=Array.from({length:5},(_,index)=>({id:mod.messageId(CHAIN_ID,HUB,judge,index),index,blockNumber:450,timestamp:1791118800,from,fromEndpoint,to:judge}));
  const chain={async finalizedBlock(){return 500n;},rpc:{async many(){return [{ok:true,raw:{timestamp:1791119760}}];}},
    async resolveEndpoint(input){
      if(input==='1.2.168')return {status:'ok',chainId:196,endpoint:judge,container:judge.slice(-40),circuits};
      state.calls++;if(state.fail)throw Error(reason);
      return {status:'ok',chainId:196,circuits:badAuthor?'0x'+'f'.repeat(40):circuits,tokenId:2n,container:from};
    },
    async inbox(_endpoint,{before,limit}){const end=Math.min(5,before),start=Math.max(0,end-limit);return {count:5,items:entries.slice(start,end).reverse()};},
    async outbox(){return {count:0,items:[]};},
    async fetchMessage(entry){return entry.index===4?message:{ref:'0x'+'0'.repeat(64)};}};
  return {DB,sql,id,state,chain,message};
}
test('a temporary resident identity read failure never permanently rejects or skips a commitment',async()=>{
  const f=fixture();try{
    f.state.fail=true;await assert.rejects(syncJudge(f.DB,{chain:f.chain}),/resident.identity/);
    assert.equal(f.sql.prepare("SELECT next_index FROM cursors WHERE stream='in'").get().next_index,4);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM chain_records').get().n,0);
    f.state.fail=false;await syncJudge(f.DB,{chain:f.chain});
    assert.equal(f.sql.prepare('SELECT id FROM cases').get().id,f.id);
    assert.equal(f.sql.prepare('SELECT valid FROM chain_records').get().valid,1);
    assert.equal(f.sql.prepare("SELECT next_index FROM cursors WHERE stream='in'").get().next_index,5);
  }finally{f.sql.close();}
});
test('an old RPC rejection is reverified from the original inbox with the same ID and bytes',async()=>{
  const f=fixture({oldRejection:true});try{
    assert.equal(f.id,'0x883d880b0d1655c8b4f4f5f54f22852fdb10d7330482e6f7314ea6791c76c1b3');
    await syncJudge(f.DB,{chain:f.chain});
    const row=f.sql.prepare('SELECT * FROM cases').get();
    assert.equal(row.id,f.id);assert.equal(row.inbox_index,4);assert.equal(row.payload_hex,mod.bytesToHex(f.message.payload));
    assert.equal(f.sql.prepare('SELECT valid FROM chain_records').get().valid,1);
    await syncJudge(f.DB,{chain:f.chain});assert.equal(f.state.calls,1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM cases').get().n,1);
  }finally{f.sql.close();}
});
test('repeated RPC disagreement stays retryable without accepting any author identity',async()=>{
  const f=fixture({oldRejection:true,reason:'节点返回的结果不一致，已拒绝（可能有节点作假或不同步）'});try{
    f.state.fail=true;await assert.rejects(syncJudge(f.DB,{chain:f.chain}),/resident.identity/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM cases').get().n,0);
    assert.equal(f.sql.prepare('SELECT valid FROM chain_records').get().valid,0);
    f.state.fail=false;await syncJudge(f.DB,{chain:f.chain});assert.equal(f.sql.prepare('SELECT valid FROM chain_records').get().valid,1);
  }finally{f.sql.close();}
});
test('a real author mismatch remains rejected and is not retried as an RPC failure',async()=>{
  const f=fixture({badAuthor:true});try{
    await syncJudge(f.DB,{chain:f.chain});
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM cases').get().n,0);
    assert.equal(f.sql.prepare('SELECT valid FROM chain_records').get().valid,0);
    await syncJudge(f.DB,{chain:f.chain});assert.equal(f.state.calls,1);
  }finally{f.sql.close();}
});

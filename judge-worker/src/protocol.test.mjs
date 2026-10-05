import test from 'node:test';
import assert from 'node:assert/strict';
import { mod, judgeKeys } from '../../vendor/tapesend.bundle.mjs';
import { commitmentRef, linkedRef } from '../../app/protocol/scv1-ref.mjs';
import { CHAIN_ID, HUB, commitmentEntry, linkedRecord, displayState } from './protocol.mjs';

const endpoint = address => `0x${'0'.repeat(8)}${CHAIN_ID.toString(16).padStart(16,'0')}${address.slice(2)}`;
const judgeContainer = `0x${'11'.repeat(20)}`;
const authorContainer = `0x${'22'.repeat(20)}`;
const judge = endpoint(judgeContainer);
const author = endpoint(authorContainer);
const open = 2000000000;
const ref = commitmentRef('forecast',open);

function fixture() {
  const keypair = judgeKeys.generateJudgeKey();
  const content = new TextEncoder().encode(JSON.stringify({v:1,kind:'message',body:'BTC 将超过目标价格',
    scv:{v:1,type:'commitment',kind:'forecast',open,condition:'BTC/USD > 100000'}}));
  const sealed = mod.seal({content,recipients:[mod.hexToBytes(keypair.publicKey)],to:judge,from:author,hub:HUB,ref,returnKey:true});
  const id = mod.messageId(CHAIN_ID,HUB,judge,4);
  const entry = {id,index:4,from:authorContainer,fromEndpoint:author,to:judge,blockNumber:100,timestamp:123};
  const commitment = commitmentEntry(entry,{ref,payload:sealed.payload});
  return {sealed,id,entry,commitment};
}

test('a public reveal opens only the exact sealed message and matching SCV1 metadata', () => {
  const f = fixture();
  const content = {v:1,kind:'message',body:'公布密钥',scv:{v:1,type:'reveal',
    commitment:{chainId:CHAIN_ID,to:judge,inboxIndex:4},key:mod.bytesToHex(f.sealed.key)}};
  const message = {ref:linkedRef('reveal',f.id),payload:mod.encodePublic(new TextEncoder().encode(JSON.stringify(content)))};
  const row = {id:f.id,inbox_index:4,author_container:authorContainer,author_endpoint:author,
    payload_hex:mod.bytesToHex(f.sealed.payload),commitment_ref:ref,kind:'forecast',open_time:open};
  const reveal = linkedRecord(f.entry,message,'reveal',row,judge);
  assert.equal(reveal.body,'BTC 将超过目标价格');
  assert.equal(reveal.condition,'BTC/USD > 100000');
  const corrupted = structuredClone(content);
  corrupted.scv.key=`0x${'00'.repeat(32)}`;
  assert.throws(()=>linkedRecord(f.entry,{...message,payload:mod.encodePublic(new TextEncoder().encode(JSON.stringify(corrupted)))},'reveal',row,judge),/content key/);
  assert.throws(()=>linkedRecord(f.entry,{...message,ref:linkedRef('reveal',`0x${'aa'.repeat(32)}`)},'reveal',row,judge),/ref mismatch/);
});

test('a designated verdict requires judge sender, author recipient and evidence for hit', () => {
  const f = fixture();
  const row = {id:f.id,inbox_index:4,author_container:authorContainer,author_endpoint:author};
  const content = {v:1,kind:'message',body:'命中',scv:{v:1,type:'verdict',
    commitment:{chainId:CHAIN_ID,to:judge,inboxIndex:4},outcome:'hit',sources:[{name:'test',value:'101000',at:open}]}};
  const message = {ref:linkedRef('verdict',f.id),payload:mod.encodePublic(new TextEncoder().encode(JSON.stringify(content)))};
  const entry = {from:judgeContainer,fromEndpoint:judge,to:author};
  assert.equal(linkedRecord(entry,message,'verdict',row,judge).outcome,'hit');
  assert.throws(()=>linkedRecord({...entry,fromEndpoint:author},message,'verdict',row,judge),/sender/);
  content.scv.sources=[];
  assert.throws(()=>linkedRecord(entry,{...message,payload:mod.encodePublic(new TextEncoder().encode(JSON.stringify(content)))},'verdict',row,judge),/sources/);
});

test('case states never present an absent reveal or verdict as final', () => {
  assert.equal(displayState({open_time:200,reveal_id:null,verdict_id:null},100),'sealed');
  assert.equal(displayState({open_time:200,reveal_id:null,verdict_id:null},200),'due-awaiting-verified-reveal');
  assert.equal(displayState({open_time:200,reveal_id:null,verdict_id:null},200+604800),'unrevealed');
  assert.equal(displayState({open_time:200,reveal_id:null,verdict_id:'0x2',outcome:'undecidable'},200),'due-awaiting-verified-reveal');
  assert.equal(displayState({open_time:200,reveal_id:'0x1',verdict_id:null},200),'revealed-awaiting-verdict');
  assert.equal(displayState({open_time:200,reveal_id:'0x1',verdict_id:'0x2',outcome:'hit'},200),'judged');
});

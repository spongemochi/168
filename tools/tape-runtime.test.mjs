import test from 'node:test';
import assert from 'node:assert/strict';
import { mod, judgeKeys } from '../vendor/tapesend.bundle.mjs';
import { x25519 } from '@noble/curves/ed25519.js';
import { webcrypto } from 'node:crypto';
import { encryptJudgeKey, decryptJudgeKey } from './judge-key-crypto.mjs';

globalThis.crypto ||= webcrypto;

test('a real sealed payload exports only its per-message reveal key and still opens', () => {
  const secret = x25519.utils.randomSecretKey();
  const recipient = x25519.getPublicKey(secret);
  const content = new TextEncoder().encode(JSON.stringify({v: 1, kind: 'message', body: '真实承诺', scv: {v: 1, type: 'commitment', kind: 'forecast', open: 1800000000}}));
  const to = `0x${'0'.repeat(8)}${(196).toString(16).padStart(16, '0')}${'1'.repeat(40)}`;
  const from = `0x${'0'.repeat(8)}${(196).toString(16).padStart(16, '0')}${'2'.repeat(40)}`;
  const hub = '0xe61a9c7213a6aa616c246a2b569e555b417b25ee';
  const ref = `0x534356310102${BigInt(1800000000).toString(16).padStart(16, '0')}${'00'.repeat(18)}`;
  const sealed = mod.seal({content, recipients: [recipient], to, from, hub, ref, returnKey: true});
  assert.equal(sealed.key.length, 32);
  assert.equal(mod.parsePayload(sealed.payload).kind, 'sealed');
  const opened = mod.openPayload({payload: sealed.payload, secretKey: secret, to, from, hub, ref});
  assert.deepEqual(opened.content, content);
});

test('a judge key restored from the encrypted backup can read a TapeSend message', async()=>{
  const pair=judgeKeys.generateJudgeKey();
  const backup=await encryptJudgeKey(pair.secretKey,{identity:'1.2.168',publicKey:pair.publicKey},'a long local password 123');
  pair.secretKey.fill(0);
  const restored=await decryptJudgeKey(backup,'a long local password 123');
  const to=`0x${'0'.repeat(8)}${(196).toString(16).padStart(16,'0')}${'1'.repeat(40)}`;
  const from=`0x${'0'.repeat(8)}${(196).toString(16).padStart(16,'0')}${'2'.repeat(40)}`;
  const hub='0xe61a9c7213a6aa616c246a2b569e555b417b25ee';
  const ref=`0x534356310102${BigInt(1800000000).toString(16).padStart(16,'0')}${'00'.repeat(18)}`;
  const content=new TextEncoder().encode('判官收到的密封承诺');
  const payload=mod.seal({content,recipients:[mod.hexToBytes(pair.publicKey,32)],to,from,hub,ref});
  try{
    const opened=mod.openPayload({payload,secretKey:restored,to,from,hub,ref});
    assert.deepEqual(opened.content,content);
  }finally{restored.fill(0);}
});

import fs from 'node:fs';
import vm from 'node:vm';
import {createRevealMessage} from '../app/protocol/scv1-reveal.mjs';
import {commitmentRef} from '../app/protocol/scv1-ref.mjs';
import {tchain} from '../vendor/tapesend.bundle.mjs';

test('ordinary price commitments seal v2 and the same rule shown before confirmation',async()=>{
 const open=2000000040,wallet='0x'+'a'.repeat(40),container='0x'+'2'.repeat(40),judge='0x'+'3'.repeat(40);
 const recipient=judgeKeys.generateJudgeKey(),to=tchain.endpointId(196,judge),from=tchain.endpointId(196,container);
 const source=fs.readFileSync(new URL('./tape-runtime.js',import.meta.url),'utf8')
   .replace("library=import('./vendor/tapesend.bundle.mjs')","library=Promise.resolve({mod,tchain})")
   .replace("await import('./app/protocol/scv1-ref.mjs')","({commitmentRef:testCommitmentRef})");
 const context={mod,tchain,testCommitmentRef:commitmentRef,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,CommitmentTime:{assert:()=>open}};
 vm.runInNewContext(source+'\nthis.api=Tape168;',context);
 const draft={kind:'price',visibility:'sealed',asset:'BTC',operator:'高于',target:'100',date:'2033-05-18',time:'12:34',text:'一个新的价格判断',stake:false};
 const state={ready:true,judgeEndpoint:{endpoint:to,key:{key:recipient.publicKey}},
   residentEndpoint:{endpoint:from,container,holder:wallet,circuits:'0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',tokenId:2,key:{usable:false}}};
 const prepared=await context.api.prepare(draft,state,wallet);
 const plain=mod.openWithContentKey({payload:mod.hexToBytes(prepared.payload),key:prepared.key,to,from,hub:context.api.hub,ref:prepared.ref});
 const content=JSON.parse(new TextDecoder().decode(plain));
 assert.equal(content.scv.claim.ruleVersion,'168-price-usd-v2');
 assert.ok(content.scv.condition.includes(context.api.priceRule(draft).description));
 assert.match(content.scv.condition,/2%/);
 assert.equal(context.api.priceRule({...draft,stake:true}).version,'168-price-usd-v2');
 recipient.secretKey.fill(0);
});

test('reveal receipt tolerates only a regenerated timestamp and verifies actual finalized bytes',async()=>{
  const to='0x'+'1'.repeat(64),from='0x'+'2'.repeat(40),id='0x'+'3'.repeat(64);
  const args={commitmentId:id,inboxIndex:1,to,key:'0x'+'4'.repeat(64)};
  const sent=createRevealMessage({...args,now:1000}),retry=createRevealMessage({...args,now:2000});
  let payload=sent.payload,finalPayload=sent.payload,logFrom=from;
  const chain={decodeSentLog:()=>({to,from:logFrom,ref:sent.ref,payload,inboxIndex:2n}),finalizedBlock:async()=>10n,
    inbox:async()=>({items:[{index:2,from,blockNumber:9,id}]}),fetchMessage:async()=>({ref:sent.ref,payload:finalPayload})};
  const context={mod,tchain:{createTapeSendChains:()=>new Map([[196,chain]])},TextEncoder,TextDecoder};
  const source=fs.readFileSync(new URL('./tape-runtime.js',import.meta.url),'utf8').replace("library=import('./vendor/tapesend.bundle.mjs')","library=Promise.resolve({mod,tchain})");
  vm.runInNewContext(source+'\nthis.api=Tape168;',context);
  const provider={request:async()=>({status:'0x1',blockNumber:'0x9',logs:[{}]})};
  const prepared={to,from,ref:retry.ref,payload:mod.bytesToHex(retry.payload)};
  const check=()=>context.api.verifyReceipt(provider,'0xhash',prepared);
  assert.equal((await check()).status,'final');
  finalPayload=retry.payload;
  assert.equal((await check()).status,'confirming');
  finalPayload=sent.payload;
  payload=createRevealMessage({...args,key:'0x'+'5'.repeat(64),now:1000}).payload;
  assert.equal((await check()).status,'unverified');
  payload=createRevealMessage({...args,inboxIndex:0,now:1000}).payload;
  assert.equal((await check()).status,'unverified');
  payload=sent.payload;logFrom='0x'+'6'.repeat(40);
  assert.equal((await check()).status,'unverified');
});

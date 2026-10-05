import test from 'node:test';
import assert from 'node:assert/strict';
import { mod } from '../../vendor/tapesend.bundle.mjs';
import { createRevealMessage } from './scv1-reveal.mjs';
import { linkedRef } from './scv1-ref.mjs';

test('public reveal binds the original commitment pointer and one-message key', () => {
  const id = `0x${'ab'.repeat(32)}`;
  const to = `0x${'12'.repeat(32)}`;
  const key = `0x${'34'.repeat(32)}`;
  const {ref,payload} = createRevealMessage({commitmentId:id,inboxIndex:7,to,key,now:1234});
  assert.equal(ref,linkedRef('reveal',id));
  const parsed = mod.parsePayload(payload);
  assert.equal(parsed.kind,'public');
  const value = JSON.parse(new TextDecoder().decode(parsed.content));
  assert.deepEqual(value.scv.commitment,{chainId:196,to,inboxIndex:7});
  assert.equal(value.scv.key,key);
  assert.equal(value.scv.type,'reveal');
});

test('invalid reveal inputs fail before transaction encoding', () => {
  const id = `0x${'ab'.repeat(32)}`;
  const to = `0x${'12'.repeat(32)}`;
  const key = `0x${'34'.repeat(32)}`;
  assert.throws(()=>createRevealMessage({commitmentId:id,inboxIndex:-1,to,key}),/index/);
  assert.throws(()=>createRevealMessage({commitmentId:id,inboxIndex:0,to,key:'0x01'}),/key/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { commitmentRef, linkedRef, parseRef } from './scv1-ref.mjs';

test('draft commitment example is encoded byte-for-byte', () => {
  const ref = commitmentRef('forecast', 1791259200);
  assert.equal(ref, `0x534356310102000000006ac47240${'00'.repeat(18)}`);
  assert.deepEqual(parseRef(ref), { type: 'commitment', kind: 'forecast', openTime: 1791259200n, malformed: false });
});

test('reveal and verdict reference the first 27 bytes of the commitment ID', () => {
  const id = '0xa7df3a8c829184ef7aa7d58ca798ede329157250076430fb979e5128e5ea2e0b';
  const verdict = linkedRef('verdict', id);
  assert.equal(verdict, '0x5343563103a7df3a8c829184ef7aa7d58ca798ede329157250076430fb979e51');
  assert.deepEqual(parseRef(verdict), { type: 'verdict', commitmentPrefix: `0x${id.slice(2, 56)}` });
  assert.equal(parseRef(linkedRef('reveal', id)).type, 'reveal');
});

test('invalid records are not silently accepted', () => {
  assert.equal(parseRef(`0x000000000102000000006ac47240${'00'.repeat(18)}`), null);
  assert.deepEqual(parseRef(`0x534356310102000000006ac47240${'00'.repeat(17)}01`),
    { type: 'commitment', malformed: true });
  assert.deepEqual(parseRef(`0x534356310401000000006ac47240${'00'.repeat(18)}`),
    { type: 'unknown-type', code: 4 });
  assert.throws(() => commitmentRef('forecast', -1), /positive uint64/);
  assert.throws(() => commitmentRef('forecast', Number.MAX_SAFE_INTEGER + 1), /positive uint64/);
  assert.throws(() => linkedRef('verdict', '0x1234'), /32 bytes/);
});

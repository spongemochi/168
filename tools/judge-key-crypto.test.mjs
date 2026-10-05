import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { encryptJudgeKey, decryptJudgeKey } from './judge-key-crypto.mjs';

globalThis.crypto ||= webcrypto;

test('judge backup only contains ciphertext and requires its passphrase', async()=>{
  const secret=crypto.getRandomValues(new Uint8Array(32));
  const backup=await encryptJudgeKey(secret,{identity:'1.2.168',publicKey:'0x'+'ab'.repeat(32)},'a long local password 123');
  assert.equal(backup.format,'168-judge-key-backup-v1');
  assert.ok(!JSON.stringify(backup).includes(Buffer.from(secret).toString('hex')));
  assert.deepEqual(await decryptJudgeKey(backup,'a long local password 123'),secret);
  await assert.rejects(decryptJudgeKey(backup,'another long password 456'),/密码不正确/);
});

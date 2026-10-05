import { mod } from '../../vendor/tapesend.bundle.mjs';
import { linkedRef } from './scv1-ref.mjs';

export function createRevealMessage({commitmentId,inboxIndex,to,key,now=Date.now()}) {
  if (!Number.isSafeInteger(inboxIndex) || inboxIndex < 0) throw new TypeError('invalid inbox index');
  if (!/^0x[0-9a-f]{64}$/.test(to) || !/^0x[0-9a-f]{64}$/.test(key)) throw new TypeError('invalid endpoint or key');
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('invalid timestamp');
  const ref = linkedRef('reveal',commitmentId);
  const content = new TextEncoder().encode(JSON.stringify({
    v:1,kind:'message',subject:'168 · 到期揭示',
    body:'公开此承诺的单条内容密钥，原话可由任何人从链上密文独立解出。',ts:now,
    scv:{v:1,type:'reveal',commitment:{chainId:196,to,inboxIndex},key},
  }));
  const payload = mod.encodePublic(content);
  return {ref,payload};
}

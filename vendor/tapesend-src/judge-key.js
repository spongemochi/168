// 168-specific, file-backed judge key. It deliberately does not request the
// official TapeSend deterministic wallet signature on a different website.
import { x25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from './send/module/src/bytes.js';

export function generateJudgeKey(){
  const secretKey=x25519.utils.randomSecretKey();
  return {secretKey,publicKey:bytesToHex(x25519.getPublicKey(secretKey))};
}

export function publicFromSecret(secret){
  const bytes=typeof secret==='string'?hexToBytes(secret,32):secret;
  if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw Error('判官密钥格式无效。');
  return bytesToHex(x25519.getPublicKey(bytes));
}

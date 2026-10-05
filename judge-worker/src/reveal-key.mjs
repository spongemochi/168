// TAP-10 v2 recipient unwrap. The receive secret is never the public reveal key.
import {x25519} from '@noble/curves/ed25519.js';
import {xchacha20poly1305} from '@noble/ciphers/chacha.js';
import {hkdf} from '@noble/hashes/hkdf.js';
import {sha256} from '@noble/hashes/sha2.js';
import {mod} from '../../vendor/tapesend.bundle.mjs';
const ascii=s=>new TextEncoder().encode(s);
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let n=0;for(const p of parts){out.set(p,n);n+=p.length;}return out;};
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function receivePublicKey(secret){return mod.bytesToHex(x25519.getPublicKey(secret));}
export function unwrapRevealKey({secret,payload,to,from,hub,ref}) {
  const parsed=mod.parsePayload(payload);if(parsed.kind!=='sealed')throw Error('commitment is not sealed');
  mod.assertValidPublicKey(parsed.E);
  const R=x25519.getPublicKey(secret),fp=sha256(R).slice(0,8);
  const T=concat(ascii('TAP-10/X/v2'),mod.hexToBytes(to),mod.hexToBytes(from),mod.hexToBytes(ref),mod.hexToBytes(hub));
  let shared,kek;
  try {
    shared=x25519.getSharedSecret(secret,parsed.E);
    kek=hkdf(sha256,shared,ascii('TAP-10/wrap/v2'),concat(parsed.E,R,T),32);
    for(const slot of parsed.slots) {
      if(!equal(slot.fingerprint,fp))continue;
      let key;
      try {
        key=xchacha20poly1305(kek,parsed.N,concat(parsed.P,T)).decrypt(slot.wrapped);
        if(!equal(sha256(concat(ascii('TAP-10/commit/v2'),key)),parsed.commit))continue;
        mod.openWithContentKey({payload,key,to,from,hub,ref});
        return mod.bytesToHex(key);
      }catch{}finally{key?.fill(0);}
    }
    throw Error('receive key cannot authenticate this commitment');
  }finally{shared?.fill(0);kek?.fill(0);}
}

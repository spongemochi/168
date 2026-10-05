import { mod, tchain } from '../../vendor/tapesend.bundle.mjs';
import { displayState } from './protocol.mjs';

const HEX32 = /^0x[0-9a-f]{64}$/;
const HEX65 = /^0x[0-9a-f]{130}$/;

export function signingText({caseId,kind,endpointName,text,sourceUrl,issuedAt}) {
  return JSON.stringify(['168 public review v1',196,caseId,kind,endpointName,text,sourceUrl || '',issuedAt]);
}

export async function acceptSubmission(db,input,{chain=tchain.createTapeSendChains().get(196),now=Math.floor(Date.now()/1000)}={}) {
  const {caseId,kind,endpointName,text,sourceUrl='',issuedAt,signature}=input || {};
  if (!HEX32.test(caseId) || !['evidence','objection'].includes(kind) ||
      typeof endpointName !== 'string' || !/^\d+\.2\.168$/.test(endpointName) ||
      endpointName === '1.2.168' || typeof text !== 'string' || text.length < 5 || text.length > 2000 ||
      typeof sourceUrl !== 'string' || sourceUrl.length > 500 ||
      (sourceUrl && !/^https:\/\//.test(sourceUrl)) || !Number.isSafeInteger(issuedAt) ||
      Math.abs(now-issuedAt) > 600 || !HEX65.test(signature)) throw Error('invalid signed submission');
  const c = await db.prepare('SELECT * FROM cases WHERE id = ?').bind(caseId).first();
  if (!c) throw Error('case not found');
  if (!c.reveal_id) throw Error('case has no verified public reveal');
  const state = displayState(c,now);
  if (kind === 'evidence' && state === 'judged') throw Error('final verdict already published');
  const signed = signingText({caseId,kind,endpointName,text,sourceUrl,issuedAt});
  const signer = mod.recoverAddress(mod.personalMessageHash(signed),signature);
  const safe = await chain.finalizedBlock();
  if (safe === null) throw Error('safe block unavailable');
  const endpoint = await chain.resolveEndpoint(endpointName,{block:`0x${safe.toString(16)}`,skipFreshness:true});
  if (endpoint.status !== 'ok' || endpoint.chainId !== 196 ||
      endpoint.circuits?.toLowerCase() !== '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282' ||
      endpoint.holder?.toLowerCase() !== signer.toLowerCase()) throw Error('signer does not hold this 168 resident circuit');
  await db.prepare(`INSERT INTO public_submissions
    (case_id,kind,endpoint_name,signer,text,source_url,issued_at,signature,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(caseId,kind,endpointName,signer,text,sourceUrl || null,issuedAt,signature,now).run();
  return {caseId,kind,endpointName,signer,createdAt:now,storage:'offchain-signed-public-record'};
}

// Prepare a real TapeSend transaction; signing/broadcast belongs to the caller.
import {mod,tchain} from '../../vendor/tapesend.bundle.mjs';
import {commitmentRef} from '../../app/protocol/scv1-ref.mjs';
import {SCORE_RULE,PROCESSOR,validateRequest} from '../../app/scoring/rules.mjs';
import {validateClaim} from '../../judge-worker/src/price-rules.mjs';
export const HUB='0xe61a9c7213a6aa616c246a2b569e555b417b25ee';

export async function prepareForecast(draft,{chain=tchain.createTapeSendChains({fetchImpl:globalThis.fetch}).get(196),readRules,now=Math.floor(Date.now()/1000)}={}){
  if(!/^[2-9]\d*$|^1\d+$/.test(String(draft.residentId))||!/^0x[0-9a-fA-F]{40}$/.test(draft.wallet||''))throw Error('resident and wallet required');
  if(typeof draft.body!=='string'||!draft.body.trim()||draft.body.length>1500)throw Error('forecast body required (maximum 1500 characters)');
  const claim={ruleVersion:SCORE_RULE.priceRule,metric:'price',subject:draft.subject,op:draft.op,value:draft.value,at:draft.openTime};
  validateClaim(claim,draft.openTime);
  if(draft.openTime<=now)throw Error('opening must be in the future');
  const safe=await chain.finalizedBlock();
  if(safe==null||BigInt(safe)<=0n)throw Error('safe block unavailable');
  const block='0x'+BigInt(safe).toString(16);
  await chain.assertFreshBlock(block);
  const author=await chain.resolveEndpoint(`${draft.residentId}.2.168`,{block});
  const judge=await chain.resolveEndpoint('1.2.168',{block});
  for(const endpoint of [author,judge]){
    if(endpoint.status!=='ok'||endpoint.chainId!==196||endpoint.circuits?.toLowerCase()!==PROCESSOR||!endpoint.opened||
       endpoint.endpoint!==tchain.endpointId(196,endpoint.container))throw Error('mailbox identity unavailable');
  }
  if(String(author.tokenId)!==String(draft.residentId)||author.holder?.toLowerCase()!==draft.wallet.toLowerCase()||String(judge.tokenId)!=='1')throw Error('resident holder mismatch');
  if(!judge.key?.usable||((BigInt(judge.key.chainsBits)>>2n)&1n)!==1n)throw Error('judge receiving key unavailable');
  const condition=`${claim.subject} ${claim.op} ${claim.value} USD at ${draft.openTime}; equality is miss; ${claim.ruleVersion}: three-source median, or agreeing OKX + Chainlink within 2%; unavailable evidence waits.`;
  const scv={v:1,type:'commitment',kind:'forecast',open:draft.openTime,claim,condition,nonce:mod.bytesToHex(crypto.getRandomValues(new Uint8Array(16)))};
  if(draft.slot){
    const rules=await readRules?.();
    if(!rules?.enabled||!rules.ready||rules.rule?.version!==SCORE_RULE.version)throw Error('scoring not ready');
    scv.scoringVersion=SCORE_RULE.version;scv.slot=draft.slot;
    validateRequest(scv,now);
    if(draft.slot.circuitId===String(author.tokenId))throw Error('endorsement cannot be the resident circuit');
  }
  const ref=commitmentRef('forecast',draft.openTime);
  const content=new TextEncoder().encode(JSON.stringify({v:1,kind:'message',subject:'168 · Agent 判断',body:draft.body,ts:now*1000,scv}));
  const sealed=mod.seal({content,recipients:[mod.hexToBytes(judge.key.key,32)],from:author.endpoint,to:judge.endpoint,hub:HUB,ref,returnKey:true});
  const tx=chain.encodeSend({circuits:author.circuits,tokenId:author.tokenId,to:judge.endpoint,ref,payload:sealed.payload});
  if(tx.to.toLowerCase()!==HUB)throw Error('unexpected message hub');
  return {transaction:{chainId:196,from:draft.wallet.toLowerCase(),to:tx.to,data:tx.data,value:'0x0'},
    backup:{version:1,chainId:196,identity:`${author.tokenId}.2.168`,to:judge.endpoint,ref,openTime:draft.openTime,key:mod.bytesToHex(sealed.key),payload:mod.bytesToHex(sealed.payload)},
    safeBlock:String(safe),admission:'not-yet-submitted'};
}

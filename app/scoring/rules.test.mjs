import test from 'node:test';
import assert from 'node:assert/strict';
import {estimate,parameterHash,rank,scoreRef,scoreType,SCORE_RULE,validateRequest} from './rules.mjs';
const cutoff=1800000000,claim={metric:'price',subject:'BTC/USD',op:'>',value:'100',at:cutoff+3600,ruleVersion:SCORE_RULE.priceRule};
const candles=Array.from({length:4320},(_,i)=>({at:cutoff-(4319-i)*3600,close:i%2?'101':'99'}));
test('historical probability uses exact cross products and reproducible six-decimal rounding',()=>{
 const p=estimate(claim,cutoff,cutoff+3600,'100',candles);
 assert.equal(p.samples,4319);assert.equal(p.hits,2160);assert.equal(p.pUnits,500116);
 assert.throws(()=>estimate(claim,cutoff,cutoff+3600,'100',candles.slice(1)),/invalid/);
 const future=structuredClone(candles);future.at(-1).at+=3600;
 assert.throws(()=>estimate(claim,cutoff,cutoff+3600,'100',future),/future/);
 assert.throws(()=>estimate({...claim,value:'999999'},cutoff,cutoff+3600,'100',candles),/range/);
});
test('canonical admission hash binds owner, chain context, probability and salt',async()=>{
 const p={pUnits:500116,authorWallet:'a',salt:'s'};
 assert.equal(await parameterHash(p),await parameterHash({salt:'s',authorWallet:'a',pUnits:500116}));
 assert.notEqual(await parameterHash(p),await parameterHash({...p,pUnits:500117}));
 assert.notEqual(await parameterHash(p),await parameterHash({...p,authorWallet:'b'}));
 const id='0x'+'1'.repeat(64);assert.equal(scoreType(scoreRef('receipt',id)),'receipt');assert.equal(scoreType(scoreRef('parameters',id)),'parameters');
});
test('rank is replay-idempotent, distinguishes original holders and enforces ten samples',()=>{
 const r={caseId:'a',verified:true,receiptId:'r',parametersId:'p',authorWallet:'wallet-a',residentId:'2',pUnits:300000,openTime:1,revealId:'reveal',outcome:'hit'};
 assert.equal(rank([r,r],100)[0].scoreUnits,700000);assert.equal(rank([r],100)[0].eligible,false);
 assert.equal(rank(Array.from({length:10},(_,i)=>({...r,caseId:String(i)})),100)[0].eligible,true);
 assert.equal(rank([r,{...r,caseId:'b',authorWallet:'wallet-b'}],100).length,2);
 assert.equal(rank([{...r,verified:false},{...r,residentId:'1'}],100).length,0);
 assert.equal(rank([{...r,outcome:'undecidable'}],100)[0].settled,0);
});
test('old claims, invalid slots and short-horizon tests cannot gain retroactive scores',()=>{
 const s={type:'commitment',kind:'forecast',open:claim.at,claim,scoringVersion:SCORE_RULE.version,slot:{chainId:196,processor:'0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',circuitId:'3',tapeoutTx:'0x'+'a'.repeat(64)}};
 assert.doesNotThrow(()=>validateRequest(s,cutoff));
 assert.throws(()=>validateRequest({...s,scoringVersion:undefined},cutoff));
 assert.throws(()=>validateRequest(s,cutoff+3000));
 for(const circuitId of ['03','0003',3,'+3','3.0'])assert.throws(()=>validateRequest({...s,slot:{...s.slot,circuitId}},cutoff),/endorsement/);
});

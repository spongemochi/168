import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticTransaction} from './executor.mjs';
import {decidePrice,PRICE_RULE,PRICE_RULE_V2} from './price-rules.mjs';
import {tchain} from '../../vendor/tapesend.bundle.mjs';
const open=2000000040;
const claim={ruleVersion:PRICE_RULE_V2.version,metric:'price',subject:'BTC/USD',op:'>',value:'98',at:open};
const sources=[{id:'chainlink-base',name:'Base',value:'100',at:open-10,url:'https://basescan.org/'},
  {id:'okx-usd-index',name:'OKX',value:'101',at:open,url:'https://www.okx.com/'}];
test('automatic verdicts require the exact rule fixed in the original commitment',()=>{
  const decision=decidePrice(claim,open,sources),row={id:'0x'+'1'.repeat(64),inbox_index:4,
    author_endpoint:tchain.endpointId(196,'0x'+'2'.repeat(40)),open_time:open,reveal_id:'reveal',
    job_state:'ready-for-chain',rule_version:PRICE_RULE_V2.version,revealed_claim:JSON.stringify(claim),
    sources_json:JSON.stringify(sources),proposed_outcome:decision.outcome,proposed_reason:decision.reason};
  const chain=tchain.createTapeSendChains().get(196),options={safeTime:open+10,now:open+20};
  assert.equal(automaticTransaction(chain,row,options).type,'verdict');
  assert.throws(()=>automaticTransaction(chain,{...row,revealed_claim:JSON.stringify({...claim,ruleVersion:PRICE_RULE.version})},options),/original commitment/);
  assert.throws(()=>automaticTransaction(chain,{...row,proposed_outcome:'miss'},options),/evidence/);
  assert.throws(()=>automaticTransaction(chain,{...row,rule_version:PRICE_RULE.version,revealed_claim:JSON.stringify({...claim,ruleVersion:PRICE_RULE.version})},options),/three/);
});

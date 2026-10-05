import test from 'node:test';import assert from 'node:assert/strict';
import ethers from '../vendor/ethers.cjs';
import {verifyEndorsement} from './endorsement.mjs';
import {PROCESSOR} from '../../app/scoring/rules.mjs';
const w=n=>BigInt(n).toString(16).padStart(64,'0'),wallet='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64),word='0x'+wallet.slice(2).padStart(64,'0');
function fixture(){
 const slot={circuitId:'3',tapeoutTx:hash};
 const receipt={status:'0x1',transactionHash:hash,blockNumber:'0x9',logs:[
 {address:PROCESSOR,topics:[ethers.id('Transfer(address,address,uint256)'),'0x'+w(0),word,'0x'+w(3)]},
 {address:'0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7',topics:[ethers.id('TransferSingle(address,address,address,uint256,uint256)'),word,word,'0x'+w(0)],data:'0x'+w(0)+w(1)}]};
 const tx={to:PROCESSOR,from:wallet,input:'0x7bd3ac1d'+w(96)+w(2)+w(1)+w(7)+'00000002000003'.padEnd(64,'0')};
 const row={id:'c',author_container:'container',author_endpoint:'endpoint',committed_block:10,inbox_index:1,judgeEndpoint:'judge'};
 const chain={resolveEndpoint:async()=>({status:'ok',circuits:PROCESSOR,endpoint:'endpoint',tokenId:2,holder:wallet}),inbox:async()=>({items:[{id:'c'}]}),fetchMessage:async()=>({txHint:'original'}),
 rpc:{many:async reqs=>reqs.map(r=>({ok:true,raw:r.method==='eth_getTransactionReceipt'?receipt:r.method==='eth_call'?word:r.params[0]==='original'?{from:wallet}:tx}))}};
 return {slot,receipt,tx,row,chain};
}
test('endorsement requires the extra circuit, actual NAND burn and historical submitter',async()=>{
 const f=fixture();assert.deepEqual(await verifyEndorsement(f.chain,f.row,f.slot),{authorWallet:wallet,residentId:'2'});
 f.receipt.logs.pop();await assert.rejects(verifyEndorsement(f.chain,f.row,f.slot),/burn/);
});
test('borrowed circuits, altered tapeout data and same-block creation are rejected',async()=>{
 for(const alter of [f=>f.tx.from='0x'+'9'.repeat(40),f=>f.tx.input+='00',f=>f.receipt.blockNumber='0xa']){const f=fixture();alter(f);await assert.rejects(verifyEndorsement(f.chain,f.row,f.slot),/mismatch/);}
 const f=fixture();await assert.rejects(verifyEndorsement(f.chain,f.row,{...f.slot,circuitId:'2'}),/differ/);
});
test('the real SDK value-only eth_call result verifies the historical owner',async()=>{
 const f=fixture(),many=f.chain.rpc.many;
 f.chain.rpc.many=async requests=>(await many(requests)).map((r,i)=>requests[i].method==='eth_call'?{ok:true,value:r.raw}:r);
 assert.deepEqual(await verifyEndorsement(f.chain,f.row,f.slot),{authorWallet:wallet,residentId:'2'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {XLAYER,processor168,circuitIdentity,ownedResidentCircuits,verifyResidentCircuit} from './xlayer-identity.mjs';

const owner='0x1111111111111111111111111111111111111111';
const container='0x2222222222222222222222222222222222222222';
const encodeAddress=a=>`0x${a.slice(2).padStart(64,'0')}`;
const bool=value=>`0x${'0'.repeat(63)}${value?'1':'0'}`;
function provider({chain='0xc4',processor=XLAYER.expectedProcessor}={}){
  const calls=[];
  return {calls,async request({method,params}){
    calls.push({method,params});
    if(method==='eth_chainId')return chain;
    if(method!=='eth_call')throw Error(`unexpected ${method}`);
    const [{to,data},block]=params;
    assert.equal(block,'safe');
    if(to===XLAYER.factory&&data.startsWith('0x4bc7cbbd'))return encodeAddress(processor);
    if(to===XLAYER.expectedProcessor&&data.startsWith('0x6352211e'))return encodeAddress(owner);
    if(to===XLAYER.opener&&data.startsWith('0x0c1905e5'))return encodeAddress(container);
    if(to===XLAYER.opener&&data.startsWith('0x8b508494'))return bool(true);
    throw Error(`unexpected call ${to} ${data}`);
  }};
}
test('judge identity is derived from factory #168 and circuit #1',async()=>{
  const rpc=provider();
  const identity=await circuitIdentity(rpc,1,{wallet:owner});
  assert.equal(identity.name,'1.2.168');
  assert.equal(identity.processor,XLAYER.expectedProcessor);
  assert.equal(identity.container,container);
  assert.equal(identity.opened,true);
  assert.equal(identity.belongsToWallet,true);
  assert.equal(rpc.calls.filter(c=>c.method==='eth_call').length,4);
});
test('wrong chain or different processor cannot masquerade as 1.2.168',async()=>{
  await assert.rejects(processor168(provider({chain:'0x1'})),{code:'wrong-chain'});
  await assert.rejects(processor168(provider({processor:owner})),{code:'processor-mismatch'});
});
test('owner mismatch does not authenticate a wallet',async()=>{
  const identity=await circuitIdentity(provider(),26,{wallet:container});
  assert.equal(identity.belongsToWallet,false);
  await assert.rejects(circuitIdentity(provider(),0),RangeError);
});
test('only circuits currently owned by the connected wallet are residents',async()=>{
  const p={async request({method,params}){
    if(method==='eth_chainId')return '0xc4';
    const [{to,data},block]=params;
    assert.equal(block,'latest');
    if(to===XLAYER.factory)return encodeAddress(XLAYER.expectedProcessor);
    if(to===XLAYER.expectedProcessor&&data.startsWith('0x70a08231'))return '0x2';
    if(to===XLAYER.expectedProcessor&&data.startsWith('0x61b8ce8c'))return '0x3';
    if(to===XLAYER.expectedProcessor&&data.startsWith('0x6352211e'))return encodeAddress(data.endsWith('1')||data.endsWith('3')?owner:container);
    throw Error('unexpected call');
  }};
  assert.deepEqual((await ownedResidentCircuits(p,owner)).map(c=>c.address),['3.2.168']);
  await assert.rejects(verifyResidentCircuit(p,owner,1),RangeError);
  await assert.rejects(verifyResidentCircuit(p,owner,2),{code:'not-owner'});
  assert.equal((await verifyResidentCircuit(p,owner,3)).address,'3.2.168');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedAccount,connectXLayer,findInjectedWallet} from './wallet.mjs';

const address='0x1111111111111111111111111111111111111111';
test('finds an injected OKX wallet without requesting access',()=>{
  const other={request(){},isMetaMask:true},okx={request(){},isOkxWallet:true};
  assert.equal(findInjectedWallet({ethereum:{providers:[other,okx]}}),okx);
  assert.equal(findInjectedWallet({}),null);
});
test('requests account only for an explicit connect, then switches to X Layer',async()=>{
  let chain='0x1';const methods=[];
  const provider={async request({method}){methods.push(method);if(method==='eth_requestAccounts')return [address];if(method==='eth_chainId')return chain;if(method==='wallet_switchEthereumChain'){chain='0xc4';return null;}throw Error(method);}};
  const result=await connectXLayer(provider);
  assert.equal(result.address,address);
  assert.deepEqual(methods,['eth_requestAccounts','eth_chainId','wallet_switchEthereumChain','eth_chainId']);
});
test('a denied or absent account cannot become a resident',async()=>{
  await assert.rejects(connectXLayer({request:async()=>[]}),/有效地址/);
  assert.equal(await authorizedAccount({request:async()=>[]}),null);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'chain-runtime.js'),'utf8');
const wallet='0x1111111111111111111111111111111111111111';
const processor='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282';
const factory='0x1f09daefa827f02cbb40967cc91b259763760761';
const transistor='0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7';
const opener='0x536add8f30f03b69f6fbf29d425a816a0dc50106';
const encode=a=>'0x'+a.slice(2).padStart(64,'0');
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function setup(){
  const txs=[];
  let mailboxOpened=false;
  const provider={async request({method,params=[]}){
    if(method==='eth_chainId')return '0xc4';
    if(method==='eth_accounts'||method==='eth_requestAccounts')return [wallet];
    if(method==='eth_getBalance')return '0xde0b6b3a7640000';
    if(method==='eth_call'){
      const [{to,data}]=params;
      if(to===factory)return encode(processor);
      if(to===processor&&data.startsWith('0x6fbd1719'))return encode(transistor);
      if(to===processor&&data.startsWith('0x70a08231'))return '0x0';
      if(to===processor&&data.startsWith('0x61b8ce8c'))return '0x1';
      if(to===processor&&data.startsWith('0xadfb2b69'))return '0x10';
      if(to===processor&&data.startsWith('0x6352211e'))return encode(wallet);
      if(to===transistor&&data.startsWith('0x6817c76c'))return '0x10';
      if(to===transistor&&data.startsWith('0xb0e21e8a'))return '0x10';
      if(to===transistor&&data.startsWith('0x00fdd58e'))return '0x0';
      if(to===opener&&data.startsWith('0x8b508494'))return mailboxOpened?'0x1':'0x0';
      if(to===opener&&data.startsWith('0xc57981b5'))return '0x20';
      throw Error('unexpected eth_call '+to+' '+data);
    }
    if(method==='eth_sendTransaction'){txs.push(params[0]);if(params[0].to===opener)mailboxOpened=true;return '0x'+txs.length.toString(16);}
    if(method==='eth_getTransactionReceipt')return {status:'0x1',transactionHash:params[0],logs:params[0]==='0x2'?[{address:processor,topics:[transfer,'0x'+'0'.repeat(64),encode(wallet),'0x'+'2'.padStart(64,'0')]}]:[]};
    throw Error('unexpected method '+method);
  }};
  const context={window:{ethereum:provider},setTimeout};
  vm.runInNewContext(code+'\nthis.Chain168=Chain168;',context);
  return {api:context.Chain168,provider,txs};
}
test('reading wallet and quote never sends a transaction',async()=>{
  const {api,provider,txs}=setup();
  assert.equal(await api.connect(provider),wallet);
  assert.equal((await api.owned(provider,wallet)).length,0);
  const price=await api.quote(provider,wallet);
  assert.equal(price.total,48n);
  assert.equal(price.transistorPrice,16n);
  assert.equal(price.tapeoutProtocolFee,16n);
  assert.equal(price.tapeout,16n);
  assert.equal(txs.length,0);
});
test('explicit resident creation mints and tapes out, then verifies ownership',async()=>{
  const {api,provider,txs}=setup();
  const price=await api.quote(provider,wallet);
  const circuit=await api.create(provider,wallet,price);
  assert.equal(circuit.address,'2.2.168');
  assert.equal(txs.length,2);
  assert.equal(txs[0].to,transistor);
  assert.equal(txs[1].to,processor);
  assert.ok(txs[1].data.startsWith('0x7bd3ac1d'));
});
test('mailbox opening reads live fee and requires a holder-confirmed transaction',async()=>{
  const {api,provider,txs}=setup();
  const before=await api.mailboxQuote(provider,wallet,2);
  assert.equal(before.opened,false);
  assert.equal(before.fee,32n);
  assert.equal(txs.length,0);
  await assert.rejects(()=>api.openMailbox(provider,wallet,2,31n),/费用已变化/);
  assert.equal(txs.length,0);
  const opened=await api.openMailbox(provider,wallet,2,before.fee);
  assert.equal(opened.txHash,'0x1');
  assert.equal(txs[0].to,opener);
  assert.equal(txs[0].value,'0x20');
  assert.equal((await api.mailboxQuote(provider,wallet,2)).opened,true);
});

test('endorsement tapeout hash is persisted and retry resumes without another payment',async()=>{
 const {api,provider,txs}=setup();let saved;
 const price=await api.quote(provider,wallet);
 const first=await api.create(provider,wallet,price,()=>{}, {},j=>{saved={...j};});
 assert.equal(saved.tapeoutTx,first.txHash);const count=txs.length;
 const recovered=await api.create(provider,wallet,price,()=>{},saved);
 assert.equal(recovered.id,first.id);assert.equal(txs.length,count);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ethers from '../vendor/ethers.cjs';
import {mod,tchain} from '../../vendor/tapesend.bundle.mjs';
import {commitmentRef} from '../../app/protocol/scv1-ref.mjs';
import {HUB,linkedRecord} from './protocol.mjs';
import {JUDGE_CONTAINER,JUDGE_ENDPOINT,PROCESSOR} from './adjudicator.mjs';
import {automaticTransaction,deliverJournal,observeTransactions,executeJudge as executeActual,verifyAuthority} from './executor.mjs';
import {collectGasPrice} from './gas-price.mjs';
import {receivePublicKey,unwrapRevealKey} from './reveal-key.mjs';
import {canonical,parameterHash,scoreType} from '../../app/scoring/rules.mjs';
const open=2000000040,now=open+100,secret=new Uint8Array(32).fill(7);
const executeJudge=(db,env,options)=>executeActual(db,env,{quoteGas:async()=>({price:'20000000'}),...options});
function fixture(){
  const sql=new DatabaseSync(':memory:');for(const name of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql','0005_scoring.sql','0006_history_cache.sql'])sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const id=mod.messageId(196,HUB,JUDGE_ENDPOINT,0),author=tchain.endpointId(196,'0x'+'2'.repeat(40)),ref=commitmentRef('forecast',open);
  const content=new TextEncoder().encode(JSON.stringify({v:1,kind:'message',subject:'test',body:'immutable event',ts:1,
    scv:{v:1,type:'commitment',kind:'forecast',open,condition:'public evidence required'}}));
  const sealed=mod.seal({content,to:JUDGE_ENDPOINT,from:author,hub:HUB,ref,recipients:[mod.hexToBytes(receivePublicKey(secret))],returnKey:true});
  sql.prepare(`INSERT INTO cases (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at)
    VALUES (?,0,?,?,'forecast',?,?,?,50,100)`).run(id,author,'0x'+'2'.repeat(40),open,ref,mod.bytesToHex(sealed.payload));
  sql.exec(`INSERT INTO cursors VALUES ('in',1,100,${now},${now}),('out',0,100,${now},${now})`);
  const DB={prepare(q){const s=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};}};
  const wallet=ethers.Wallet.createRandom(); // A disposable test key, never a real wallet.
  const chain={finalizedBlock:async()=>100n,assertFreshBlock:async()=>{},
    resolveEndpoint:async()=>({status:'ok',container:JUDGE_CONTAINER,endpoint:JUDGE_ENDPOINT,circuits:PROCESSOR,
      holder:wallet.address.toLowerCase(),opened:true,hub:{inEffect:true},factory:{inEffect:true},key:{usable:true,key:receivePublicKey(secret)}}),
    inbox:async()=>({items:[{index:0,id,fromEndpoint:author}]}),fetchMessage:async()=>({ref,payload:sealed.payload}),
    encodeSend:tchain.createTapeSendChains().get(196).encodeSend,
    rpc:{urls:['https://rpc.test'],async many(requests){return requests.map(r=>({ok:true,raw:
      r.method==='eth_getTransactionReceipt'?null:r.method==='eth_getTransactionCount'?'0x0':r.method==='eth_gasPrice'?'0x1312d00':r.method==='eth_estimateGas'?'0x186a0':'0x16345785d8a0000'}));}}};
  const row=sql.prepare('SELECT * FROM cases').get();return {sql,DB,row,chain,wallet,sealed};
}
test('recipient unwrap returns only the one-message key; early, wrong-key and context changes fail',()=>{
  const f=fixture();try{
    const p={secret,payload:f.sealed.payload,to:JUDGE_ENDPOINT,from:f.row.author_endpoint,hub:HUB,ref:f.row.commitment_ref};
    assert.equal(unwrapRevealKey(p),mod.bytesToHex(f.sealed.key));
    assert.notEqual(unwrapRevealKey(p),mod.bytesToHex(secret));
    assert.throws(()=>unwrapRevealKey({...p,secret:new Uint8Array(32).fill(8)}),/authenticate/);
    assert.throws(()=>unwrapRevealKey({...p,ref:commitmentRef('forecast',open+1)}),/authenticate/);
    assert.throws(()=>automaticTransaction(f.chain,f.row,{secret,now:open-1,safeTime:now}),/before/);
    const tx=automaticTransaction(f.chain,f.row,{secret,now,safeTime:now});
    assert.equal(tx.to,HUB);assert.equal(tx.value,'0x0');
  }finally{f.sql.close();}
});
test('signing is disabled without configuration; a timeout reuses identical signed transaction',async()=>{
  const f=fixture();try{
    assert.equal((await executeJudge(f.DB,{}, {chain:f.chain,now})).state,'awaiting-configuration');
    const env={AUTO_EXECUTE:'true',JUDGE_PRIVATE_KEY:f.wallet.privateKey,JUDGE_RECEIVE_KEY:mod.bytesToHex(secret)};
    const raws=[],fetchImpl=async(_url,request)=>{raws.push(JSON.parse(request.body).params[0]);throw Error('timeout after broadcast');};
    const first=await executeJudge(f.DB,env,{chain:f.chain,now,fetchImpl});
    assert.equal(first.state,'broadcast-uncertain');
    const second=await executeJudge(f.DB,env,{chain:f.chain,now:now+300,fetchImpl});
    assert.equal(second.transactionHash,first.transactionHash);assert.equal(raws.length,2);assert.equal(raws[0],raws[1]);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM judge_transactions').get().n,1);
    const tx=ethers.Transaction.from(raws[0]);assert.equal(tx.chainId,196n);assert.equal(tx.value,0n);assert.equal(tx.to.toLowerCase(),HUB);
    assert.equal(f.sql.prepare('SELECT reveal_id FROM cases').get().reveal_id,null); // Broadcast is not finality.
    const call=new ethers.Interface(['function send(address,uint256,bytes32,bytes32,bytes)']).parseTransaction({data:tx.data});
    const parsed=linkedRecord({from:JUDGE_CONTAINER,to:f.row.author_endpoint},{ref:call.args[3],payload:mod.hexToBytes(call.args[4])},'reveal',f.row,JUDGE_ENDPOINT);
    assert.equal(parsed.body,'immutable event');
  }finally{f.sql.close();}
});
test('fee cap and wrong holder prevent signing or sending',async()=>{
  const f=fixture();try{
    const env={AUTO_EXECUTE:'true',JUDGE_PRIVATE_KEY:f.wallet.privateKey,JUDGE_RECEIVE_KEY:mod.bytesToHex(secret),MAX_TX_FEE_WEI:'1',MAX_DAILY_FEE_WEI:'1'};
    await assert.rejects(executeJudge(f.DB,env,{chain:f.chain,now}),/fee limit/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM judge_transactions').get().n,0);
    f.chain.resolveEndpoint=async()=>({status:'ok',holder:'0x'+'0'.repeat(40)});
    await assert.rejects(executeJudge(f.DB,env,{chain:f.chain,now}),/holder/);
  }finally{f.sql.close();}
});

test('authority node conflicts identify the exact read and still prevent execution',async()=>{
 const f=fixture();try{
  f.chain.resolveEndpoint=async()=>{throw Error('nodes disagree');};
  await assert.rejects(verifyAuthority(f.chain,f.wallet.address),/\[authority.safe-identity\] nodes disagree/);
 }finally{f.sql.close();}
});

test('real TapeSend RPC value-only quantities support signing and null receipts support identical retry',async()=>{
 const f=fixture();try{
  const broadcasts=[];let minedReceipt=null;
  const fetchImpl=async(_url,request)=>{
   const data=JSON.parse(request.body),single=r=>({jsonrpc:'2.0',id:r.id,result:
     r.method==='eth_getTransactionCount'?'0x0':r.method==='eth_estimateGas'?'0x186a0':r.method==='eth_getBalance'?'0x16345785d8a0000':minedReceipt});
   if(!Array.isArray(data)&&data.method==='eth_sendRawTransaction'){
    broadcasts.push(data.params[0]);throw Error('broadcast response lost');
   }
   return {ok:true,json:async()=>Array.isArray(data)?data.map(single):single(data)};
  };
  f.chain.rpc=tchain.createTapeSendChains({rpcUrls:{196:['https://operator-a.test','https://operator-b.test']},fetchImpl}).get(196).rpc;
  const [numeric]=await f.chain.rpc.many([{method:'eth_getTransactionCount',params:[f.wallet.address,'latest'],normalize:v=>BigInt(v).toString()}],{all:true});
  assert.equal(numeric.value,'0x0');assert.equal(Object.hasOwn(numeric,'raw'),false);
  const env={AUTO_EXECUTE:'true',JUDGE_PRIVATE_KEY:f.wallet.privateKey,JUDGE_RECEIVE_KEY:mod.bytesToHex(secret)};
  const first=await executeJudge(f.DB,env,{chain:f.chain,now,fetchImpl});
  assert.equal(first.type,'reveal');assert.equal(first.state,'broadcast-uncertain');
  const second=await executeJudge(f.DB,env,{chain:f.chain,now:now+1,fetchImpl});
  assert.equal(second.transactionHash,first.transactionHash);
  assert.ok(broadcasts.length>=2);assert.ok(broadcasts.every(raw=>raw===broadcasts[0]));
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM judge_transactions').get().n,1);
  const tx=ethers.Transaction.from(broadcasts[0]);assert.equal(tx.nonce,0);assert.equal(tx.gasLimit,120000n);assert.equal(tx.value,0n);
  minedReceipt={transactionHash:first.transactionHash,blockNumber:'0x64',blockHash:'0x'+'b'.repeat(64),status:'0x1'};
  await observeTransactions(f.DB,{chain:f.chain,now:now+2});
  assert.equal(f.sql.prepare('SELECT state FROM judge_transactions').get().state,'mined-awaiting-safe-index');
  assert.equal(f.sql.prepare('SELECT reveal_id FROM cases').get().reveal_id,null);
  minedReceipt.transactionHash='0x'+'f'.repeat(64);
  await assert.rejects(observeTransactions(f.DB,{chain:f.chain,now:now+3}),/hash mismatch/);
 }finally{f.sql.close();}
});

test('different operator gas recommendations permit reveal while excessive quotes cannot sign',async()=>{
  const f=fixture();try{
    f.chain.rpc.urls=['https://operator-a.test','https://operator-b.test'];
    const env={AUTO_EXECUTE:'true',JUDGE_PRIVATE_KEY:f.wallet.privateKey,JUDGE_RECEIVE_KEY:mod.bytesToHex(secret)};
    let huge=true,sends=0;
    const fetchImpl=async(url,request)=>{
      const body=JSON.parse(request.body);
      if(body.method==='eth_gasPrice')return {ok:true,json:async()=>({id:168,result:huge?'0x1000000000000000':url.includes('operator-a')?'0x1406f40':'0x1312d01'})};
      sends++;return {json:async()=>({result:ethers.keccak256(body.params[0])})};
    };
    await assert.rejects(executeJudge(f.DB,env,{chain:f.chain,now,fetchImpl,quoteGas:collectGasPrice}),/fee limit/);
    assert.equal(sends,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM judge_transactions').get().n,0);
    huge=false;
    const result=await executeJudge(f.DB,env,{chain:f.chain,now,fetchImpl,quoteGas:collectGasPrice});
    assert.equal(result.type,'reveal');assert.equal(result.state,'broadcast');assert.equal(sends,1);
    const signed=f.sql.prepare('SELECT * FROM judge_transactions').get();
    const tx=ethers.Transaction.from(signed.raw_tx);assert.equal(tx.gasPrice,21000000n);
    assert.ok(tx.gasPrice*tx.gasLimit<=200000000000000n);
  }finally{f.sql.close();}
});

test('scoring opt-in uses the durable zero-value journal and an ambiguous send never creates a second payment',async()=>{
  const f=fixture(),current=Math.floor(Date.now()/1000);
  try{
    f.sql.prepare('UPDATE cases SET committed_at=?').run(current-30);
    f.sql.prepare('UPDATE cursors SET safe_timestamp=?').run(current);
    const parameters={caseId:f.row.id,pUnits:500000,salt:'private-test-salt'};
    f.sql.prepare("INSERT INTO score_candidates (case_id,state,private_parameters,updated_at) VALUES (?,'prepared',?,?)")
      .run(f.row.id,canonical(parameters),current);
    const env={AUTO_EXECUTE:'true',JUDGE_PRIVATE_KEY:f.wallet.privateKey};
    assert.equal((await executeJudge(f.DB,env,{chain:f.chain,now:current})).state,'no-automatic-work');
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM judge_transactions').get().n,0);
    env.SCORING_ENABLED='true';
    const raws=[],fetchImpl=async(_url,request)=>{raws.push(JSON.parse(request.body).params[0]);throw Error('ambiguous receipt broadcast');};
    const first=await executeJudge(f.DB,env,{chain:f.chain,now:current,fetchImpl});
    const second=await executeJudge(f.DB,env,{chain:f.chain,now:current+1,fetchImpl});
    assert.equal(first.type,'receipt');assert.equal(first.state,'broadcast-uncertain');
    assert.equal(first.transactionHash,second.transactionHash);assert.deepEqual(raws,[raws[0],raws[0]]);
    const tx=ethers.Transaction.from(raws[0]);assert.equal(tx.value,0n);assert.equal(tx.to.toLowerCase(),HUB);
    const call=new ethers.Interface(['function send(address,uint256,bytes32,bytes32,bytes)']).parseTransaction({data:tx.data});
    assert.equal(scoreType(call.args[3]),'receipt');
    const disclosure=JSON.parse(new TextDecoder().decode(mod.parsePayload(mod.hexToBytes(call.args[4])).content));
    assert.equal(disclosure.score.parametersHash,await parameterHash(parameters));
    assert.equal(disclosure.score.parameters,undefined);
    assert.doesNotMatch(new TextDecoder().decode(mod.parsePayload(mod.hexToBytes(call.args[4])).content),/private-test-salt/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM judge_transactions').get().n,1);
    f.sql.prepare('INSERT INTO score_receipts (case_id,receipt_id,parameters_hash,receipt_at) VALUES (?,?,?,?)')
      .run(f.row.id,'indexed-receipt',await parameterHash(parameters),current);
    assert.equal((await executeJudge(f.DB,env,{chain:f.chain,now:current+2,fetchImpl})).state,'confirmed');
    assert.equal(raws.length,2);
  }finally{f.sql.close();}
});
test('mined failure never becomes final; consumed nonce requires review instead of another payment',async()=>{
  const f=fixture();try{
    const record={case_id:f.row.id,type:'reveal',signer:f.wallet.address,nonce:0,tx_hash:'0x'+'1'.repeat(64),raw_tx:'signed'};
    let calls=0;
    f.chain.rpc.many=async()=>[{ok:true,raw:{status:'0x0'}}];
    assert.equal(await deliverJournal(f.DB,f.chain,record,{now,fetchImpl:()=>{calls++;}}),'reverted');
    f.chain.rpc.many=async requests=>[{ok:true,raw:requests[0].method==='eth_getTransactionReceipt'?null:'0x1'}];
    assert.equal(await deliverJournal(f.DB,f.chain,record,{now,fetchImpl:()=>{calls++;}}),'nonce-conflict');
    assert.equal(calls,0);
  }finally{f.sql.close();}
});
test('unsealed official contracts require an explicit pin; an implementation or manager change stops execution',async()=>{
  const f=fixture();try{
    const state=await f.chain.resolveEndpoint();
    state.factory={sealed:false,inEffect:false,circuitsIntact:true,factoryImplementation:'0x'+'a'.repeat(40),beaconOwner:'0x'+'b'.repeat(40)};
    state.hub={sealed:false,inEffect:false,expectedImplementation:true,implementation:'0x'+'c'.repeat(40),owner:'0x'+'d'.repeat(40)};
    f.chain.factorySeal={implementation:state.factory.factoryImplementation};f.chain.network={factory:state.factory.beaconOwner};
    f.chain.resolveEndpoint=async()=>state;
    await assert.rejects(verifyAuthority(f.chain,f.wallet.address),/explicit configuration/);
    const consent=await verifyAuthority(f.chain,f.wallet.address,{allowUpgradeable:true});
    await verifyAuthority(f.chain,f.wallet.address,{protocolPin:consent.protocolPin});
    state.hub.owner='0x'+'e'.repeat(40);
    await assert.rejects(verifyAuthority(f.chain,f.wallet.address,{protocolPin:consent.protocolPin}),/matching explicit/);
    state.hub.expectedImplementation=false;
    await assert.rejects(verifyAuthority(f.chain,f.wallet.address,{allowUpgradeable:true}),/expected official/);
  }finally{f.sql.close();}
});

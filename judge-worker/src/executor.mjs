import {selectScoreWork,scoreTransaction} from './scoring.mjs';
import {collectGasPrice} from './gas-price.mjs';
import {operation} from './operation.mjs';
import {SCORE_RULE} from '../../app/scoring/rules.mjs';
import ethers from '../vendor/ethers.cjs';
import {mod,tchain} from '../../vendor/tapesend.bundle.mjs';
import {createRevealMessage} from '../../app/protocol/scv1-reveal.mjs';
import {JUDGE_CONTAINER,JUDGE_ENDPOINT,PROCESSOR,verdictTransaction} from './adjudicator.mjs';
import {HUB,linkedRecord} from './protocol.mjs';
import {isPriceRule,decidePrice} from './price-rules.mjs';
import {receivePublicKey,unwrapRevealKey} from './reveal-key.mjs';
const hex=n=>'0x'+BigInt(n).toString(16);
const low=s=>String(s||'').toLowerCase();
const seconds=()=>Math.floor(Date.now()/1000);
const changed=result=>Number(result.meta?.changes??result.changes??0);
export function executionStatus(env) {
  return {executorVersion:'168-scoring-v6',priceRpcOperators:2,enabled:env.AUTO_EXECUTE==='true',signingConfigured:Boolean(env.JUDGE_PRIVATE_KEY),
    receiveKeyConfigured:Boolean(env.JUDGE_RECEIVE_KEY),
    protocolPinned:Boolean(env.JUDGE_PROTOCOL_PIN),
    maxTransactionFeeWei:String(env.MAX_TX_FEE_WEI||'200000000000000'),
    maxDailyFeeWei:String(env.MAX_DAILY_FEE_WEI||'2000000000000000')};
}
function limits(env) {
  const status=executionStatus(env),perTx=BigInt(status.maxTransactionFeeWei),perDay=BigInt(status.maxDailyFeeWei);
  if(perTx<=0n||perDay<perTx)throw Error('invalid executor fee limits');return {perTx,perDay};
}
async function read(chain,method,params,normalize) {
  try{
    const [r]=await chain.rpc.many([{method,params,normalize}],{all:true});
    if(!r?.ok)throw Error('RPC quorum unavailable');
    // TapeSend sets raw for structured/null results, but hex quantities have
    // value only and their normalize callback has not yet been applied.
    if(Object.hasOwn(r,'raw'))return r.raw;
    if(typeof r.value!=='string')throw Error('missing RPC value');
    return normalize?normalize(r.value):r.value;
  }catch(error){throw Error('executor '+method+': '+error.message);}
}
const quantity=v=>BigInt(v).toString();
function protocolSnapshot(judge) {
  return {factoryImplementation:low(judge.factory?.factoryImplementation),factorySealed:judge.factory?.sealed,
    beaconOwner:low(judge.factory?.beaconOwner),hubImplementation:low(judge.hub?.implementation),
    hubOwner:low(judge.hub?.owner),hubSealed:judge.hub?.sealed};
}
export async function verifyAuthority(chain,signer,{protocolPin,allowUpgradeable=false}={}) {
  const safe=await operation('authority.safe-block',()=>chain.finalizedBlock());if(safe===null)throw Error('safe block unavailable');
  const block=hex(safe),judge=await operation('authority.safe-identity',()=>chain.resolveEndpoint('1.2.168',{block,skipFreshness:true}));
  if(judge.status!=='ok'||low(judge.container)!==JUDGE_CONTAINER||low(judge.endpoint)!==JUDGE_ENDPOINT||
    low(judge.circuits)!==PROCESSOR||low(judge.holder)!==low(signer))throw Error('signer is not the current verified 1.2.168 holder');
  // Recheck at a recent pinned head too: a safe block can precede a transfer.
  const head=await operation('authority.current-identity',()=>chain.resolveEndpoint('1.2.168'));
  await operation('authority.freshness',()=>chain.assertFreshBlock(head.block));
  if(low(head.holder)!==low(signer)||low(head.container)!==JUDGE_CONTAINER||!head.opened)throw Error('judge ownership changed');
  const snapshot=protocolSnapshot(judge);
  if(JSON.stringify(snapshot)!==JSON.stringify(protocolSnapshot(head)))throw Error('protocol changed between safe block and current head');
  if(!judge.hub?.inEffect||!judge.factory?.inEffect) {
    // Upgradability is never silently accepted. An explicit setup consent pins
    // the known official implementation and management state; future changes halt.
    if(!judge.hub?.expectedImplementation||!judge.factory?.circuitsIntact||
      low(judge.factory?.factoryImplementation)!==low(chain.factorySeal?.implementation)||
      low(judge.factory?.beaconOwner)!==low(chain.network?.factory))throw Error('protocol implementation is not the expected official deployment');
    if(!allowUpgradeable&&(!protocolPin||JSON.stringify(snapshot)!==protocolPin))throw Error('upgradeable official protocol requires a matching explicit configuration pin');
  }else if(protocolPin&&JSON.stringify(snapshot)!==protocolPin)throw Error('pinned protocol state changed');
  return {judge,block,protocolPin:JSON.stringify(snapshot)};
}
async function verifyOriginal(chain,row,block) {
  const page=await operation('commitment.directory',()=>chain.inbox(JUDGE_ENDPOINT,{before:row.inbox_index+1,limit:1,block}));
  const entry=page.items.find(e=>e.index===row.inbox_index);
  if(!entry||low(entry.id)!==row.id||low(entry.fromEndpoint)!==row.author_endpoint)throw Error('original commitment directory mismatch');
  const message=await operation('commitment.message',()=>chain.fetchMessage(entry));
  if(low(message.ref)!==row.commitment_ref||mod.bytesToHex(message.payload)!==row.payload_hex)throw Error('original commitment digest mismatch');
}
export function automaticTransaction(chain,row,{safeTime,secret,now=seconds()}={}) {
  if(safeTime<row.open_time||now<row.open_time)throw Error('cannot reveal or judge before open time');
  if(!row.reveal_id) {
    if(!secret)throw Error('judge receive secret is not configured');
    const key=unwrapRevealKey({secret,payload:mod.hexToBytes(row.payload_hex),to:JUDGE_ENDPOINT,
      from:row.author_endpoint,hub:HUB,ref:row.commitment_ref});
    const message=createRevealMessage({commitmentId:row.id,inboxIndex:row.inbox_index,to:JUDGE_ENDPOINT,key,now:now*1000});
    // Authenticate SCV1 body/kind/open time before disclosing anything.
    linkedRecord({from:JUDGE_CONTAINER,fromEndpoint:JUDGE_ENDPOINT,to:row.author_endpoint},message,'reveal',row,JUDGE_ENDPOINT);
    return {type:'reveal',...chain.encodeSend({circuits:PROCESSOR,tokenId:1,to:row.author_endpoint,...message}),value:'0x0'};
  }
  if(row.verdict_id||row.job_state!=='ready-for-chain'||!isPriceRule(row.rule_version))throw Error('case has no approved automatic price decision');
  const claim=JSON.parse(row.revealed_claim||'null');
  if(claim?.ruleVersion!==row.rule_version||!isPriceRule(claim?.ruleVersion)||claim.metric!=='price')throw Error('original commitment did not fix the automatic price rule');
  const sources=JSON.parse(row.sources_json),decision=decidePrice(claim,row.open_time,sources);
  if(decision.outcome!==row.proposed_outcome||decision.reason!==row.proposed_reason)throw Error('automatic decision no longer matches its evidence');
  return {type:'verdict',...verdictTransaction(row,{outcome:row.proposed_outcome,reason:row.proposed_reason,
    sources,ruleVersion:row.rule_version},{now:now*1000})};
}
async function broadcast(chain,record,fetchImpl) {
  for(const url of chain.rpc.urls) {
    try {
      const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendRawTransaction',params:[record.raw_tx]}),signal:AbortSignal.timeout(10000)});
      const body=await response.json();
      if(low(body.result)===record.tx_hash||/already known|known transaction/i.test(body.error?.message||''))return true;
    }catch{}
  }
  return false; // Never sign another transaction after an ambiguous broadcast.
}
export async function deliverJournal(db,chain,record,{fetchImpl=fetch,now=seconds()}={}) {
  const row=await db.prepare('SELECT reveal_id,verdict_id FROM cases WHERE id=?').bind(record.case_id).first();
  const scoreConfirmed=['receipt','parameters'].includes(record.type)?await db.prepare('SELECT receipt_id,parameters_id FROM score_receipts WHERE case_id=?').bind(record.case_id).first():null;
  if(row?.[record.type+'_id']||scoreConfirmed?.[record.type+'_id']) {
    await db.prepare("UPDATE judge_transactions SET state='confirmed',updated_at=?,error=NULL WHERE tx_hash=?").bind(now,record.tx_hash).run();
    return 'confirmed';
  }
  const receipt=await read(chain,'eth_getTransactionReceipt',[record.tx_hash],r=>r?{
    hash:low(r.transactionHash),block:low(r.blockNumber),blockHash:low(r.blockHash),status:low(r.status)}:null);
  if(receipt) {
    const state=BigInt(receipt.status)===1n?'mined-awaiting-safe-index':'reverted';
    await db.prepare('UPDATE judge_transactions SET state=?,updated_at=?,error=? WHERE tx_hash=?')
      .bind(state,now,state==='reverted'?'transaction reverted; manual review required':null,record.tx_hash).run();
    return state;
  }
  const nonce=BigInt(await read(chain,'eth_getTransactionCount',[record.signer,'latest'],quantity));
  if(nonce>BigInt(record.nonce)) {
    await db.prepare("UPDATE judge_transactions SET state='nonce-conflict',updated_at=?,error=? WHERE tx_hash=?")
      .bind(now,'nonce consumed but recorded transaction not found; manual review required',record.tx_hash).run();
    return 'nonce-conflict';
  }
  const sent=await broadcast(chain,record,fetchImpl);
  await db.prepare('UPDATE judge_transactions SET state=?,updated_at=?,attempts=attempts+1,error=? WHERE tx_hash=?')
    .bind(sent?'broadcast':'broadcast-uncertain',now,sent?null:'broadcast unconfirmed; retry the identical signed bytes',record.tx_hash).run();
  return sent?'broadcast':'broadcast-uncertain';
}
// Read-only tracking does not depend on a successful inbox sync or sign anything.
// A mined receipt alone never marks a reveal/verdict or score as confirmed.
export async function observeTransactions(db,{chain=tchain.createTapeSendChains().get(196),now=seconds()}={}){
  const pending=await db.prepare("SELECT * FROM judge_transactions WHERE state NOT IN ('confirmed','reverted','nonce-conflict') ORDER BY created_at LIMIT 10").all();
  for(const record of pending.results){
    const receipt=await read(chain,'eth_getTransactionReceipt',[record.tx_hash],r=>r?{
      hash:low(r.transactionHash),block:low(r.blockNumber),blockHash:low(r.blockHash),status:low(r.status)}:null);
    if(!receipt)continue;
    if(receipt.hash!==record.tx_hash)throw Error('observed transaction hash mismatch');
    const state=BigInt(receipt.status)===1n?'mined-awaiting-safe-index':'reverted';
    await db.prepare('UPDATE judge_transactions SET state=?,updated_at=?,error=? WHERE tx_hash=?')
      .bind(state,now,state==='reverted'?'transaction reverted; manual review required':null,record.tx_hash).run();
  }
}
export async function executeJudge(db,env,{chain=tchain.createTapeSendChains().get(196),now=seconds(),fetchImpl=fetch,quoteGas=collectGasPrice}={}) {
  const status=executionStatus(env);
  if(!status.enabled||!status.signingConfigured)return {...status,state:'awaiting-configuration'};
  let wallet;try{wallet=new ethers.Wallet(env.JUDGE_PRIVATE_KEY);}catch{throw Error('invalid judge signing key');}
  const owner=crypto.randomUUID();
  const acquired=await db.prepare(`INSERT INTO executor_lock VALUES ('signer',?,?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE executor_lock.expires_at<?`)
    .bind(owner,now+1800,now).run();
  if(!changed(acquired))return {state:'another-run-is-active'};
  let secret;
  try {
    const {judge,block}=await verifyAuthority(chain,wallet.address,{protocolPin:env.JUDGE_PROTOCOL_PIN}),budget=limits(env);
    const pending=await db.prepare(`SELECT * FROM judge_transactions WHERE state NOT IN ('confirmed','reverted','nonce-conflict') ORDER BY created_at LIMIT 1`).first();
    if(pending)return {state:await deliverJournal(db,chain,pending,{now,fetchImpl}),transactionHash:pending.tx_hash};
    const info=await db.prepare('SELECT MIN(safe_timestamp) AS at FROM cursors').first();
    let row=await db.prepare(`SELECT cases.*,judge_jobs.state AS job_state,judge_jobs.rule_version,
      judge_jobs.outcome AS proposed_outcome,judge_jobs.reason AS proposed_reason,judge_jobs.sources_json
      FROM cases LEFT JOIN judge_jobs ON judge_jobs.case_id=cases.id
      WHERE cases.open_time<=? AND cases.verdict_id IS NULL
      AND ((cases.reveal_id IS NULL AND ?=1 AND COALESCE(judge_jobs.state,'')!='blocked-reveal') OR judge_jobs.state='ready-for-chain')
      AND NOT EXISTS (SELECT 1 FROM judge_transactions t WHERE t.case_id=cases.id
        AND t.type=CASE WHEN cases.reveal_id IS NULL THEN 'reveal' ELSE 'verdict' END)
      ORDER BY cases.open_time LIMIT 1`).bind(Number(info?.at||0),status.receiveKeyConfigured?1:0).first();
    if(!row&&env.SCORING_ENABLED==='true')row=await selectScoreWork(db,now);
    if(!row)return {state:'no-automatic-work'};
    if(!row.reveal_id&&!row.score_type) {
      try{secret=mod.hexToBytes(env.JUDGE_RECEIVE_KEY,32);}catch{throw Error('invalid judge receive key');}
      if(secret.length!==32||!judge.key?.usable||receivePublicKey(secret)!==low(judge.key.key))throw Error('receive secret does not match the published judge public key');
    }
    await verifyOriginal(chain,row,block);
    let transaction;
    try {transaction=row.score_type?await scoreTransaction(db,row,now):automaticTransaction(chain,row,{safeTime:Number(info.at),secret,now});}
    catch {
      if(row.score_type)throw Error('scoring transaction failed verification');
      if(row.reveal_id)throw Error('automatic price decision failed verification');
      await db.prepare(`INSERT INTO judge_jobs (case_id,state,reason,sources_json,prepared_at,updated_at,retry_at)
        VALUES (?,'blocked-reveal','原始密文或 SCV1 元数据未通过认证，需人工核对。','[]',?,?,0)
        ON CONFLICT(case_id) DO UPDATE SET state='blocked-reveal',reason=excluded.reason,updated_at=excluded.updated_at`)
        .bind(row.id,now,now).run();
      return {state:'reveal-needs-review',caseId:row.id};
    }
    if(low(transaction.to)!==HUB||BigInt(transaction.value)!==0n)throw Error('executor accepts only zero-value TapeSend transactions');
    const [nonce,pendingNonce,price,estimate,balance]=await Promise.all([
      read(chain,'eth_getTransactionCount',[wallet.address,'latest'],quantity),
      read(chain,'eth_getTransactionCount',[wallet.address,'pending'],quantity),
      quoteGas(chain,{fetchImpl}).then(quote=>quote.price),
      read(chain,'eth_estimateGas',[{from:wallet.address,to:HUB,data:transaction.data,value:'0x0'},block],quantity),
      read(chain,'eth_getBalance',[wallet.address,'latest'],quantity)]);
    if(BigInt(nonce)!==BigInt(pendingNonce))throw Error('judge wallet has another pending transaction');
    const gasLimit=(BigInt(estimate)*120n+99n)/100n,gasPrice=BigInt(price),fee=gasLimit*gasPrice;
    if(gasLimit>2000000n||gasPrice<=0n||fee>budget.perTx)throw Error('transaction exceeds configured network fee limit');
    const history=await db.prepare('SELECT max_fee_wei FROM judge_transactions WHERE created_at>=?').bind(now-86400).all();
    if(history.results.reduce((sum,r)=>sum+BigInt(r.max_fee_wei),0n)+fee>budget.perDay)throw Error('daily network fee budget reached');
    if(BigInt(balance)<fee)throw Error('judge wallet has insufficient OKB for network fee');
    if(row.score_type==='receipt'&&(seconds()>row.committed_at+SCORE_RULE.receiptWindow||seconds()>=row.open_time))throw Error('scoring admission expired during preparation');
    const raw=await wallet.signTransaction({chainId:196,type:0,nonce:Number(BigInt(nonce)),to:HUB,data:transaction.data,value:0n,gasLimit,gasPrice});
    const hash=ethers.keccak256(raw);
    // Persist before broadcasting. A timeout always resumes with the same hash and nonce.
    await db.prepare(`INSERT INTO judge_transactions (case_id,type,signer,nonce,tx_hash,raw_tx,max_fee_wei,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(row.id,transaction.type,low(wallet.address),Number(BigInt(nonce)),hash,raw,fee.toString(),now,now).run();
    const record=await db.prepare('SELECT * FROM judge_transactions WHERE tx_hash=?').bind(hash).first();
    return {state:await deliverJournal(db,chain,record,{now,fetchImpl}),transactionHash:hash,type:transaction.type,caseId:row.id};
  }finally {
    secret?.fill(0);
    await db.prepare("DELETE FROM executor_lock WHERE name='signer' AND owner=?").bind(owner).run();
  }
}

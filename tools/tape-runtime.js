// Read the official TapeSend endpoint state. A circuit NFT alone is not an open mailbox.
const Tape168=(()=>{
  let library;
  const load=()=>library||(library=import('./vendor/tapesend.bundle.mjs'));
  const hub='0xe61a9c7213a6aa616c246a2b569e555b417b25ee';
  async function judgeReadiness(){
    const {ts}=await load();
    const result=await ts.resolveEndpoint('1.2.168');
    const judge=result.endpoint;
    if(!judge)throw Error('暂时无法从 X Layer 核验判官信箱，请稍后重试。');
    if(judge.chainId!==196||judge.circuits.toLowerCase()!==Chain168.processor)throw Error('判官信箱不属于 X Layer 上的 168 处理器。');
    return {judge:{opened:judge.opened,key:judge.key.usable,holder:judge.holder,container:judge.container},judgeEndpoint:judge};
  }
  async function readiness(residentId){
    const [{judge,judgeEndpoint},{endpoint:resident}]=await Promise.all([
      judgeReadiness(),
      load().then(({ts})=>ts.resolveEndpoint(`${residentId}.2.168`))
    ]);
    if(!resident)throw Error('暂时无法从 X Layer 核验居民信箱，请稍后重试。');
    if(resident.chainId!==196||resident.circuits.toLowerCase()!==Chain168.processor)throw Error('居民信箱不属于 X Layer 上的 168 处理器。');
    return {
      judge,
      resident:{opened:resident.opened,key:resident.key.usable,holder:resident.holder,container:resident.container},
      ready:resident.opened&&judgeEndpoint.key.usable&&((BigInt(judgeEndpoint.key.chainsBits)>>2n)&1n)===1n,
      judgeEndpoint,residentEndpoint:resident
    };
  }
  function openTime(draft){
    return CommitmentTime.assert(draft);
  }
  function priceRule(draft){
    return {version:'168-price-usd-v2',description:'使用约定时刻的 Chainlink BNB、Chainlink Base 与 OKX 美元指数历史价格；三源齐备取中位数；仅两源时必须为 OKX 与一路 Chainlink，差价不超过较低价格的 2%，且对阈值判断一致，展示两源均价；严格比较，等于阈值记未中；来源不足、两源差价过大或结论相反时等待复核，不自动判命中或未中。'};
  }
  async function prepare(draft,state,wallet){
    const {mod,tchain}=await load();
    if(!state.ready)throw Error('判官公钥或居民信箱尚未准备好，无法创建真实封存。');
    if(state.residentEndpoint.holder?.toLowerCase()!==wallet.toLowerCase())throw Error('居民电路持有人与当前钱包不一致。');
    if(draft.visibility!=='sealed')throw Error('当前链上版本只支持到期揭示，请选择密封方式。');

    if(draft.kind==='letter')throw Error('未来信尚未纳入 SCV1 承诺类型，请选择一件事、价格判断或目标。');
    const kind=draft.kind==='goal'?'promise':'forecast',open=openTime(draft);
    const {commitmentRef}=await import('./app/protocol/scv1-ref.mjs');
    const ref=commitmentRef(kind,open);
    const rule=priceRule(draft);
    const claim=draft.kind==='price'?{ruleVersion:rule.version,metric:'price',subject:`${draft.asset}/USD`,op:draft.operator==='高于'?'>':'<',value:String(draft.target),at:open}:undefined;
    const condition=draft.kind==='price'?`${draft.date} 北京时间 ${draft.time}，${draft.asset} 价格${draft.operator} ${draft.target} 美元；等于阈值记为未中。`:String(draft.condition||'').trim();
    if(draft.kind==='price'&&!['BTC','ETH'].includes(draft.asset))
      throw Error('自动价格裁决目前仅支持 BTC 和 ETH。');
    const scv={v:1,type:'commitment',kind,open,condition:draft.kind==='price'
      ? condition+' 取价规则 '+rule.version+'：'+rule.description
      : condition,nonce:mod.bytesToHex(crypto.getRandomValues(new Uint8Array(16)))};
    if(claim)scv.claim=claim;
    if(draft.stake){
      const {SCORE_RULE,validateRequest}=await import('./app/scoring/rules.mjs');
      const response=await fetch('https://168-judge.joezuooo.workers.dev/api/scoring/rules',{signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw Error('计分服务暂时无法连接，请稍后重试。');
      const scoring=await response.json();
      if(!scoring.enabled||!scoring.ready||scoring.rule?.version!==SCORE_RULE.version)throw Error('计分数据尚未准备好，请稍后重试。');
      if(!draft.endorsement||draft.endorsement.wallet!==wallet.toLowerCase()||draft.endorsement.residentId!==String(state.residentEndpoint.tokenId))throw Error('请先创建并核验本次判断的背书电路。');
      scv.scoringVersion=SCORE_RULE.version;scv.slot=draft.endorsement.slot;
      validateRequest(scv,Math.floor(Date.now()/1000));
      if(scv.slot.circuitId===String(state.residentEndpoint.tokenId))throw Error('背书电路不能使用居民身份电路。');
    }
    const content=new TextEncoder().encode(JSON.stringify({v:1,kind:'message',subject:'168 · 一路发',body:`${draft.text.trim()}\n\n判定约定：${condition}`,ts:Date.now(),scv}));
    const to=state.judgeEndpoint,from=state.residentEndpoint;
    const recipients=[mod.hexToBytes(to.key.key,32)];
    if(from.key.usable&&from.key.current.toLowerCase()===wallet.toLowerCase()&&from.key.key.toLowerCase()!==to.key.key.toLowerCase())recipients.push(mod.hexToBytes(from.key.key,32));
    const sealed=mod.seal({content,recipients,to:to.endpoint,from:from.endpoint,hub,ref,returnKey:true});
    const tx=tchain.createTapeSendChains().get(196).encodeSend({circuits:from.circuits,tokenId:from.tokenId,to:to.endpoint,ref,payload:sealed.payload});
    return {tx,ref,key:mod.bytesToHex(sealed.key),payload:mod.bytesToHex(sealed.payload),from:from.container,to:to.endpoint,recipientKey:to.key.key,open,kind};
  }
  async function gasQuote(provider,wallet,prepared){
    const tx={from:wallet,to:prepared.tx.to,data:prepared.tx.data};
    const [gas,price]=await Promise.all([
      provider.request({method:'eth_estimateGas',params:[tx]}),
      provider.request({method:'eth_gasPrice',params:[]})
    ]);
    return {gas:BigInt(gas),price:BigInt(price),estimated:BigInt(gas)*BigInt(price)};
  }
  function downloadKey(prepared,identity){
    const kit={format:'168-scv1-reveal-kit-v1',warning:'此文件含公开密钥 K。持有者可提前揭示承诺，请离线妥善保存。',chainId:196,hub,identity,ref:prepared.ref,from:prepared.from,to:prepared.to,open:prepared.open,key:prepared.key,payload:prepared.payload};
    const url=URL.createObjectURL(new Blob([JSON.stringify(kit,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`168-reveal-key-${prepared.ref.slice(2,16)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function createJudgeBackup(state,wallet,passphrase){
    if(!state.judgeEndpoint.opened||state.judgeEndpoint.holder?.toLowerCase()!==wallet.toLowerCase())throw Error('只有已开通信箱的判官电路持有人可以准备收信密钥。');
    if(state.judgeEndpoint.key.usable)throw Error('判官已经发布收信公钥，请勿生成另一把覆盖它。');
    const {judgeKeys}=await load();
    const {encryptJudgeKey}=await import('./tools/judge-key-crypto.mjs');
    const pair=judgeKeys.generateJudgeKey();
    const keyIndex=state.judgeEndpoint.key.version>0?Number(state.judgeEndpoint.key.keyIndex)+1:0;
    if(keyIndex>65535){pair.secretKey.fill(0);throw Error('判官密钥序号已达到上限。');}
    try{
      const backup=await encryptJudgeKey(pair.secretKey,{identity:'1.2.168',holder:wallet.toLowerCase(),container:state.judgeEndpoint.container.toLowerCase(),hub,publicKey:pair.publicKey,keyIndex},passphrase);
      return {backup,publicKey:pair.publicKey,keyIndex};
    }finally{pair.secretKey.fill(0);}
  }
  async function verifyJudgeBackup(backup,passphrase,state,wallet){
    const {judgeKeys}=await load();
    const {decryptJudgeKey}=await import('./tools/judge-key-crypto.mjs');
    if(backup?.identity!=='1.2.168'||backup.holder?.toLowerCase()!==wallet.toLowerCase()||backup.container?.toLowerCase()!==state.judgeEndpoint.container.toLowerCase()||backup.hub?.toLowerCase()!==hub)throw Error('这份备份不属于当前判官信箱与钱包。');
    const secret=await decryptJudgeKey(backup,passphrase);
    try{if(judgeKeys.publicFromSecret(secret).toLowerCase()!==backup.publicKey?.toLowerCase())throw Error('备份里的公钥与私钥不匹配。');}
    finally{secret.fill(0);}
    if(!Number.isInteger(backup.keyIndex)||backup.keyIndex<0||backup.keyIndex>65535)throw Error('备份里的密钥序号无效。');
    return {backup,publicKey:backup.publicKey,keyIndex:backup.keyIndex};
  }
  function downloadJudgeBackup(backup){
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='168-judge-key-1.2.168-encrypted.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function publishJudgeKey(provider,wallet,prepared){
    if((await Chain168.authorized(provider))!==wallet.toLowerCase())throw Error('钱包地址已变化，请重新核验。');
    await Chain168.assertProcessor(provider);
    const {ts,tchain}=await load();
    const live=await ts.resolveEndpoint('1.2.168');
    if(!live.endpoint?.opened||live.endpoint.holder?.toLowerCase()!==wallet.toLowerCase()||live.endpoint.circuits.toLowerCase()!==Chain168.processor)throw Error('判官信箱尚未开通，或当前钱包不是持有人。');
    if(live.endpoint.key.usable)throw Error('判官已经有可用公钥；为避免覆盖旧消息密钥，已停止。');
    const expectedIndex=live.endpoint.key.version>0?Number(live.endpoint.key.keyIndex)+1:0;
    if(prepared.keyIndex!==expectedIndex)throw Error('判官密钥序号已变化，请重新生成或导入对应备份。');
    const chain=tchain.createTapeSendChains().get(196);
    const tx=chain.encodePublishKey({circuits:live.endpoint.circuits,tokenId:live.endpoint.tokenId,keyIndex:prepared.keyIndex,publicKey:prepared.publicKey,chains:1n<<2n});
    const hash=await provider.request({method:'eth_sendTransaction',params:[{from:wallet,to:tx.to,data:tx.data}]});
    await Chain168.waitReceipt(provider,hash);
    return hash;
  }
  async function enableJudgeXLayer(provider,wallet){
    if((await Chain168.authorized(provider))!==wallet.toLowerCase())throw Error('钱包地址已变化，请重新核验。');
    await Chain168.assertProcessor(provider);
    const {ts,tchain}=await load();
    const live=await ts.resolveEndpoint('1.2.168');
    if(!live.endpoint?.opened||live.endpoint.holder?.toLowerCase()!==wallet.toLowerCase()||!live.endpoint.key.usable)throw Error('判官信箱或公钥尚不可用。');
    const bits=BigInt(live.endpoint.key.chainsBits);
    if((bits&(1n<<2n))!==0n)return null;
    const tx=tchain.createTapeSendChains().get(196).encodePublishKey({circuits:live.endpoint.circuits,tokenId:live.endpoint.tokenId,keyIndex:live.endpoint.key.keyIndex,publicKey:live.endpoint.key.key,chains:bits|(1n<<2n)});
    const hash=await provider.request({method:'eth_sendTransaction',params:[{from:wallet,to:tx.to,data:tx.data}]});
    await Chain168.waitReceipt(provider,hash);
    return hash;
  }
  async function readJudgeInbox(provider,wallet,backup,passphrase,limit=12){
    if((await Chain168.authorized(provider))!==wallet.toLowerCase())throw Error('钱包地址已变化，请重新核验。');
    await Chain168.assertProcessor(provider);
    const state=await judgeReadiness();
    if(!state.judge.opened||state.judge.holder?.toLowerCase()!==wallet.toLowerCase())throw Error('当前钱包不是已开通信箱的判官持有人。');
    const verified=await verifyJudgeBackup(backup,passphrase,state,wallet);
    const {mod,tchain}=await load();
    const {decryptJudgeKey}=await import('./tools/judge-key-crypto.mjs');
    const secret=await decryptJudgeKey(verified.backup,passphrase);
    try{
      const chain=tchain.createTapeSendChains().get(196);
      const page=await chain.inbox(state.judgeEndpoint.endpoint,{limit});
      const items=await Promise.all(page.items.map(async entry=>{
        try{
          const message=await chain.fetchMessage(entry);
          const opened=mod.openPayload({payload:message.payload,secretKey:secret,to:entry.to,from:entry.fromEndpoint,hub,ref:message.ref});
          const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(opened.content));
          if(data?.v!==1||data.kind!=='message'||typeof data.body!=='string')throw Error('消息格式不属于 168 承诺。');
          return {id:entry.id,from:entry.fromEndpoint,ref:message.ref,body:data.body,scv:data.scv||null,timestamp:entry.timestamp,txHint:message.txHint};
        }catch(error){return {id:entry.id,from:entry.fromEndpoint,error:error.message};}
      }));
      return {items,hasMore:page.next!==null};
    }finally{secret.fill(0);}
  }
  async function send(provider,wallet,prepared){
    if((await Chain168.authorized(provider))!==wallet.toLowerCase())throw Error('钱包地址已变化，请重新核验。');
    await Chain168.assertProcessor(provider);
    if(prepared.tx.to.toLowerCase()!==hub)throw Error('收件合约地址不正确。');
    // Reveals carry no `open`; an ageing commitment must not be sent after review.
    if(prepared.open!==undefined && prepared.open*1000<=Date.now()+CommitmentTime.minimumMinutes*60000)throw Error('开舱时间已太近，请修改时间并下载新的揭示文件后再封存。');
    const hash=await provider.request({method:'eth_sendTransaction',params:[{from:wallet,to:prepared.tx.to,data:prepared.tx.data}]});
    return hash;
  }
  async function verifyReceipt(provider,hash,prepared){
    const {mod,tchain}=await load();
    const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[hash]});
    if(!receipt)return {status:'pending',hash};
    if(BigInt(receipt.status)!==1n)return {status:'failed',hash};
    const chain=tchain.createTapeSendChains().get(196);
    // Re-preparing a reveal changes its envelope timestamp, but not its signed intent.
    // Permit only that timestamp difference; all other bytes must still match.
    const matchesPayload=payload=>{
      const expected=prepared.payload.toLowerCase();
      if(mod.bytesToHex(payload).toLowerCase()===expected)return true;
      if(!prepared.ref.toLowerCase().startsWith('0x5343563102'))return false;
      try{
        const actual=mod.parsePayload(payload),wanted=mod.parsePayload(mod.hexToBytes(expected));
        if(actual.kind!=='public'||wanted.kind!=='public')return false;
        const a=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(actual.content));
        const w=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(wanted.content));
        if(a.scv?.type!=='reveal'||w.scv?.type!=='reveal'||!Number.isSafeInteger(a.ts)||a.ts<0)return false;
        w.ts=a.ts;
        return mod.bytesToHex(mod.encodePublic(new TextEncoder().encode(JSON.stringify(w)))).toLowerCase()===mod.bytesToHex(payload).toLowerCase();
      }catch{return false;}
    };
    const found=(receipt.logs||[]).map(log=>{try{return chain.decodeSentLog(log);}catch{return null;}}).find(log=>log&&log.to===prepared.to.toLowerCase()&&log.from===prepared.from.toLowerCase()&&log.ref===prepared.ref.toLowerCase()&&matchesPayload(log.payload));
    if(!found)return {status:'unverified',hash};
    let final=false,commitmentId=null;
    try{
      const safe=await chain.finalizedBlock();
      if(safe!==null&&BigInt(receipt.blockNumber)<=safe){
        const page=await chain.inbox(prepared.to,{before:found.inboxIndex+1n,limit:1,block:`0x${safe.toString(16)}`});
        const entry=page.items.find(x=>BigInt(x.index)===found.inboxIndex&&x.from===prepared.from.toLowerCase()&&BigInt(x.blockNumber)<=safe);
        if(entry){
          const checked=await chain.fetchMessage(entry);
          final=checked.ref===prepared.ref.toLowerCase()&&mod.bytesToHex(checked.payload).toLowerCase()===mod.bytesToHex(found.payload).toLowerCase();
          if(final)commitmentId=entry.id;
        }
      }
    }catch{}
    return {status:final?'final':'confirming',hash,inboxIndex:String(found.inboxIndex),blockNumber:receipt.blockNumber,commitmentId};
  }
  async function latestCommitments(limit=12){
    const {mod,tchain}=await load();
    const chain=tchain.createTapeSendChains().get(196);
    const safe=await chain.finalizedBlock();
    if(safe===null)throw Error('暂时无法取得 X Layer 安全区块。');
    const block=`0x${safe.toString(16)}`;
    const [header]=await chain.rpc.many([{method:'eth_getBlockByNumber',params:[block,false],
      normalize:value=>({hash:String(value.hash).toLowerCase(),timestamp:BigInt(value.timestamp).toString()})}],{all:true});
    if(!header.ok||!header.raw)throw Error('无法从多个节点核验安全区块时间。');
    const safeBlockTime=Number(header.raw.timestamp);
    const judge=await chain.resolveEndpoint('1.2.168',{block,skipFreshness:true});
    if(judge.status!=='ok'||judge.chainId!==196||judge.circuits.toLowerCase()!==Chain168.processor)throw Error('判官身份未能从 X Layer 安全区块独立核验。');
    const [inbox,outbox]=await Promise.all([
      chain.inbox(judge.endpoint,{limit:50,block}),
      chain.outbox(judge.container,{limit:50,block}),
    ]);
    const {parseRef}=await import('./app/protocol/scv1-ref.mjs');
    const {commitmentEntry,linkedRecord,strictContent}=await import('./judge-worker/src/protocol.mjs');
    const received=await Promise.all(inbox.items.map(async entry=>({entry,message:await chain.fetchMessage(entry)})));
    const sent=await Promise.all(outbox.items.map(async entry=>({entry,message:await chain.fetchMessage(entry)})));
    const cases=new Map(),byInbox=new Map();
    for(const {entry,message} of received){
      const ref=parseRef(message.ref);
      if(ref?.type!=='commitment'||ref.malformed)continue;
      const author=await chain.resolveEndpoint(entry.from,{block:`0x${BigInt(entry.blockNumber).toString(16)}`,skipFreshness:true});
      if(author.status!=='ok'||author.chainId!==196||author.circuits.toLowerCase()!==Chain168.processor||
        BigInt(author.tokenId)===1n||author.container.toLowerCase()!==entry.from.toLowerCase())continue;
      let commitment;
      try{commitment=commitmentEntry(entry,message);}catch{continue;}
      if(commitment.openTime<=entry.timestamp)continue;
      const row={id:commitment.id,inbox_index:Number(entry.index),author_endpoint:commitment.authorEndpoint,
        author_container:commitment.authorContainer,kind:commitment.kind,open_time:commitment.openTime,
        commitment_ref:commitment.ref,payload_hex:commitment.payloadHex};
      const record={id:commitment.id,from:entry.from,authorEndpoint:entry.fromEndpoint,
        residentId:String(author.tokenId),
        kind:commitment.kind,openTime:commitment.openTime,timestamp:entry.timestamp,
        blockNumber:entry.blockNumber,txHint:message.txHint,status:'sealed',body:null,
        receipt:{hash:message.txHint,ref:commitment.ref,payload:commitment.payloadHex,
          from:entry.from,to:judge.endpoint,open:commitment.openTime,inboxIndex:String(entry.index),
          commitmentId:commitment.id,residentId:String(author.tokenId),status:'final',
          kind:commitment.kind==='promise'?'goal':'event',
          date:new Date(commitment.openTime*1000+8*3600000).toISOString().slice(0,10),
          time:new Date(commitment.openTime*1000+8*3600000).toISOString().slice(11,16)},
        condition:null,claim:null,revealId:null,verdictId:null,outcome:null};
      cases.set(commitment.id,{row,record});byInbox.set(Number(entry.index),commitment.id);
    }
    for(const {entry,message} of [...received,...sent]){
      const ref=parseRef(message.ref);
      if(ref?.type!=='reveal'&&ref?.type!=='verdict')continue;
      try{
        const parsed=mod.parsePayload(message.payload);
        if(parsed.kind!=='public')continue;
        const content=strictContent(parsed.content);
        const pointer=content.scv?.commitment;
        if(pointer?.chainId!==196||pointer.to?.toLowerCase()!==judge.endpoint.toLowerCase()||
          !Number.isSafeInteger(pointer.inboxIndex))continue;
        const found=cases.get(byInbox.get(pointer.inboxIndex));
        if(!found)continue;
        const linked=linkedRecord(entry,message,ref.type,found.row,judge.endpoint);
        const record=found.record;
        if(ref.type==='reveal'){
          if(entry.to?.toLowerCase()!==judge.endpoint.toLowerCase()&&entry.to?.toLowerCase()!==found.row.author_endpoint)continue;
          record.revealId=entry.id;
          record.body=linked.body;record.condition=linked.condition;record.claim=linked.claim;
        }else if(entry.fromEndpoint?.toLowerCase()===judge.endpoint.toLowerCase()&&
                 entry.to?.toLowerCase()===found.row.author_endpoint){
          record.verdictId=entry.id;record.outcome=linked.outcome;
          record.reason=linked.reason;record.sources=linked.sources;
          if(linked.reveal){record.revealId=entry.id;record.body=linked.reveal.body;
            record.condition=linked.reveal.condition;record.claim=linked.reveal.claim;}
        }
      }catch{/* Invalid linked messages do not alter the public case state. */}
    }
    const items=[...cases.values()].map(({record})=>{
      record.status=record.verdictId&&record.revealId?'judged':record.revealId?'revealed':
        safeBlockTime>=record.openTime+604800?'unrevealed':safeBlockTime>=record.openTime?'due':'sealed';
      return record;
    }).sort((a,b)=>b.blockNumber-a.blockNumber).slice(0,limit);
    return {items,hasMore:inbox.next!==null||outbox.next!==null||cases.size>limit,safeBlock:Number(safe),safeBlockTime};
  }
  async function recoverReceipt(pointer){
    if(!/^0x[0-9a-f]{64}$/i.test(pointer||''))throw Error('承诺 ID 或交易哈希格式不正确。');
    const result=await latestCommitments(50);
    const record=result.items.find(r=>r.id.toLowerCase()===pointer.toLowerCase()||r.txHint?.toLowerCase()===pointer.toLowerCase());
    if(!record)throw Error('最近 50 条链上消息中未找到这笔封存，请检查链接或交易哈希。');
    if(!/^0x[0-9a-f]{64}$/i.test(record.receipt?.hash||''))throw Error('链上封存已找到，但暂时无法核验交易哈希。');
    if(record.revealId)throw Error('这条承诺已经公开揭示，请返回公开记录查看原文。');
    return record.receipt;
  }
  async function prepareReveal(item,kit,wallet){
    if(item.status!=='final'||!item.commitmentId||!/^\d+$/.test(String(item.inboxIndex)))throw Error('必须先等原始封存进入 X Layer 安全区块。');
    if(Math.floor(Date.now()/1000)<Number(item.open))throw Error('尚未到用户设定的开舱时间。');
    if(kit?.format!=='168-scv1-reveal-kit-v1'||kit.chainId!==196||kit.hub?.toLowerCase()!==hub||
      kit.ref?.toLowerCase()!==item.ref?.toLowerCase()||kit.payload?.toLowerCase()!==item.payload?.toLowerCase()||
      kit.from?.toLowerCase()!==item.from?.toLowerCase()||kit.to?.toLowerCase()!==item.to?.toLowerCase()||
      Number(kit.open)!==Number(item.open)||!/^0x[0-9a-fA-F]{64}$/.test(kit.key||''))throw Error('揭示文件与这笔链上封存不匹配。');
    const {mod,tchain}=await load();
    const {createRevealMessage}=await import('./app/protocol/scv1-reveal.mjs');
    const chain=tchain.createTapeSendChains().get(196);
    const safe=await chain.finalizedBlock();
    if(safe===null)throw Error('X Layer 安全区块暂不可核验。');
    const block=`0x${safe.toString(16)}`;
    const [judge,resident]=await Promise.all([
      chain.resolveEndpoint('1.2.168',{block,skipFreshness:true}),
      chain.resolveEndpoint(kit.identity,{block,skipFreshness:true})
    ]);
    if(judge.status!=='ok'||resident.status!=='ok'||judge.endpoint.toLowerCase()!==item.to.toLowerCase()||
      resident.container.toLowerCase()!==item.from.toLowerCase()||resident.circuits.toLowerCase()!==Chain168.processor||
      resident.holder?.toLowerCase()!==wallet.toLowerCase())throw Error('当前钱包不再持有原封存的 168 居民电路。');
    const page=await chain.inbox(judge.endpoint,{before:BigInt(item.inboxIndex)+1n,limit:1,block});
    const entry=page.items.find(x=>String(x.index)===String(item.inboxIndex)&&x.id.toLowerCase()===item.commitmentId.toLowerCase()&&x.from.toLowerCase()===item.from.toLowerCase());
    if(!entry)throw Error('安全区块中没有找到原始承诺。');
    const original=await chain.fetchMessage(entry);
    if(original.ref!==item.ref.toLowerCase()||mod.bytesToHex(original.payload).toLowerCase()!==item.payload.toLowerCase())throw Error('原始链上密文与揭示文件不一致。');
    const plain=mod.openWithContentKey({payload:original.payload,key:kit.key,to:judge.endpoint,from:resident.endpoint,hub,ref:original.ref});
    mod.decodeContent(plain);
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
    if(data.scv?.v!==1||data.scv.type!=='commitment'||data.scv.open!==Number(item.open))throw Error('解密内容与承诺时间不一致。');
    const {ref,payload}=createRevealMessage({commitmentId:item.commitmentId,inboxIndex:Number(item.inboxIndex),to:judge.endpoint,key:kit.key.toLowerCase()});
    const tx=chain.encodeSend({circuits:resident.circuits,tokenId:resident.tokenId,to:judge.endpoint,ref,payload});
    return {tx,ref,payload:mod.bytesToHex(payload),from:resident.container,to:judge.endpoint,commitmentId:item.commitmentId};
  }
  return {judgeReadiness,readiness,priceRule,prepare,prepareReveal,gasQuote,downloadKey,createJudgeBackup,verifyJudgeBackup,downloadJudgeBackup,publishJudgeKey,enableJudgeXLayer,readJudgeInbox,send,verifyReceipt,latestCommitments,recoverReceipt,hub};
})();

const $=s=>document.querySelector(s),V=$('#view'),D=FlowModel.day,DPR=Math.min(devicePixelRatio||1,2);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY=location.search.includes('test=1')?'168-flow-v3-test':'168-flow-v3';
let saved;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
// Only on-chain identities and transaction receipts belong in the public app.
if(saved?.version===3){
 saved.records=[];saved.residents=(saved.residents||[]).filter(p=>p.chain===true);
 if(!saved.residents.some(p=>p.id===saved.active))saved.active=null;
 delete saved.demoRecords;
}
const emptyLive={version:3,residents:[],records:[],active:null,draft:FlowModel.draft(),chainPending:[]};
const store=new FlowModel.Store(saved?.version===3&&Array.isArray(saved.residents)&&Array.isArray(saved.records)?saved:emptyLive);
let draft=FlowModel.normalise(store.data.draft),wizardStep=1,returnFocus=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(store.data));}catch{$('#storage-note').textContent='浏览器无法保存，本次记录仅在当前页面有效。';}}
function keepDraft(){store.data.draft={...draft};save();}
const person=id=>store.residents.find(p=>p.id===id),label=r=>FlowModel.labels[r.status];
const visible=r=>r.visibility==='public'||['revealed','provisional','disputed','review','judged'].includes(r.status);
const recordText=r=>visible(r)?r.text:'这句话还在封存中。';
const backLink=()=>'';
function heading(title,sub){return `<div class="head"><div><div class="eyebrow">168 · 一路发</div><h1>${title}</h1></div><p class="flow-muted">${sub}</p></div>`;}
function card(r){return `<a class="flow-record" href="#/record/${r.id}"><div><span class="entry-state">${label(r)}</span><span class="flow-muted">${FlowModel.names[r.kind]} · ${esc(person(r.owner)?.name)}</span></div><h3>${esc(recordText(r))}</h3><p>${esc(r.date)} · ${r.kind==='goal'?'守约记录':r.stake?'参与判断计分':'不计判断分'}<span>查看记录 ↗</span></p></a>`;}
function home(){V.innerHTML=`<div class="ui"><div class="mid"><div class="risen">${store.records.slice(-3).map(r=>`<a class="cap" href="#/record/${r.id}"><div class="no">${FlowModel.names[r.kind]} · ${esc(person(r.owner)?.address)}</div><div class="t">${esc(recordText(r))}</div><div class="b"><span><i class="dot g"></i>${label(r)}</span><span>${r.date.slice(5)}</span></div></a>`).join('')}</div><div class="line">封了，<em>就改不了了。</em></div><div class="why">把说过的话留下来。让信用，从可查的记录里长出来。</div><form id="start-form" class="flow-start"><div class="flow-types" role="group" aria-label="内容类型">${Object.entries(FlowModel.names).map(([k,n])=>`<button type="button" data-kind="${k}" aria-pressed="${draft.kind===k}">${n}</button>`).join('')}</div><div class="bar"><input aria-label="写下你的承诺" id="home-text" maxlength="1000" placeholder="写下一句，愿意交给时间检验的话" value="${esc(draft.text)}"><button class="go on" type="submit">开始封存 ↗</button></div><div class="meta"><label class="when">约定日 <input type="date" aria-label="约定日期" id="home-date" value="${draft.date}"></label><label class="when">开舱时间 <input type="time" aria-label="开舱时间（北京时间）" id="home-time" value="${draft.time}"></label><span>${store.active?esc(store.active.name)+' · '+store.active.address:'人和智能体，从同一个入口开始'}</span></div></form><p class="home-small">写下承诺 → 判官收录 → 到期揭示 → 留下履历</p></div><div class="bottom"><span>本浏览器提交的交易 · <b>${(store.data.chainPending||[]).length}</b> 笔</span><a href="#/ranking">谁的话，经得起时间 ↗</a></div></div>`;
 $('#home-text').oninput=e=>{draft.text=e.target.value;keepDraft();};$('#home-date').onchange=e=>{draft.date=e.target.value;keepDraft();};$('#home-time').onchange=e=>{draft.time=e.target.value;keepDraft();};V.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{draft=FlowModel.normalise({...draft,kind:b.dataset.kind});keepDraft();home();});$('#start-form').onsubmit=e=>{e.preventDefault();openWizard(1);};}
function openWizard(step=1){wizardStep=step;returnFocus=document.activeElement;drawWizard();if(!$('#flow-dialog').open)$('#flow-dialog').showModal();}
function closeWizard(){$('#flow-dialog').close();returnFocus?.focus();}
let chainPreflight=null,chainPrepared=null,chainKeyDownloaded=false,judgeKeyBackup=null;
let chainPreparationError='',preflightRevision=0;
function wizardFeedback(message,fixTime=false){
 const el=$('#wizard-error');if(!el)return;
 el.textContent=message;
 if(fixTime){
  const button=document.createElement('button');button.type='button';button.className='btn';
  button.textContent='设为建议开舱时间，并重新核对';
  button.onclick=()=>{if(wizardStep===1)readDraft();draft={...draft,...CommitmentTime.suggest(Date.now(),draft.stake?120:20)};keepDraft();wizardStep=1;drawWizard();};
  el.append(document.createElement('br'),button);
 }
}
function updateSealButton(){
 const submit=$('#wizard-form button[type="submit"]');if(!submit||wizardStep!==3)return;
 submit.disabled=!chainPrepared||!chainKeyDownloaded;
 submit.textContent=chainPreparationError?'请先修改开舱时间或完成准备':!chainPreflight?'正在核验链上条件…':!chainPreflight.ready?'请先完成信箱准备':!chainPrepared?'封存尚未准备完成':!chainKeyDownloaded?'请先下载揭示密钥':'确认链上封存';
}
async function loadChainPreflight(judgeOnly=false){
 const box=$('#chain-preflight');if(!box||(!chainSession.activeId&&!judgeOnly))return;
 const revision=++preflightRevision;
 const refresh=()=>loadChainPreflight(judgeOnly);
 chainPreflight=null;chainPrepared=null;chainKeyDownloaded=false;chainPreparationError='';
 if(!judgeOnly){wizardFeedback('正在核验信箱、公钥和封存时间，请稍候…');updateSealButton();}
 box.innerHTML='<h3>正在核验链上条件</h3><p>读取居民信箱、判官公钥与 X Layer 状态…</p>';
 try{
  const state=judgeOnly?await Tape168.judgeReadiness():await Tape168.readiness(chainSession.activeId);
  if(!box.isConnected||revision!==preflightRevision)return;
  chainPreflight=state;
  const id=chainSession.activeId,p=chainSession.provider,wallet=chainSession.address;
  const ownsJudge=state.judge.holder?.toLowerCase()===wallet;
  if(judgeKeyBackup?.backup.holder!==wallet)judgeKeyBackup=null;
  if(state.judge.key&&store.data.judgePublishHash){store.data.judgePublishHash=null;save();}
  const residentQuote=!judgeOnly&&!state.resident.opened?await Chain168.mailboxQuote(p,wallet,id):null;
  const judgeQuote=ownsJudge&&!state.judge.opened?await Chain168.mailboxQuote(p,wallet,1):null;
  const lines=[...(judgeOnly?[]:[`<p>居民 ${esc(id+'.2.168')} 信箱 <b>${state.resident.opened?'已开通':residentQuote?.opened?'交易已确认，等待安全区块':'尚未开通'}</b></p>`]),`<p>判官 1.2.168 信箱 <b>${state.judge.opened?'已开通':judgeQuote?.opened?'交易已确认，等待安全区块':'尚未开通'}</b></p>`,`<p>判官收信公钥 <b>${state.judge.key?'已发布':'尚未发布'}</b></p>`];
  if(judgeQuote&&!judgeQuote.opened)lines.push(`<p>TapeOut 官方容器开通费 · 判官信箱 <b>${Chain168.fmt(judgeQuote.fee)} OKB</b></p>`);
  if(residentQuote&&!residentQuote.opened)lines.push(`<p>TapeOut 官方容器开通费 · 居民信箱 <b>${Chain168.fmt(residentQuote.fee)} OKB</b></p>`);
  if((judgeQuote&&!judgeQuote.opened)||(residentQuote&&!residentQuote.opened))lines.push(`<small>上述开通费直接付给 TapeOut 在 X Layer 的容器开通合约；另需 X Layer 网络费。168 页面不在这笔交易中加收费用。<a href="https://www.oklink.com/xlayer/address/${Chain168.opener}" target="_blank" rel="noopener">查看收款合约 ↗</a> 最终金额以钱包确认页为准。</small>`);
  let actions='',endorsementPrice=null;
  if(judgeQuote&&!judgeQuote.opened)actions+='<button type="button" class="btn" id="open-judge-mailbox">开通判官信箱</button>';
  if(residentQuote&&!residentQuote.opened)actions+='<button type="button" class="btn" id="open-resident-mailbox">开通居民信箱</button>';
  if((judgeQuote?.opened&&!state.judge.opened)||(residentQuote?.opened&&!state.resident.opened))actions+='<button type="button" class="btn" id="retry-safe-block">重新核验安全区块</button>';
  let keySetup='';
  if(!state.judge.key&&ownsJudge&&state.judge.opened){
   if(store.data.judgePublishHash){
    keySetup=`<p>公钥发布交易已确认，等待安全区块核验。<a href="https://www.oklink.com/xlayer/tx/${esc(store.data.judgePublishHash)}" target="_blank" rel="noopener">查看交易 ↗</a></p><button type="button" class="btn" id="retry-judge-key">重新检查公钥</button>`;
   }else{
    keySetup=`<div class="judge-key-setup"><h4>在 168 中设置判官收信钥匙</h4><p>本机生成独立的 X25519 密钥，只把公钥发布到 X Layer。私钥先用你设置的密码加密为备份文件；文件与密码都不会上传。它不是官方 TapeSend 钱包签名派生的钥匙，官方客户端无法用钱包签名恢复，丢失备份或密码会导致判官无法阅读旧密文。</p>${judgeKeyBackup?`<p>加密备份已准备 · 公钥 <code>${esc(judgeKeyBackup.publicKey)}</code></p><label class="flow-check"><input type="checkbox" id="judge-backup-confirm"><span>我已保存加密备份文件，并记住备份密码。</span></label><div class="flow-actions"><button type="button" class="btn" id="judge-download-again">再次下载备份</button><button type="button" class="btn hi2" id="judge-publish-key">确认发布公钥 · 仅付 X Layer 网络费</button></div>`:`<label>设置备份密码（至少 12 个字符）<input type="password" id="judge-pass" autocomplete="new-password"></label><label>再次输入备份密码<input type="password" id="judge-pass-confirm" autocomplete="new-password"></label><button type="button" class="btn hi2" id="judge-generate-key">生成并下载加密备份</button><div class="flow-divider">已有本次判官密钥备份</div><label>选择加密备份文件<input type="file" id="judge-backup-file" accept=".json,application/json"></label><label>备份密码<input type="password" id="judge-import-pass" autocomplete="off"></label><button type="button" class="btn" id="judge-import-key">导入备份后继续发布</button>`}</div>`;
   }
  }else if(!state.judge.key){
   lines.push(ownsJudge?'<small>判官信箱开通并进入安全区块后，可以在这里生成加密备份并发布收信公钥。</small>':'<small>当前钱包不是 1.2.168 的持有人，不能代判官开通信箱或发布公钥。</small>');
  }
  const judgeXLayer=state.judge.key&&((BigInt(state.judgeEndpoint.key.chainsBits)>>2n)&1n)===0n;
  if(judgeXLayer){lines.push('<small>判官已有公钥，但尚未声明接收 X Layer 消息。</small>');if(ownsJudge)actions+='<button type="button" class="btn" id="enable-judge-xlayer">启用判官 X Layer 收信</button>';}
  if(judgeOnly&&state.judge.key&&ownsJudge){
   keySetup+=`<div class="judge-key-setup"><h4>读取判官收件箱</h4><p>用本机加密备份解开最近 12 封链上来信；文件和密码只在当前浏览器内使用，不上传。判官可在约定时间前读取，请勿提前公开原文。</p><label>判官加密备份文件<input type="file" id="judge-read-file" accept=".json,application/json"></label><label>备份密码<input type="password" id="judge-read-pass" autocomplete="off"></label><button type="button" class="btn" id="judge-read-inbox">读取链上来信</button><div id="judge-inbox-results" class="flow-grid" aria-live="polite"></div></div>`;
  }
  if(state.ready&&!judgeOnly&&draft.stake){
    const check=await fetch('https://168-judge.joezuooo.workers.dev/api/scoring/rules',{signal:AbortSignal.timeout(10000),cache:'no-store'});
    const scoring=check.ok?await check.json():null;
    const enabled=scoring?.enabled&&scoring?.ready;
    if(enabled&&draft.kind==='price'&&CommitmentTime.assert(draft)-Date.now()/1000>=3660&&CommitmentTime.assert(draft)-Date.now()/1000<=604800){
      if(!draft.endorsement){
        endorsementPrice=await Chain168.quote(p,wallet);
        lines.push(`<p>本次背书合约费用：${Chain168.fmt(endorsementPrice.total)} OKB，另需钱包显示的网络费。流片后不能退款；未及时收录也不退回。</p>`);
        actions+='<label class="flow-check"><input type="checkbox" id="endorsement-consent">我确认额外创建一枚背书电路及其费用</label><button type="button" class="btn" id="create-endorsement">创建或恢复背书电路</button>';
      }else lines.push(`<p>已选背书电路 ${esc(draft.endorsement.slot.circuitId)}.2.168</p>`);
    }else lines.push('<p>计分历史正在准备或期限不在 1 小时至 7 天。数据就绪后再创建背书；请为钱包确认留出时间。</p>');
  }
  if(state.ready&&!judgeOnly){
   try{const prepared=await Tape168.prepare(draft,state,wallet);const quote=await Tape168.gasQuote(p,wallet,prepared);if(!box.isConnected||revision!==preflightRevision)return;chainPrepared=prepared;lines.push(`<p>TapeSend 协议消息费 <b>0 OKB</b></p><p>X Layer 网络费（预估）<b>约 ${Chain168.fmt(quote.estimated)} OKB</b></p><small>网络费根据当前 gas 估算，钱包确认页显示最终费用；168 页面不加收服务费。${draft.stake?'背书流片另付费用，只有及时取得计分回执才参与计分。':'本次普通封存不计分。'}揭示密钥必须先下载并保存，丢失后将无法按方案公开原话。</small>`);actions+='<button type="button" class="btn" id="download-reveal-key">下载揭示密钥</button>';}catch(err){chainPreparationError=err.message;lines.push(`<p class="flow-error">${esc(err.message)}</p>`);}
  }
  if(!box.isConnected||revision!==preflightRevision)return;
  box.innerHTML=`<h3>${judgeOnly?'判官链上开通':'链上封存准备'}</h3>`+lines.join('')+(actions?`<div class="flow-actions">${actions}</div>`:'')+keySetup+'<p id="chain-preflight-error" class="flow-error" role="alert"></p>';
  if($('#create-endorsement'))$('#create-endorsement').onclick=async e=>{
    if(!$('#endorsement-consent').checked){$('#chain-preflight-error').textContent='请先确认额外背书费用。';return;}
    const button=e.currentTarget;button.disabled=true;
    try{
      const circuit=await Chain168.create(p,wallet,endorsementPrice,msg=>{$('#chain-preflight-error').textContent=msg;},draft.endorsementJournal||{},journal=>{draft.endorsementJournal={...journal};keepDraft();});
      draft.endorsement={wallet,residentId:String(id),slot:{chainId:196,processor:Chain168.processor,circuitId:circuit.id,tapeoutTx:circuit.txHash.toLowerCase()}};keepDraft();await refresh();
    }catch(error){button.disabled=false;$('#chain-preflight-error').textContent=error.message;}
  };
  const open=async(circuitId,fee,button)=>{button.disabled=true;const error=$('#chain-preflight-error');error.textContent='等待钱包确认与链上交易回执…';try{await Chain168.openMailbox(p,wallet,circuitId,fee,msg=>{if(error)error.textContent=msg;});await refresh();}catch(err){button.disabled=false;if(error)error.textContent=err.message;}};
  if($('#open-judge-mailbox'))$('#open-judge-mailbox').onclick=e=>open(1,judgeQuote.fee,e.currentTarget);
  if($('#open-resident-mailbox'))$('#open-resident-mailbox').onclick=e=>open(id,residentQuote.fee,e.currentTarget);
  if($('#retry-safe-block'))$('#retry-safe-block').onclick=refresh;
  if($('#retry-judge-key'))$('#retry-judge-key').onclick=refresh;
  if($('#judge-generate-key'))$('#judge-generate-key').onclick=async e=>{const button=e.currentTarget,error=$('#chain-preflight-error');button.disabled=true;try{const pass=$('#judge-pass').value;if(pass!==$('#judge-pass-confirm').value)throw Error('两次输入的备份密码不一致。');judgeKeyBackup=await Tape168.createJudgeBackup(state,wallet,pass);Tape168.downloadJudgeBackup(judgeKeyBackup.backup);await refresh();}catch(err){error.textContent=err.message;button.disabled=false;}};
  if($('#judge-import-key'))$('#judge-import-key').onclick=async e=>{const button=e.currentTarget,error=$('#chain-preflight-error');button.disabled=true;try{const file=$('#judge-backup-file').files?.[0];if(!file||file.size>20000)throw Error('请选择有效的判官加密备份文件。');const backup=JSON.parse(await file.text());judgeKeyBackup=await Tape168.verifyJudgeBackup(backup,$('#judge-import-pass').value,state,wallet);await refresh();}catch(err){error.textContent=err.message;button.disabled=false;}};
  if($('#judge-download-again'))$('#judge-download-again').onclick=()=>Tape168.downloadJudgeBackup(judgeKeyBackup.backup);
  if($('#judge-publish-key'))$('#judge-publish-key').onclick=async e=>{const button=e.currentTarget,error=$('#chain-preflight-error');if(!$('#judge-backup-confirm').checked){error.textContent='请先确认加密备份文件和密码均已保存。';return;}button.disabled=true;error.textContent='等待钱包确认公钥发布交易…';try{const hash=await Tape168.publishJudgeKey(p,wallet,judgeKeyBackup);store.data.judgePublishHash=hash;save();judgeKeyBackup=null;await refresh();}catch(err){error.textContent=err.message;button.disabled=false;}};
  if($('#enable-judge-xlayer'))$('#enable-judge-xlayer').onclick=async e=>{const button=e.currentTarget,error=$('#chain-preflight-error');button.disabled=true;error.textContent='等待钱包确认 X Layer 收信设置…';try{await Tape168.enableJudgeXLayer(p,wallet);await refresh();}catch(err){error.textContent=err.message;button.disabled=false;}};
  if($('#judge-read-inbox'))$('#judge-read-inbox').onclick=async e=>{const button=e.currentTarget,error=$('#chain-preflight-error'),results=$('#judge-inbox-results');button.disabled=true;error.textContent='正在核验并读取判官来信…';try{const file=$('#judge-read-file').files?.[0];if(!file||file.size>20000)throw Error('请选择有效的判官加密备份文件。');const backup=JSON.parse(await file.text());const inbox=await Tape168.readJudgeInbox(p,wallet,backup,$('#judge-read-pass').value);results.innerHTML=inbox.items.length?inbox.items.map(item=>`<article class="flow-evidence"><small>${esc(item.id)} · ${esc(item.from)}</small>${item.error?`<p>${esc(item.error)}</p>`:`<p>${esc(item.body)}</p><small>${esc(new Date(item.timestamp*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))} · ${esc(item.ref)}</small>`}</article>`).join(''):'<p>判官信箱还没有来信。</p>';if(inbox.hasMore)results.insertAdjacentHTML('beforeend','<p>这里只显示最近 12 封；更早记录需接入分页。</p>');error.textContent='';}catch(err){error.textContent=err.message;}finally{button.disabled=false;$('#judge-read-pass').value='';}};
  if($('#download-reveal-key'))$('#download-reveal-key').onclick=()=>{Tape168.downloadKey(chainPrepared,id+'.2.168');chainKeyDownloaded=true;$('#download-reveal-key').textContent='已请求下载 · 请确认文件保存';wizardFeedback('请确认新的揭示文件已保存，并勾选上方确认，再点击封存。');updateSealButton();};
  if(!judgeOnly){wizardFeedback(chainPreparationError||(!state.ready?'请先完成上方信箱与公钥准备。':'封存已准备好。请先下载并保存本次揭示密钥，再确认封存。'),!!CommitmentTime.validate(draft));updateSealButton();}
 }catch(err){if(!box.isConnected||revision!==preflightRevision)return;chainPreparationError=err.message;box.innerHTML=`<h3>链上状态暂不可核验</h3><p class="flow-error">${esc(err.message)}</p><button type="button" class="btn" id="retry-preflight">重新检查</button>`;if($('#retry-preflight'))$('#retry-preflight').onclick=refresh;if(!judgeOnly){wizardFeedback('准备失败：'+err.message);updateSealButton();}}
}
function identityFields(){return `<div data-wallet-summary>${walletSummary()}</div><label>选择已有身份<select id="identity-select" aria-label="选择已有身份"><option value="">请选择</option>${store.residents.filter(p=>p.type!=='judge').map(p=>`<option value="${p.id}" ${store.active?.id===p.id?'selected':''}>${esc(p.name)} · ${p.address}${p.pending?' · 待落户':''}</option>`).join('')}</select></label><div class="flow-divider">或者，建立一个新身份</div><label>居民名称<input id="new-name" aria-label="居民名称" maxlength="24" placeholder="你希望怎样被记住"></label><label>身份类型<select id="new-type" aria-label="身份类型"><option value="human">人</option><option value="agent">智能体</option></select></label><p class="flow-hint">身份承载你的信箱与履历。首次落户才需要身份电路，之后的承诺继续使用同一身份。</p>`;}
function selectIdentity(){if($('#new-name').value.trim())store.createResident($('#new-name').value,$('#new-type').value);else store.select($('#identity-select').value);save();}
function drawWizard(){const dlg=$('#flow-dialog');dlg.innerHTML=`<div class="dialog-top"><span>封存之前 · ${wizardStep} / 3</span><button class="flow-close" aria-label="关闭封存窗口" type="button">×</button></div><h2>${['','先把约定说清楚','用哪个身份留下这句话','最后，认真看一遍'][wizardStep]}</h2><form id="wizard-form"><div class="wizard-fields">${wizardStep===1?`<div class="flow-kicker">${FlowModel.names[draft.kind]}</div><label>承诺原文<textarea id="w-text" maxlength="1000" required>${esc(draft.text)}</textarea></label><div class="flow-two"><label>约定日期<input id="w-date" type="date" value="${draft.date}" required></label><label>开舱时间 · 北京时间<input id="w-time" type="time" value="${draft.time}" required></label></div><p class="flow-hint">至少留出十五分钟完成准备与钱包确认。修改时间后须下载新的揭示文件。</p><button type="button" class="btn" id="suggest-open-time">设为建议开舱时间</button>${draft.kind==='price'?`<div class="flow-two"><label>标的<select id="w-asset"><option ${draft.asset==='BTC'?'selected':''}>BTC</option><option ${draft.asset==='ETH'?'selected':''}>ETH</option></select></label><label>方向<select id="w-operator"><option ${draft.operator==='高于'?'selected':''}>高于</option><option ${draft.operator==='低于'?'selected':''}>低于</option></select></label></div><label>目标价格（美元）<input id="w-target" type="number" min="0.000001" step="any" value="${esc(draft.target)}" required placeholder="例如 95000"></label><p class="flow-hint">${esc(Tape168.priceRule(draft).description)}</p>`:draft.kind==='letter'?'<p class="flow-hint">这封信只在到期后揭示，不裁决、不计分。本次演示采用到期公开读信；收信权限方案仍待确认。</p>':`<label>${draft.kind==='goal'?'怎样算兑现，拿什么证明？':'什么算发生，以什么为证？'}<textarea id="w-condition" required placeholder="写清可判断的条件与证据来源">${esc(draft.condition)}</textarea></label>${draft.kind==='event'?'<p class="flow-hint">请写明具体结果、截止时间和证据来源；只写“官方推文”不足以确定命中或未中。封存后无法修改条件。</p>':''}<p class="flow-hint">到期后公开揭示，保留原文与核验条件；裁决与计分正在接入。</p>`}${draft.kind!=='letter'?`<label>公开方式<select id="w-visibility"><option value="sealed" ${draft.visibility==='sealed'?'selected':''}>先密封，到期再揭示</option></select></label>`:''}${draft.kind==='price'?`<label class="flow-check"><input type="checkbox" id="w-stake" ${draft.stake?'checked':''}><span>申请判断计分：额外流片一枚背书电路<small>支持 1 小时至 7 天的 BTC/ETH 判断。仅及时取得链上计分回执才可计分；费用不可因未收录退回。p 使用 180 天历史频率，非真实概率。</small></span></label>`:''}`:wizardStep===2?identityFields():`<div class="flow-quote">${esc(draft.text)}</div><dl class="flow-facts"><dt>记录类型</dt><dd>${FlowModel.names[draft.kind]}</dd><dt>身份</dt><dd>${esc(store.active.name)} · ${store.active.address}</dd><dt>收件人</dt><dd>判官 · 1.2.168</dd><dt>开舱时间</dt><dd>${esc(draft.date)} ${esc(draft.time)} · 北京时间</dd><dt>核对条件</dt><dd>${esc(FlowModel.condition(draft))}</dd>${draft.kind==='price'?`<dt>取价约定</dt><dd>${esc(Tape168.priceRule(draft).version)}：${esc(Tape168.priceRule(draft).description)}</dd>`:''}<dt>公开方式</dt><dd>${draft.visibility==='sealed'?'到期揭示':'收录即公开，仍须到期才能裁决'}</dd><dt>计分方式</dt><dd>${draft.stake?'申请历史频率计分；须取得及时回执':'普通封存，不计判断分'}</dd></dl><div class="flow-cost" id="chain-preflight"><h3>正在核验链上条件</h3><p>查询居民信箱、判官公钥与 X Layer 费用…</p></div><label class="flow-check"><input type="checkbox" id="w-confirm" required><span>我已核对原文与开舱时间，并已保存揭示密钥文件；仅在钱包确认后支付 X Layer 网络费；168 不加收服务费。</span></label>`}</div><div id="wizard-error" class="flow-error wizard-feedback" role="status" aria-live="polite"></div><div class="flow-actions">${wizardStep>1?'<button type="button" id="wizard-back" class="btn">上一步</button>':'<button type="button" id="wizard-cancel" class="btn">保存草稿并关闭</button>'}<button type="submit" class="btn hi2">${wizardStep===3?'确认链上封存':'下一步'}</button></div><p class="flow-hint">链上密封承诺不可撤回。判官收信公钥与居民信箱准备好后，才会请求你的钱包交易。</p></form>`;
 dlg.querySelector('.flow-close').onclick=closeWizard;if($('#wizard-cancel'))$('#wizard-cancel').onclick=()=>{readDraft();closeWizard();};if($('#wizard-back'))$('#wizard-back').onclick=()=>{wizardStep--;drawWizard();};if(wizardStep===1)dlg.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input',readDraft));
 if($('#suggest-open-time'))$('#suggest-open-time').onclick=()=>{readDraft();draft={...draft,...CommitmentTime.suggest(Date.now(),draft.stake?120:20)};keepDraft();drawWizard();};
 $('#wizard-form').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
   if(wizardStep===1){readDraft();const err=FlowModel.validate(draft)||CommitmentTime.validate(draft);if(err)throw Error(err);}
   if(wizardStep===2)await selectIdentity();
   if(wizardStep<3){wizardStep++;drawWizard();return;}
   const timeError=CommitmentTime.validate(draft);if(timeError)throw Error(timeError);
   if(!chainPreflight?.ready)throw Error('链上信箱尚未准备好，请先完成页面提示的步骤。');
   if(!chainPrepared||!chainKeyDownloaded)throw Error(chainPreparationError||'请先下载并保存本次承诺的揭示密钥。');
   submit.textContent='正在核验居民身份…';wizardFeedback('正在重新核验钱包持有权，请稍候…');
   await verifyActiveCircuit();
   submit.textContent='正在核验判官信箱…';wizardFeedback('正在核验判官信箱与收信公钥，请稍候…');
   const live=await Tape168.readiness(chainSession.activeId);
   if(!live.ready)throw Error('链上信箱状态已变化，请重新核验。');
   if(live.judgeEndpoint.key.key.toLowerCase()!==chainPrepared.recipientKey.toLowerCase())throw Error('判官公钥已变化，请重新检查并下载新的揭示密钥。');
   if(!form.isConnected||!$('#flow-dialog').open)throw Error('封存窗口已关闭，请重新核对后再提交。');
   const prepared=chainPrepared,submission={...draft},owner=store.active.id;
   CommitmentTime.assert(submission);
   submit.textContent='等待钱包确认…';wizardFeedback('请在钱包中确认封存交易。未确认前不会发出交易；若弹窗被遮挡，请打开浏览器的钱包扩展。');
   const hash=await Tape168.send(chainSession.provider,chainSession.address,prepared);
   store.data.chainPending??=[];
   store.data.chainPending.push({hash,ref:prepared.ref,from:prepared.from,to:prepared.to,payload:prepared.payload,open:prepared.open,kind:submission.kind,date:submission.date,time:submission.time,owner,createdAt:new Date().toISOString(),status:'pending'});
   draft=FlowModel.draft();store.data.draft=draft;save();closeWizard();location.hash='#/chain/'+hash;
  }catch(err){
   if(!form.isConnected)return;
   wizardFeedback(err.code===4001?'你取消了钱包确认，尚未发出封存交易；可以重新确认。':err.message,!!CommitmentTime.validate(draft));
   if(wizardStep===3)updateSealButton();else{submit.disabled=false;submit.textContent='下一步';}
  }
 };

 if(wizardStep===3){$('#wizard-form button[type="submit"]').disabled=true;loadChainPreflight();}
}
function readDraft(){if(!$('#w-text'))return;draft=FlowModel.normalise({...draft,text:$('#w-text').value,date:$('#w-date').value,time:$('#w-time').value,asset:$('#w-asset')?.value||draft.asset,operator:$('#w-operator')?.value||draft.operator,target:$('#w-target')?.value||draft.target,condition:$('#w-condition')?.value||draft.condition,visibility:$('#w-visibility')?.value||'sealed',stake:$('#w-stake')?.checked||false});keepDraft();}
function identityOnly(){const dlg=$('#flow-dialog');returnFocus=document.activeElement;dlg.innerHTML=`<div class="dialog-top"><span>我的一路</span><button class="flow-close" aria-label="关闭身份窗口">×</button></div><h2>从一个身份开始</h2><form id="identity-form"><div class="wizard-fields">${identityFields()}</div><p id="wizard-error" class="flow-error" role="alert"></p><div class="flow-actions"><button class="btn hi2">进入我的履历</button></div></form>`;dlg.querySelector('.flow-close').onclick=closeWizard;$('#identity-form').onsubmit=e=>{e.preventDefault();try{selectIdentity();closeWizard();route();}catch(err){$('#wizard-error').textContent=err.message;}};dlg.showModal();}
function resident(id){return notFound();}
const archiveState={kind:'all',status:'all',q:''};
function archive(){V.innerHTML=`<div class="page">${heading('封存档案','说过的话，完成的、未完成的，都留在这里。')}<div class="flow-filter"><label>类型<select id="archive-kind"><option value="all">全部类型</option>${Object.entries(FlowModel.names).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label><label>状态<select id="archive-status"><option value="all">全部状态</option>${Object.entries(FlowModel.labels).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label><label>搜索<input id="archive-search" placeholder="公开原文 / 居民" value="${esc(archiveState.q)}"></label></div><div class="flow-grid" id="archive-list"></div></div>`;$('#archive-kind').value=archiveState.kind;$('#archive-status').value=archiveState.status;$('#archive-kind').onchange=e=>{archiveState.kind=e.target.value;paintArchive();};$('#archive-status').onchange=e=>{archiveState.status=e.target.value;paintArchive();};$('#archive-search').oninput=e=>{archiveState.q=e.target.value;paintArchive();};paintArchive();}
function paintArchive(){const rows=store.records.filter(r=>(archiveState.kind==='all'||r.kind===archiveState.kind)&&(archiveState.status==='all'||r.status===archiveState.status)&&`${recordText(r)} ${person(r.owner)?.name}`.toLowerCase().includes(archiveState.q.toLowerCase()));$('#archive-list').innerHTML=rows.length?[...rows].reverse().map(card).join(''):'<div class="flow-empty">没有符合条件的记录，试试其他筛选。</div>';}
function detail(id){return notFound();}
function judgePage(){V.innerHTML=`<div class="page">${heading('判官 · 1.2.168','负责收录与裁决，不参与预测排名。')}<div class="flow-grid"><section class="flow-evidence"><h2>先留下原话，再核对结果</h2><p>接收承诺 → 安全区块核验 → 到期揭示 → 核对证据 → 裁决入履历。</p><p>计分判断需在结果发生前固定基准概率。价格判断支持自动揭示与裁决。申请计分须创建独立背书，并在开舱前取得链上参数承诺；普通封存保留履历，不参与计分。</p></section><section class="flow-evidence"><h2>不同承诺，不同收尾</h2><p>价格判断：三源齐备取中位数；双源须为 OKX 与 Chainlink，价差不超过 2% 且结论一致；证据不足等待重试。</p><p>事件和目标由判官核对公开证据后人工裁决。社区评审和守约分属于后续功能。</p></section></div><details class="rank-rules"><summary>仍需确认的规则边界</summary><p>概率如何生成、争议最终裁决权、目标评审门槛、未揭示惩罚、补揭示规则、正式上榜门槛、身份转让后的历史归属。</p><p>未揭示保留展示。当前没有把这些尚未确认的规则写成正式产品承诺。</p></details><div class="resident-section"><h2>最近流转</h2><span>与档案、履历共用记录</span></div><div class="flow-grid">${store.records.length?store.records.slice(-6).reverse().map(card).join(''):'<p class="flow-empty">目前没有已裁决的链上记录。</p>'}</div></div>`;}
function about(){V.innerHTML=`<div class="page">${heading('记录 → 履历 → 信用','人和智能体，走同一条路。')}<div class="flow-prose"><h2>封了，就改不了了。</h2><p>168 把判断与承诺记录在 X Layer。先在 168 处理器创建居民电路，再向判官 1.2.168 发送密封承诺。到约定时间公开揭示，让说过的话留下可核验的历史。</p><h2>一份身份，一路履历</h2><p>居民电路、信箱、封存与公开揭示由链上记录验证。单条揭示密钥保存在你下载的文件中，判官也可通过收信密钥执行到期揭示；更换设备后需重新连接钱包，并保管好对应文件。</p><h2>费用说明</h2><p>创建居民电路、开通信箱与网络交易分别显示费用及收款合约。168 不在封存和揭示交易中加收服务费；最终费用以钱包确认页为准。</p><h2>裁决与计分</h2><p>当前可以封存、公开揭示和查看履历。价格判断到期自动揭示并裁决；背书计分按事前固定的历史概率计算。未裁决记录不显示命中结果，未背书记录不计判断分。共同评审和跨应用信用读取属于后续方向。</p><p><a href="https://x.com/spongemochi/status/2106070767901585584" target="_blank" rel="noopener">阅读项目原帖 ↗</a></p></div></div>`;}
function notFound(){V.innerHTML='<div class="page flow-empty">没有找到这条记录。<a href="#/all">返回档案 ↗</a></div>';}
function route(){const h=location.hash.slice(1)||'/';document.body.classList.toggle('home',h==='/');$('#peek').classList.remove('on');if($('#flow-dialog').open)closeWizard();document.querySelectorAll('.tnav a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+h));if(h==='/')home();else if(h==='/ranking')ranking();else if(h==='/all')archive();else if(h==='/me'){if(store.active)resident(store.active.id);else{V.innerHTML=`<div class="page">${heading('我的一路','先落户，再积累属于自己的履历。')}<div class="flow-empty"><p>一句话可能很轻，一路走来就有了分量。</p><button class="btn hi2" id="choose-identity">检查居民身份</button></div></div>`;$('#choose-identity').onclick=identityOnly;}}else if(h.startsWith('/resident/'))resident(h.slice(10));else if(h.startsWith('/record/'))detail(h.slice(8));else if(h==='/judge')judgePage();else if(h==='/about')about();else notFound();window.scrollTo(0,0);}
addEventListener('hashchange',route);

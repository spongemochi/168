// The original 168 profile's winding road, driven by the current flow records.
// Profile layout from the prototype; verified identity and pending transactions are separate from demo scores.
let residenceReturnAction=null;
function publicEvidenceLink(url){
  try{const parsed=new URL(url);return parsed.protocol==='https:'?`<a href="${esc(parsed.href)}" target="_blank" rel="noopener">核对来源 ↗</a>`:'来源链接不可用';}catch{return '来源链接不可用';}
}

function journeyMark(r){
  if(r.status==='unrevealed')return 'u';
  if(r.status==='judged')return r.hit||r.goalScore>0?'g':'b';
  return 'w';
}
function journeyRoad(records){
  const recent=[...records].sort((a,b)=>String(a.createdAt||a.created).localeCompare(String(b.createdAt||b.created))).slice(-24);
  if(!recent.length)return '<div class="journey-empty-road"><span>始</span><i></i><span>第一句话，还在未来</span></div>';
  const W=570,near=6,pad=46,gaps=recent.map((_,i)=>i>=recent.length-near?59:34);
  const H=Math.max(145,pad*2+gaps.slice(1).reduce((a,b)=>a+b,0));
  const cx=W*.43,amp=52;
  const xs=recent.map((_,i)=>cx+Math.sin(i*1.35)*amp+Math.cos(i*.7)*14);
  const ys=[];let y=H-pad;for(let i=0;i<recent.length;i++){ys.push(y);y-=gaps[i+1]||0;}
  let path=`M ${xs[0]} ${ys[0]}`;
  for(let i=0;i<recent.length-1;i++){
    const delta=gaps[i+1],next=i+1;
    path+=` C ${xs[i]} ${ys[i]-delta*.45}, ${xs[next]} ${ys[next]+delta*.45}, ${xs[next]} ${ys[next]}`;
  }
  const dots=recent.map((r,i)=>{
    const mark=journeyMark(r),right=xs[i]>=cx,far=i<recent.length-near;
    const fill=mark==='g'?'url(#journey-gold)':mark==='b'?'var(--panel)':'none';
    const stroke=mark==='g'?'var(--gold)':'var(--edge)';
    const status=r.chainStatus|| (mark==='g'?'兑现':mark==='b'?'未中':mark==='u'?'未揭示':label(r));
    const name=r.chainLabel||FlowModel.names[r.kind];
    const href=r.chain?'#/case/':'#/record/';
    return `<a href="${href}${encodeURIComponent(r.id)}" aria-label="${esc(name)}：${esc(status)}，查看记录"><g class="journey-step" transform="translate(${xs[i]},${ys[i]})"><title>${esc(name)} · ${esc(status)} · ${esc(r.date)}</title><circle class="journey-halo" r="22"/><circle r="${far?6:9}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${mark==='w'?'stroke-dasharray="3 3"':''}/>${mark==='g'?'<circle r="2.3" fill="#17150c"/>':''}<text x="${right?21:-21}" y="4" text-anchor="${right?'start':'end'}" class="lab">${esc(status)}</text></g></a>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="按时间排列的居民履历，可点击节点查看记录"><defs><linearGradient id="journey-gold"><stop stop-color="#f4d89a"/><stop offset="1" stop-color="#d8a93b"/></linearGradient><linearGradient id="journey-line" x1="0" x2="0" y1="1" y2="0"><stop stop-color="var(--edge)"/><stop offset="1" stop-color="var(--gold)"/></linearGradient></defs><path d="${path}" fill="none" stroke="var(--soft)" stroke-width="9" stroke-linecap="round"/><path d="${path}" fill="none" stroke="url(#journey-line)" stroke-width="1.6" stroke-linecap="round"/><text class="lab" x="${xs[0]}" y="${ys[0]+26}" text-anchor="middle">起</text><text class="lab" x="${xs.at(-1)}" y="${ys.at(-1)-20}" text-anchor="middle">今</text>${dots}</svg>`;
}

function journeyRow(r,index){
  const mark=journeyMark(r),status=label(r);
  return `<a class="row journey-row" href="#/record/${encodeURIComponent(r.id)}"><span class="id">${String(index+1).padStart(2,'0')}<br><small>记录</small></span><span class="txt">${esc(recordText(r))}<small>${esc(FlowModel.names[r.kind])} · ${esc(r.date)}</small></span><span class="st">${esc(status)}<br><small>${r.stake?'判断计分':r.kind==='goal'?'守约履历':'不计判断分'}</small></span><span class="seal"><span class="seal ${mark==='g'?'g':mark==='b'?'b':'w'}">${mark==='g'?'✓':mark==='b'?'×':'·'}</span></span></a>`;
}

resident=function(id){
  const p=person(id);if(!p||!p.chain)return notFound();if(p.type==='judge')return judgePage();
  const records=p.chain?[]:store.by(id),stats=FlowModel.stats(records);
  const completed=records.filter(r=>r.status==='judged').length;
  const waiting=records.filter(r=>!['judged','unrevealed'].includes(r.status)).length;
  const rate=stats.rate==null?'—':Math.round(stats.rate*100)+'%';
  V.innerHTML=`<div class="page resident-journey"><a class="back" href="#/ranking">← 一路发榜</a><div class="me"><div class="avatar">${esc([...p.name][0]||'◈')}</div><div class="who"><h2>${esc(p.name)}</h2><p>${esc(p.address)} · ${p.chain?'X Layer 居民电路':'居民电路'} · ${p.type==='agent'?'智能体':'人'}</p></div><div class="stats"><div class="stat"><b id="journey-completed">${p.chain?'…':completed}</b><span>已完成记录</span></div><div class="stat"><b id="journey-rate">${rate}</b><span>计分判断命中率</span></div><div class="stat"><b id="journey-waiting">${p.chain?'…':waiting}</b><span>还在路上</span></div></div></div><div class="journey-context"><span>从第一句话开始</span><span>每一个节点，都能回到原记录</span></div><div class="roadwrap">${journeyRoad(records)}</div><div class="roadnote">金色：已兑现　·　墨色：未中　·　空心：等待　·　未揭示保留在路上</div><div class="journey-scoreline">${p.chain?'真实链上记录已接入；判断分按提交时的钱包与已核验背书单独计算。':`<span>判断分 <b>${signed(stats.score)}</b> · ${stats.count} 条已计分判断</span><span>守约分 <b>${signed(stats.promise)}</b> · ${stats.goalCount} 个已评审目标</span>`}</div><div class="resident-section"><h2>这一路的全部记录</h2><span id="journey-count">${p.chain?'正在读取 X Layer 安全区块…':`${records.length} 条 · 包括未揭示`}</span></div><div class="rows" id="journey-rows">${p.chain?'<div class="flow-empty">正在核对链上履历…</div>':records.length?[...records].reverse().map((r,i)=>journeyRow(r,records.length-i-1)).join(''):'<div class="flow-empty">还没有留下记录。<a href="#/">写下第一句话 ↗</a></div>'}</div>${p.chain&&store.active?.id===p.id?'<button class="btn journey-switch" id="switch-identity">检查我的其他电路</button>':''}<p class="journey-disclaimer">${p.chain?'居民身份与封存记录从 X Layer 安全区块核验；尚未揭示的原话不会公开或计分。':'居民电路展示产品交互，实际发帖须核验钱包与居民电路。'}</p></div>`;
  if($('#switch-identity'))$('#switch-identity').onclick=()=>identityOnly();
  const chainItems=(store.data.chainPending||[]).filter(r=>r.owner===p.id&&r.status!=='final');
  if(chainItems.length){
    const anchor=V.querySelector('.journey-disclaimer');
    anchor?.insertAdjacentHTML('beforebegin',`<div class="resident-section"><h2>链上封存</h2><span>${chainItems.length} 笔真实交易</span></div><div class="rows">${[...chainItems].reverse().map(r=>`<a class="row journey-row" href="#/chain/${esc(r.hash)}"><span class="id">◈</span><span class="txt">${esc(FlowModel.names[r.kind])}<small>${esc(r.date)} ${esc(r.time)} · 北京时间</small></span><span class="st">${r.status==='final'?'链上安全区块已核验':'等待链上核验'}<small>查看交易 ↗</small></span></a>`).join('')}</div>`);
  }
  if(p.chain){
    const root=V.querySelector('.resident-journey');
    const states={sealed:'封存中',due:'到期待揭示',unrevealed:'宽限期已过 · 未揭示',revealed:'已公开揭示',judged:'已有判官裁决'};
    const displayed=new Map();
    const load=after=>publicRecords(50,after,String(p.tokenId)).then(({items,hasMore,next})=>{
      if(!root.isConnected)return;
      for(const item of items)if(item.residentId===String(p.tokenId))displayed.set(item.id,item);
      const mine=[...displayed.values()];
      const road=mine.map(item=>({id:item.id,chain:true,chainLabel:item.kind==='promise'?'目标承诺':'判断承诺',
        chainStatus:states[item.status],status:item.status==='judged'&&item.outcome!=='undecidable'?'judged':item.status==='unrevealed'?'unrevealed':'submitted',
        hit:item.outcome==='hit',kind:item.kind==='promise'?'goal':'event',date:new Date(item.timestamp*1000).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}),createdAt:item.timestamp}));
      root.querySelector('.roadwrap').innerHTML=journeyRoad(road);
      root.querySelector('#journey-completed').textContent=String(mine.filter(item=>item.status==='judged').length);
      root.querySelector('#journey-waiting').textContent=String(mine.filter(item=>item.status!=='judged'&&item.status!=='unrevealed').length);
      root.querySelector('#journey-count').textContent=`${mine.length} 条已核验${hasMore?' · 还有更早记录':''}`;
      root.querySelector('#journey-rows').innerHTML=mine.length?mine.map((item,i)=>`<a class="row journey-row" href="#/case/${encodeURIComponent(item.id)}"><span class="id">${String(mine.length-i).padStart(2,'0')}<br><small>链上</small></span><span class="txt">${item.body?esc(item.body):'密封承诺 · 原话待揭示'}<small>${item.kind==='promise'?'目标承诺':'判断承诺'} · ${esc(item.id.slice(0,12))}…</small></span><span class="st">${esc(states[item.status]||'状态待核验')}<small>独立核验 ↗</small></span></a>`).join(''):'<div class="flow-empty">这个居民在判官信箱最近的消息中，还没有可核验的封存记录。</div>';
      if(next){root.querySelector('#journey-rows').insertAdjacentHTML('beforeend','<button class="btn" type="button" id="journey-more">加载更早履历</button>');root.querySelector('#journey-more').onclick=()=>load(next);}
    }).catch(err=>{if(root.isConnected){root.querySelector('#journey-count').textContent='履历暂时无法读取';root.querySelector('.roadwrap').innerHTML='<p>履历数据尚未读取，不能视为没有记录。</p>';root.querySelector('#journey-rows').innerHTML=`<div class="flow-empty">${esc(err.message)}。<button type="button" class="btn" id="retry-journey">重新读取</button></div>`;root.querySelector('#retry-journey').onclick=()=>resident(id);root.querySelector('#journey-completed').textContent='—';root.querySelector('#journey-waiting').textContent='—';}});load(null);
  }
};

async function renderChainReceipt(hash){
  const path=location.hash;
  let item=(store.data.chainPending||[]).find(r=>r.hash.toLowerCase()===hash.toLowerCase());
  if(!item){
    V.innerHTML=`<div class="page flow-detail">${heading('恢复链上封存回执','X Layer · 判官 1.2.168')}<div class="flow-evidence" id="recover-receipt-status">正在从链上读取封存，无需重新发帖…</div></div>`;
    try{
      item=await Tape168.recoverReceipt(hash);
      if(location.hash!==path)return;
      item.owner=store.residents.find(p=>p.tokenId===item.residentId&&p.chain)?.id;
      store.data.chainPending??=[];store.data.chainPending.push(item);save();
    }catch(err){
      if(location.hash===path){const el=$('#recover-receipt-status');el.textContent='无法恢复回执：'+err.message;el.insertAdjacentHTML('beforeend','<p><a class="btn" href="#/all">返回封存档案</a></p>');}return;
    }
  }
  const explorer='https://www.oklink.com/xlayer/tx/'+encodeURIComponent(item.hash);
  V.innerHTML=`<div class="page flow-detail"><a class="back" href="#/me">← 我的一路</a>${heading('链上封存回执','真实 X Layer 交易')}<div class="flow-detail-grid"><section><div class="flow-evidence"><h2 id="chain-receipt-title">${item.status==='final'?'密封承诺已进入安全区块':'正在核验链上交易'}</h2><p id="chain-receipt-status">${item.status==='final'?'交易回执与消息日志已核对。':'交易已由钱包发出；页面正在检查回执与消息日志。'}</p><dl class="flow-facts"><dt>居民</dt><dd>${esc(person(item.owner)?.address||(item.residentId?item.residentId+'.2.168':item.from))}</dd><dt>判官</dt><dd>1.2.168</dd><dt>开舱时间</dt><dd>${esc(item.date)} ${esc(item.time)} · 北京时间</dd><dt>承诺标记</dt><dd><code>${esc(item.ref)}</code></dd><dt>交易哈希</dt><dd><code>${esc(item.hash)}</code></dd><dt>承诺 ID</dt><dd><code id="chain-commitment-id">${item.commitmentId?esc(item.commitmentId):"等待安全区块核验"}</code></dd></dl><p>密文已包含在链上消息中。揭示密钥保存在提交前下载的文件里；请勿提前公开。判官可自动执行到期揭示；你也可在下方核验文件后手动揭示。</p><a class="btn" href="${explorer}" target="_blank" rel="noopener">在 X Layer 浏览器核对交易 ↗</a></div></section><aside class="flow-timeline chain-verification"><div class="flow-kicker">核验进度</div><ol class="chain-steps"><li class="is-done"><strong>钱包发出交易</strong></li><li class="${['confirming','final'].includes(item.status)?'is-done':'is-current'}"><strong id="chain-receipt-step">${['confirming','final'].includes(item.status)?'回执与消息日志已核对':'等待回执与消息日志'}</strong></li><li class="${item.status==='final'?'is-done':item.status==='confirming'?'is-current':''}"><strong id="chain-final-step">${item.status==='final'?'安全区块已确认 · 可独立核验':'等待安全区块确认'}</strong></li></ol><button class="btn" id="chain-recheck" type="button">重新核验链上结果</button></aside></div></div>`;
  const revealPanel=document.createElement('div');
  revealPanel.className='flow-evidence';
  revealPanel.innerHTML=`<h2>到期公开揭示</h2><p>到了你指定的开舱时间，可用封存前下载的揭示文件公开单条内容密钥。文件先在本浏览器与链上原始密文核对，再由你确认 X Layer 钱包交易。公开后任何人都能读到原话。</p><label>选择这笔承诺的揭示文件 <input type="file" id="reveal-kit-file" accept=".json,application/json"></label><p id="reveal-status" class="flow-hint">${item.revealHash?`已发出揭示交易：${esc(item.revealHash)}；请重新选择揭示文件核验结果。`:'到期后才可准备揭示；提交前不会上传密钥。'}</p><label class="flow-check"><input type="checkbox" id="reveal-confirm"><span>我确认现在公开这条承诺的原话，且揭示后无法再保密。</span></label><div class="flow-actions"><button class="btn" type="button" id="reveal-prepare">核验揭示文件</button><button class="btn hi2" type="button" id="reveal-submit" disabled>${item.revealHash?'核验揭示交易':'确认链上揭示'}</button></div>`;
  V.querySelector('.flow-detail-grid > section').append(revealPanel);
  let revealPrepared=null;
  $('#reveal-kit-file').onchange=()=>{revealPrepared=null;$('#reveal-submit').disabled=true;$('#reveal-status').textContent='文件已选择，尚未核验。';};
  $('#reveal-prepare').onclick=async()=>{const b=$('#reveal-prepare');b.disabled=true;$('#reveal-status').textContent='正在核对原始链上密文与单条揭示密钥…';try{
    if(!chainSession.provider||!chainSession.address)throw Error('请先连接持有该居民电路的钱包。');
    const file=$('#reveal-kit-file').files?.[0];if(!file||file.size>20000)throw Error('请选择封存前下载的揭示 JSON 文件。');
    const kit=JSON.parse(await file.text());
    revealPrepared=await Tape168.prepareReveal(item,kit,chainSession.address);
    const quote=await Tape168.gasQuote(chainSession.provider,chainSession.address,revealPrepared);
    $('#reveal-status').textContent=`密文与密钥核验通过。TapeSend 消息费 0 OKB；预估 X Layer 网络费约 ${Chain168.fmt(quote.estimated)} OKB，最终以钱包确认页为准。168 不加收服务费。`;
    $('#reveal-submit').disabled=false;
  }catch(err){revealPrepared=null;$('#reveal-status').textContent=err.message;}finally{b.disabled=false;}};
  $('#reveal-submit').onclick=async()=>{const b=$('#reveal-submit');if(!revealPrepared)return;if(!item.revealHash&&!$('#reveal-confirm').checked){$('#reveal-status').textContent='请先确认公开后原话将无法保密。';return;}b.disabled=true;try{
    if(!item.revealHash){const revealHash=await Tape168.send(chainSession.provider,chainSession.address,revealPrepared);item.revealHash=revealHash;item.revealStatus='pending';save();}
    const result=await Tape168.verifyReceipt(chainSession.provider,item.revealHash,revealPrepared);
    item.revealStatus=result.status;if(result.commitmentId)item.revealMessageId=result.commitmentId;save();
    const labels={pending:'揭示交易已发出，尚待打包。',failed:'揭示交易失败，尚未在链上公开。',unverified:'回执未能匹配揭示消息，暂不视为已公开。',confirming:'揭示消息已找到，等待 X Layer 安全区块。',final:'揭示消息已进入安全区块，原话现在可公开核验。'};
    $('#reveal-status').textContent=(labels[result.status]||'揭示状态暂不可确认。')+` 交易：${item.revealHash}`;
    b.textContent='重新核验揭示交易';
  }catch(err){$('#reveal-status').textContent=err.message;}finally{b.disabled=false;}};
  const check=async()=>{const button=$('#chain-recheck'),status=$('#chain-receipt-status'),step=$('#chain-receipt-step'),finalStep=$('#chain-final-step');button.disabled=true;status.textContent='正在读取交易回执和链上消息日志…';try{
    const result=await Tape168.verifyReceipt(chainSession.provider,item.hash,item);
    item.status=result.status;if(result.inboxIndex)item.inboxIndex=result.inboxIndex;if(result.commitmentId){item.commitmentId=result.commitmentId;$("#chain-commitment-id").textContent=result.commitmentId;}save();
    const labels={pending:'交易待打包。请稍后重新核验。',failed:'交易执行失败，链上没有形成承诺。',unverified:'交易有成功回执，但未找到与本承诺一致的消息日志；暂不认定为已封存。',confirming:'交易和消息日志已核对，等待进入 X Layer 安全区块。',final:'消息日志已核对，且交易进入 X Layer 安全区块。'};
    $('#chain-receipt-title').textContent=result.status==='final'?'密封承诺已进入安全区块':result.status==='failed'?'封存交易失败':'正在核验链上交易';
    status.textContent=labels[result.status]||'状态暂不可确认。';step.textContent=['confirming','final'].includes(result.status)?'回执与消息日志已核对':labels[result.status]||'等待回执与消息日志';finalStep.textContent=result.status==='final'?'安全区块已确认 · 可独立核验':'等待安全区块确认';
    const steps=V.querySelectorAll('.chain-steps li');steps[1].classList.toggle('is-done',['confirming','final'].includes(result.status));steps[1].classList.toggle('is-current',!['confirming','final'].includes(result.status));steps[2].classList.toggle('is-done',result.status==='final');steps[2].classList.toggle('is-current',result.status==='confirming');
  }catch(err){status.textContent='暂时无法核验：'+err.message;}finally{button.disabled=false;}};
  $('#chain-recheck').onclick=check;
  if(chainSession.provider)check();
}

function renderResidentEntry(){
  V.innerHTML=`<div class="page resident-journey"><div class="head"><div><div class="eyebrow">168 · 我的一路</div><h1>先成为 168 的居民</h1></div><p class="flow-muted">一个电路就是你的居民身份，之后的每句话沿用它。</p></div><div class="journey-entry"><div class="journey-entry-rail"><span>01</span><i></i><span>02</span><i></i><span>03</span></div><div class="journey-entry-copy"><div><b>连接钱包</b><small>核验 X Layer 当前地址</small></div><div><b>持有或创建电路</b><small>查询 168 号处理器上的电路所有权</small></div><div><b>留下第一句话</b><small>用核验后的居民身份继续填写</small></div></div></div><button type="button" class="btn hi2" id="choose-identity">检查居民身份</button><p class="flow-hint">公开记录可以直接浏览；写信与发帖必须先通过钱包持有权检查。</p></div>`;
  $('#choose-identity').onclick=()=>identityOnly();
}

async function publicRecords(limit=12,after=null,residentId=null){
  try{const {createJudgeApi}=await import('./tools/judge-api.mjs');return await createJudgeApi().list(limit,after,{residentId});}
  catch(error){if(after)throw error;return {...await Tape168.latestCommitments(limit),source:'chain'};}
}
function publicSyncText(result){
  if(result.source!=='index')return `后台暂不可达 · 已直接核验安全区块 ${result.safeBlock}`;
  const time=new Date(result.syncedAt*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  return `后台同步于 ${time} · 安全区块 ${result.safeBlock}${result.stale?' · 同步较旧，请独立核验最新状态':''}`;
}

judgePage=function(){
  V.innerHTML=`<div class="page"><div class="head"><div><div class="eyebrow">168 · 判官</div><h1>判官 · 1.2.168</h1></div><p class="flow-muted">承诺、揭示和裁决以 X Layer 安全区块为准。</p></div><div class="flow-grid"><section class="flow-evidence"><h2>判官正在看什么</h2><p>居民向 1.2.168 发送密封承诺；任何人都能核验封存时间与身份。到期揭示后，原话才能被公众读取；裁决须另有判官发出的公开链上消息。</p><p>自动揭示与价格裁决已完成主网验收。选择判断背书的价格承诺，还须核验事前概率回执和公开参数后才计分。</p></section><section class="flow-evidence"><h2>裁决原则</h2><p>可核验的证据与判断条件应先于结果固定。没有足够证据时，判官应说明无法裁决；未揭示的原话不能判为命中或未中。</p><p>价格按封存时固定的规则取历史证据；事件由持有人审核证据后裁决。社区异议与居民目标评审仍待接入。</p></section></div><div class="resident-section"><h2>判官信箱 · 最近记录</h2><span id="judge-chain-count">正在读取安全区块…</span></div><div class="flow-grid" id="judge-chain-list"><div class="flow-empty">正在核对公开链上消息…</div></div></div>`;
  const root=V.querySelector('.page'),list=root.querySelector('#judge-chain-list');
  publicRecords(50).then(result=>{
    const {items,hasMore}=result;
    if(!root.isConnected)return;
    const states={sealed:'封存中',due:'到期待揭示',unrevealed:'宽限期已过 · 未揭示',revealed:'已公开揭示',judged:'已有判官裁决'};
    root.querySelector('#judge-chain-count').textContent=`${publicSyncText(result)} · ${items.length} 条${hasMore?' · 更多记录见档案':''}`;
    list.innerHTML=items.length?items.map(item=>`<a class="flow-record" href="#/case/${encodeURIComponent(item.id)}"><div><span class="entry-state">${esc(states[item.status]||'状态待核验')}</span><span class="flow-muted">${item.kind==='promise'?'目标承诺':'判断承诺'} · ${item.residentId?`居民 ${esc(item.residentId)}.2.168`:`${esc(item.from.slice(0,8))}…${esc(item.from.slice(-6))}`}</span></div><h3>${item.body?esc(item.body):'密封承诺 · 原话待揭示'}</h3><p>承诺 ID：<code>${esc(item.id)}</code><span>查看与核验 ↗</span></p></a>`).join(''):'<div class="flow-empty">已同步的判官信箱中，还没有封存记录。</div>';
  }).catch(err=>{if(root.isConnected){root.querySelector('#judge-chain-count').textContent='读取失败';list.innerHTML=`<div class="flow-empty">${esc(err.message)}。请稍后重新打开此页。</div>`;}});
};

const localArchive=archive;
let archiveReadRevision=0;
archive=function(){
  const revision=++archiveReadRevision;
  localArchive();
  const filters=V.querySelector('.flow-filter');
  if(filters)filters.innerHTML='<p class="flow-hint">直接读取判官 1.2.168 的 X Layer 安全区块消息。密文原话要等到揭示后才能公开。</p>';
  const chainItems=store.data.chainPending||[];
  const grid=$('#archive-list');
  if(!grid)return;
  const pending=chainItems.filter(r=>r.status!=='final').map(r=>`<a class="flow-record" href="#/chain/${esc(r.hash)}"><div><span class="entry-state">${r.status==='failed'?'交易失败':r.status==='unverified'?'消息尚未核实':'交易核验中'}</span><span class="flow-muted">本浏览器交易 · ${esc(person(r.owner)?.address||'')}</span></div><h3>等待链上独立核验</h3><p>${esc(r.date)} ${esc(r.time)} · 北京时间<span>核对交易 ↗</span></p></a>`).join('');
  grid.innerHTML=pending+'<div class="flow-empty" id="chain-archive-loading">正在从判官信箱读取公开链上记录…</div>';
  const displayed=new Map();
  const load=async(after=null)=>{
    try{
      const result=await publicRecords(12,after);
      if(revision!==archiveReadRevision||!grid.isConnected)return;
      for(const item of result.items)displayed.set(item.id,item);
      if(filters)filters.innerHTML=`<p class="flow-hint">${esc(publicSyncText(result))}。每分钟同步；打开记录可独立从链上核验。原话需公开揭示后才能读取。</p>`;
      const cards=[...displayed.values()].map(item=>{
        const when=new Date(item.openTime*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
        const states={sealed:'封存中',due:'到期待揭示',unrevealed:'宽限期已过 · 未揭示',revealed:'已公开揭示',judged:'已有判官裁决'};
        return `<a class="flow-record" href="#/case/${esc(item.id)}"><div><span class="entry-state">${states[item.status]||'链上待核验'}</span><span class="flow-muted">${item.kind==='promise'?'目标承诺':'判断承诺'} · ${esc(item.from.slice(0,8)+'…'+item.from.slice(-6))}</span></div><h3>${item.body?esc(item.body):'密封承诺 · 原话待揭示'}</h3><p>约定开舱：${esc(when)} · 北京时间<span>查看与核验 ↗</span></p><p>承诺 ID：<code>${esc(item.id)}</code></p></a>`;
      }).join('');
      grid.innerHTML=pending+(cards||'<div class="flow-empty">已同步的判官信箱中，尚无密封承诺。</div>')+(result.next?'<button class="btn" id="archive-more" type="button">加载更早记录</button>':result.hasMore?'<p class="flow-hint">直接链上读取暂覆盖最近 50 条消息；后台恢复后可读取更早记录。</p>':'');
      const more=grid.querySelector('#archive-more');if(more)more.onclick=()=>{more.disabled=true;more.textContent='正在读取…';load(result.next);};
    }catch(err){
      if(revision!==archiveReadRevision||!grid.isConnected)return;
      const more=grid.querySelector('#archive-more');if(more){more.disabled=false;more.textContent='读取失败 · 点击重试';}
      else grid.innerHTML=pending+`<div class="flow-empty">读取暂时失败：${esc(err.message)}。请稍后重试。</div>`;
    }
  };
  load();
};

function renderPublicCase(id){
  V.innerHTML=`<div class="page flow-detail"><a class="back" href="#/all">← 封存档案</a>${heading('公开链上记录','X Layer · 判官 1.2.168')}<div class="flow-evidence" id="public-case">正在读取公开记录…</div></div>`;
  const target=$('#public-case');
  function draw(item,result){
    if(!target.isConnected)return;
    const indexed=result.source==='index';
    const states={sealed:'封存中',due:'到期待揭示',unrevealed:'宽限期已过 · 未揭示',revealed:'已公开揭示',judged:'已有判官裁决'};
    const when=new Date(item.openTime*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
    const explorer=item.txHint?'https://www.oklink.com/xlayer/tx/'+encodeURIComponent(item.txHint):null;
    target.innerHTML=`<h2>${states[item.status]||'状态待核验'}</h2><p>${indexed?esc(publicSyncText(result))+'。此处是后台索引，可进一步独立核验。':`已直接从多个 X Layer 节点的安全区块 ${result.safeBlock} 重建此记录。`}</p><dl class="flow-facts"><dt>承诺 ID</dt><dd><code>${esc(item.id)}</code></dd><dt>居民地址</dt><dd><code>${esc(item.from)}</code></dd><dt>开舱时间</dt><dd>${esc(when)} · 北京时间</dd><dt>封存区块</dt><dd>${esc(item.blockNumber)}</dd>${item.revealId?`<dt>揭示消息</dt><dd><code>${esc(item.revealId)}</code></dd>`:''}${item.verdictId?`<dt>裁决消息</dt><dd><code>${esc(item.verdictId)}</code></dd>`:''}</dl>${item.body?`<div class="flow-quote">${esc(item.body)}</div><p>${indexed?'后台已验证公开揭示':'已独立核验公开揭示'}；判定约定：${esc(item.condition||'未填写')}</p>`:'<p>原话尚未公开揭示，不显示密封内容。</p>'}${item.outcome?`<p>判官结果：${esc(({hit:'命中',miss:'未中',undecidable:'暂无法判定'})[item.outcome]||item.outcome)}。判断分需另行核验背书、事前回执与公开参数。</p>`:''}${item.reason?`<p>裁决依据：${esc(item.reason)}</p>`:''}${item.sources?.length?`<h3>公开价格证据</h3>${item.sources.map(s=>`<p>${esc(s.name||s.id)}：${esc(s.value)} USD · ${publicEvidenceLink(s.url)}</p>`).join('')}`:''}${explorer?`<a class="btn" href="${explorer}" target="_blank" rel="noopener">查看封存交易 ↗</a>`:''}<button class="btn" type="button" id="case-verify">直接从链上独立核验</button><p class="flow-hint" id="case-verify-status"></p>`;
    target.querySelector('#case-verify').onclick=verify;
    if(!item.revealId){
      target.insertAdjacentHTML('beforeend',`<p><a class="btn hi2" href="#/chain/${esc(item.txHint||item.id)}">打开封存回执 · 到期揭示</a></p><p class="flow-hint">没有本地回执时，会从链上恢复封存；揭示文件只在本浏览器核验。</p>`);
    }
  }
  async function verify(){
    const button=target.querySelector('#case-verify'),status=target.querySelector('#case-verify-status');
    if(button)button.disabled=true;
    if(status)status.textContent='正在从多个 X Layer 节点核验公开消息…';
    try{
      const result=await Tape168.latestCommitments(50);
      if(!target.isConnected)return;
      const item=result.items.find(x=>x.id.toLowerCase()===id.toLowerCase());
      if(!item)throw Error('最近 50 条消息中未找到该记录；这不代表链上记录不存在，可先查看封存交易。');
      draw(item,{...result,source:'chain'});
    }catch(err){if(target.isConnected){if(status)status.textContent='暂时无法独立核验：'+err.message;else target.textContent='暂时无法读取：'+err.message;}}
    finally{if(button?.isConnected)button.disabled=false;}
  }
  import('./tools/judge-api.mjs').then(({createJudgeApi})=>createJudgeApi().detail(id)).then(result=>draw(result.item,result)).catch(()=>verify());
}

function residenceError(message){const el=$('#residence-error');if(el)el.textContent=message;}
function finishResidence(){
  closeWizard();const next=residenceReturnAction;residenceReturnAction=null;
  if(next)next();else route();
}
function drawResidenceDialog(){
  const dlg=$('#flow-dialog');
  let body='';
  if(!chainSession.address){
    body=`<h2>先成为 168 的居民</h2><p class="flow-hint">连接 X Layer 钱包后，系统会查询你是否持有 168 电路。其他处理器的电路不能作为 168 居民身份。</p><div data-wallet-summary>${walletSummary()}</div><div class="flow-actions"><button class="btn hi2" id="residence-connect" type="button">连接并检查钱包</button></div>`;
  }else if(chainSession.owned.length){
    body=`<h2>找到你的居民电路</h2><p class="flow-hint">当前钱包 ${esc(shortWallet(chainSession.address))} 持有 ${chainSession.owned.length} 个 168 电路。请选择用哪个身份发帖。</p><label>钱包持有的电路<select id="owned-circuit">${chainSession.owned.map(c=>`<option value="${esc(c.id)}" ${chainSession.activeId===c.id?'selected':''}>${esc(c.address)}</option>`).join('')}</select></label><div class="flow-actions"><button class="btn" id="residence-recheck" type="button">重新检查</button><button class="btn hi2" id="residence-use" type="button">用这个居民身份继续</button></div>`;
  }else if(chainSession.manual){
    body=`<h2>核验你的电路编号</h2><p class="flow-hint">168 电路数量较多，无法在钱包内逐个扫描。输入你持有的电路编号，我们会直接向 X Layer 查询所有者。</p><label>居民电路编号<input id="resident-circuit-id" inputmode="numeric" pattern="[0-9]+" placeholder="例如 26，对应 26.2.168"></label><div class="flow-actions"><button class="btn hi2" id="residence-verify-id" type="button">核验电路所有权</button></div>`;
  }else{
    const price=chainSession.price;
    body=`<h2>这个钱包还不是 168 居民</h2><p class="flow-hint">钱包 ${esc(shortWallet(chainSession.address))} 目前没有查到 168 电路。即使持有其他处理器的电路，也需要在 168 号处理器创建一个居民身份。点击下方按钮，我们会准备流片交易；晶体管价格由 168 处理器发行方设定，协议费与流片费由相应链上合约报价，另有 X Layer 网络费。下方逐项列出；只有你逐笔确认钱包请求后才会支付。</p><div class="journey-residence-ticket"><span>居民电路 · 168 号处理器</span><strong>一个 NAND 电路</strong><code>流片后得到专属编号：n.2.168</code></div><dl class="flow-facts"><dt>168 晶体管价格 · 发行方设定</dt><dd>${price?price.needMint?Chain168.fmt(price.transistorPrice)+' OKB':'钱包已有 · 0 OKB':'读取中'}</dd><dt>TapeOut 协议费 · 官方合约</dt><dd>${price?price.needMint?Chain168.fmt(price.tapeoutProtocolFee)+' OKB':'无需铸造 · 0 OKB':'读取中'}</dd><dt>创建电路的流片费 · 非 168 项目收费</dt><dd>${price?Chain168.fmt(price.tapeout)+' OKB':'读取中'}</dd><dt>链上合约费用合计</dt><dd>${price?Chain168.fmt(price.total)+' OKB':'请重新检查报价'}</dd><dt>X Layer 网络费</dt><dd>钱包确认时显示</dd></dl><p class="flow-hint">这笔费用用于在 TapeOut 流片、创建你的 168 居民电路，由钱包支付给 <a href="https://www.oklink.com/xlayer/address/${Chain168.processor}" target="_blank" rel="noopener">168 处理器合约 ↗</a>，168 项目不收取这笔费用。每创建一枚电路支付一次，之后用同一身份发帖不重复支付。上方是合约当前报价，并非固定价格或最高上限；X Layer 网络费由钱包另行显示。</p><label class="flow-check"><input type="checkbox" id="residence-confirm"><span>我已核对各项链上合约费用与 X Layer 网络费，愿意在钱包里逐笔确认交易。</span></label><div class="flow-actions"><button class="btn" id="residence-recheck" type="button">重新检查</button><button class="btn hi2" id="residence-create" type="button" ${price?'':'disabled'}>创建居民电路</button></div>`;
  }
  dlg.innerHTML=`<div class="dialog-top"><span>居民核验 · ${chainSession.address?'02':'01'} / 02</span><button type="button" class="flow-close" aria-label="关闭身份窗口">×</button></div>${body}<p class="flow-error" id="residence-error" role="alert">${esc(chainSession.error)}</p><p class="flow-hint">居民电路创建与封存消息均需由钱包确认真实 X Layer 交易。判官公钥、信箱和揭示密钥准备好之前，页面不会发送封存交易。</p>`;
  dlg.querySelector('.flow-close').onclick=()=>{residenceReturnAction=null;closeWizard();};
  if($('#residence-connect'))$('#residence-connect').onclick=async()=>{const b=$('#residence-connect');b.disabled=true;residenceError('正在连接并检查钱包…');try{await connectWallet();chainSession.error='';drawResidenceDialog();}catch(err){chainSession.error=err.message;drawResidenceDialog();}};
  if($('#residence-recheck'))$('#residence-recheck').onclick=async()=>{residenceError('正在重新检查钱包与链上电路…');try{await refreshWallet();chainSession.error='';drawResidenceDialog();}catch(err){chainSession.error=err.message;drawResidenceDialog();}};
  if($('#residence-verify-id'))$('#residence-verify-id').onclick=async()=>{const b=$('#residence-verify-id');b.disabled=true;try{const circuit=await Chain168.verify(chainSession.provider,chainSession.address,$('#resident-circuit-id').value.trim());chainSession.owned=[circuit];selectOwnedCircuit(circuit.id);await verifyActiveCircuit();finishResidence();}catch(err){b.disabled=false;residenceError(err.message);}};
  if($('#residence-use'))$('#residence-use').onclick=async()=>{const b=$('#residence-use');b.disabled=true;try{selectOwnedCircuit($('#owned-circuit').value);await verifyActiveCircuit();finishResidence();}catch(err){b.disabled=false;residenceError(err.message);}};
  if($('#residence-create'))$('#residence-create').onclick=async()=>{const b=$('#residence-create');if(!$('#residence-confirm').checked){residenceError('请先核对费用并勾选确认。');return;}b.disabled=true;try{
    const circuit=await Chain168.create(chainSession.provider,chainSession.address,chainSession.price,residenceError);
    await refreshWallet();
    if(!chainSession.owned.some(c=>c.id===circuit.id))chainSession.owned.push(circuit);
    selectOwnedCircuit(circuit.id);await verifyActiveCircuit();finishResidence();
  }catch(err){b.disabled=false;residenceError(err.message);}};
}

identityOnly=function(next=null){
  residenceReturnAction=typeof next==='function'?next:null;
  returnFocus=document.activeElement;
  drawResidenceDialog();
  if(!$('#flow-dialog').open)$('#flow-dialog').showModal();
};
identityFields=function(){return `<p class="flow-hint">发帖身份：${chainSession.activeId?esc(chainSession.activeId+'.2.168'):'尚未核验'}。每次提交前会再检查当前钱包的持有权。</p>`;};
selectIdentity=async function(){await verifyActiveCircuit();};
const previousJudgePage=judgePage;
judgePage=function(){
  previousJudgePage();
  const page=V.querySelector('.page'),panel=document.createElement('section');
  panel.className='judge-setup-panel';
  panel.innerHTML=chainSession.address?'<div class="flow-cost" id="chain-preflight"><h3>正在读取判官链上状态…</h3></div>':'<div class="flow-cost"><h3>开通判官 1.2.168</h3><p>连接持有判官电路的钱包，在本页面开通信箱、生成加密备份并发布公钥。</p><button type="button" class="btn hi2" id="judge-connect-wallet">连接判官钱包</button></div>';
  page.querySelector('.head')?.insertAdjacentElement('afterend',panel);
  if($('#judge-connect-wallet'))$('#judge-connect-wallet').onclick=openWallet;
  if(chainSession.address)loadChainPreflight(true);
};
const originalOpenWizard=openWizard;
openWizard=function(step=1){
  if(!chainSession.activeId||!store.active?.chain){keepDraft();identityOnly(()=>originalOpenWizard(1));return;}
  originalOpenWizard(step);
};
const originalRoute=route;
removeEventListener('hashchange',originalRoute);
route=function(){const path=location.hash.slice(1)||'/';if(path.startsWith('/chain/')){renderChainReceipt(path.slice(7));return;}if(/^\/case\/0x[0-9a-f]{64}$/i.test(path)){renderPublicCase(path.slice(6));return;}originalRoute();if(path==='/me'&&!chainSession.activeId)renderResidentEntry();};
addEventListener('hashchange',route);
addEventListener('hashchange',()=>{if((location.hash.slice(1)||'/')==='/me'&&!chainSession.activeId)renderResidentEntry();});

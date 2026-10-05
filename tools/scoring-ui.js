// All scores come from verified public receipts; a read error never means zero.
async function scoreRead(path){
  let failure;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch('https://168-judge.joezuooo.workers.dev'+path,{signal:AbortSignal.timeout(10000),credentials:'omit',cache:'no-store'});
      if(!response.ok)throw Error('计分服务返回 HTTP '+response.status+'，请稍后重试。');
      return await response.json();
    }catch(error){failure=error;if(attempt===0)await new Promise(resolve=>setTimeout(resolve,300));}
  }
  if(failure instanceof TypeError||['TimeoutError','AbortError'].includes(failure?.name))throw Error('暂时无法连接计分服务。分数尚未读取，请检查网络后重试。');
  throw failure;
}
function scoreFailure(target,error,retry){
  if(!target.isConnected)return;
  target.innerHTML=`<p>${esc(error.message)}</p><button type="button" class="btn">重新读取</button>`;
  target.querySelector('button').onclick=retry;
}
function scoreLinks(cases){return cases.map(id=>`<a href="#/case/${esc(id)}">${esc(id.slice(0,14))}… ↗</a>`).join(' · ');}
ranking=async function(){
  V.innerHTML=`<div class="page">${heading('一路发榜','判断分 · 历史频率模型 v2')}<p>命中得 1−p，未中扣 p。每笔价格判断须有独立背书和事前计分回执；十条有效结算后进入正式榜。人和智能体使用同一规则。</p><p>p 使用封存前 180 天历史估计，不代表真实概率。历史窗口重叠；期限按小时向上取整。正式榜提供可核验的资源分配依据。</p><div id="score-rank" class="flow-grid">正在读取计分记录…</div></div>`;
  const target=$('#score-rank');
  const load=async()=>{try{
    const data=await scoreRead('/api/leaderboard');if(!target.isConnected)return;
    if(!Array.isArray(data.rows)||!Array.isArray(data.records))throw Error('榜单数据格式不完整，请重试。');
    const group=(rows,title)=>`<h2>${title}</h2>`+(rows.length?rows.map((p,i)=>`<section class="flow-evidence"><h3>${p.eligible?i+1+'. ':''}居民 ${esc(p.residentId)}.2.168 · ${(p.scoreUnits/1e6).toFixed(6)} 分</h3><p>提交时钱包：<code>${esc(p.authorWallet)}</code></p><p>${p.settled} 条结算 · 命中 ${p.hit} · 未中 ${p.miss} · 待结算 ${p.pending}</p><p>平均 p：${p.settled?(p.totalPUnits/p.settled/1e6).toFixed(6):'—'}</p>${scoreLinks(p.cases)}</section>`).join(''):'<p>暂无符合条件的记录。</p>');
    target.innerHTML=`${data.enabled?'':'<p>新判断计分暂未启用，已核验历史仍可查看。</p>'}<p>索引截止：${esc(new Date(data.asOf*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))} · 数据暂缺不视为零分</p>`+group(data.rows.filter(p=>p.eligible),'正式榜')+group(data.rows.filter(p=>!p.eligible),'样本积累中（不排名）')+'<button type="button" class="btn" id="score-export">导出已核验榜单 JSON</button>';
    target.querySelector('#score-export').onclick=()=>{
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='168-leaderboard-'+data.asOf+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }catch(error){scoreFailure(target,error,load);}};await load();
};
const caseWithoutScore=renderPublicCase;
renderPublicCase=function(id){
  caseWithoutScore(id);
  const panel=document.createElement('section');panel.className='flow-evidence';panel.id='score-evidence';panel.textContent='正在读取计分回执…';
  V.querySelector('.page').append(panel);
  const cleanup=()=>{panel.remove();removeEventListener('hashchange',cleanup);};addEventListener('hashchange',cleanup);
  const load=async()=>{try{
    const data=await scoreRead('/api/cases/'+encodeURIComponent(id));if(!panel.isConnected)return;
    const s=data.scoring;
    if(!s){
      const a=data.scoringAdmission,pending=a&&['prepared','retry'].includes(a.state);
      panel.innerHTML='<h2>判断计分</h2><p>'+(pending?'正在准备或等待事前计分回执，目前尚未计分。':a?.state==='expired'?'未在事前窗口内取得计分回执，这笔保留履历、不计分。':'没有有效的事前计分回执，这笔记录不计分。普通封存不能事后补计分。')+'</p>'+(a?.reason?'<p>'+esc(a.reason)+'</p>':'')+'<button type="button" class="btn">刷新计分状态</button>';
      panel.querySelector('button').onclick=load;if(pending)setTimeout(()=>{if(panel.isConnected)load();},30000);return;
    }
    const tx=(hash,label)=>hash?`<a href="https://www.oklink.com/xlayer/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener">${label} ↗</a>`:'';
    const p=s.parameters_json?JSON.parse(s.parameters_json):null,outcome=data.scoringResult?.outcome;
    const value=Number.isInteger(data.scoringResult?.scoreUnits)&&['hit','miss'].includes(outcome)?data.scoringResult.scoreUnits/1e6:null;
    panel.innerHTML=`<h2>判断计分核验</h2><p>${value!==null?`本笔判断分：${value>0?'+':''}${value.toFixed(6)} · ${outcome==='hit'?'命中':'未中'}`:s.verified?'背书与历史概率核验通过，等待有效裁决':'等待参数公开或独立核验，尚不计分'}</p><p>${tx(s.receipt_tx,'事前计分回执')} · ${tx(s.parameters_tx,'公开计分参数')}</p><p>参数承诺：<code>${esc(s.parameters_hash)}</code></p>${p?`<p>p = ${(p.pUnits/1e6).toFixed(6)} · 初始价 ${esc(p.px0)} USD · 背书 ${esc(p.slot.circuitId)}.2.168</p><p>${p.samples} 个历史样本 · ${p.horizonHours} 小时跨度 · ${esc(p.version)}</p><p>历史摘要：<code>${esc(p.historyHash)}</code></p><a href="https://168-judge.joezuooo.workers.dev/api/cases/${encodeURIComponent(id)}/scoring-evidence" target="_blank" rel="noopener">下载已公开的历史样本 ↗</a><p>提交时钱包：<code>${esc(p.authorWallet)}</code></p>`:'<p>到期揭示后公开参数。</p>'}${s.error?`<p>核验待处理：${esc(s.error)}</p>`:''}<button type="button" class="btn">刷新计分状态</button>`;
    panel.querySelector('button').onclick=load;if(value===null)setTimeout(()=>{if(panel.isConnected)load();},30000);
  }catch(error){scoreFailure(panel,error,load);}};load();
};
const residentWithoutScore=resident;
resident=function(id){
  residentWithoutScore(id);const p=person(id),circuit=p?.address?.match(/^(\d+)\.2\.168$/)?.[1];if(!circuit)return;
  const panel=document.createElement('section');panel.className='flow-evidence';panel.textContent='正在读取判断分…';V.querySelector('.page')?.append(panel);
  const load=async()=>{try{
    const data=await scoreRead('/api/leaderboard');if(!panel.isConnected)return;
    const rows=data.rows.filter(r=>r.residentId===circuit);
    panel.innerHTML='<h2>判断分 · 按提交时钱包归属</h2>'+(rows.length?rows.map(r=>`<p><code>${esc(r.authorWallet)}</code>：${(r.scoreUnits/1e6).toFixed(6)} 分 · ${r.settled} 条结算 · ${r.eligible?'达到上榜门槛':'样本积累中'}</p>`).join(''):'<p>暂无已核验的背书计分记录。普通封存不计分。</p>')+'<a href="#/ranking">查看一路发榜 ↗</a>';
    const hits=rows.reduce((s,r)=>s+r.hit,0),settled=rows.reduce((s,r)=>s+r.settled,0);
    const rate=V.querySelector('#journey-rate');if(rate)rate.textContent=settled?Math.round(hits/settled*100)+'%':'—';
  }catch(error){scoreFailure(panel,error,load);}};load();
};

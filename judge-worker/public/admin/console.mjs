import {mod,tchain} from './vendor/tapesend.bundle.mjs';
const $=id=>document.getElementById(id);
const status=text=>{for(const id of ['status','publish-status'])if($(id))$(id).textContent=text;};
async function readStep(label,read,ms=20000){
  status(label+'…');let timer;
  try{return await Promise.race([Promise.resolve().then(read),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'超时，请稍后重试；本次尚未请求发送裁决交易。')),ms);})]);}
  finally{clearTimeout(timer);}
}
const CPU='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',container='0xf053f07efcc2ade76d35dfbb6ed7c0f8eb976d35';
const chain=tchain.createTapeSendChains().get(196),endpoint=tchain.endpointId(196,container);
let provider,wallet,jobs=[],busy=false;
const chosen=()=>jobs.find(job=>job.id===$('cases').value);
async function api(path,options){const r=await fetch(path,{...options,signal:AbortSignal.timeout(20000)}),j=await r.json();if(!r.ok)throw Error(j.error||'后台请求失败');return j;}
async function judge(){
  if(!provider||!wallet)throw Error('请先连接判官钱包。');
  const accounts=await readStep('读取钱包账户',()=>provider.request({method:'eth_accounts'}));
  if(accounts[0]?.toLowerCase()!==wallet||BigInt(await readStep('核对钱包网络',()=>provider.request({method:'eth_chainId'})))!==196n)throw Error('钱包或网络已变化，请重新连接。');
  const safe=await readStep('读取 X Layer 安全区块',()=>chain.finalizedBlock());if(safe===null)throw Error('安全区块暂不可核验');
  const state=await readStep('核对判官电路持有人',()=>chain.resolveEndpoint('1.2.168',{block:'0x'+safe.toString(16),skipFreshness:true}));
  if(state.status!=='ok'||state.circuits!==CPU||state.container!==container||state.holder!==wallet)throw Error('当前钱包没有持有已开通的判官 1.2.168。');
  return {state,safe};
}
function draw(){const j=chosen();if(!j)return;
  $('case-id').textContent=j.id;$('case-state').textContent=`开舱：${new Date(j.openTime*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · ${j.revealId?'已公开揭示':'尚未公开揭示'}${j.verdictId?' · 已有链上裁决':''}`;
  $('body').textContent=j.body||'原话尚未公开，判官不能在此发布命中或未中。';$('condition').textContent=j.condition||'';$('reason').textContent=j.jobReason||'';
  $('publish').disabled=false;$('reveal-help').hidden=!!j.revealId;$('confirm').checked=false;
  $('verdict-reason').value=j.proposed?.reason||'';$('outcome').value=j.proposed?.outcome||'hit';
  for(const id of ['source-url','source-name','source-value','source-time'])$(id).value='';
}
async function refresh(){const data=await api('/api/judge/jobs');jobs=data.jobs;
  const selected=$('cases').value;$('cases').replaceChildren();
  for(const j of jobs){const o=document.createElement('option');o.value=j.id;o.textContent=`${j.id.slice(0,14)}… · ${j.verdictId?'已裁决':j.revealId?'待裁决':'待揭示'}`;$('cases').append(o);}
  if(jobs.some(j=>j.id===selected))$('cases').value=selected;else {const next=jobs.find(j=>j.revealId&&!j.verdictId)||jobs.find(j=>!j.verdictId);if(next)$('cases').value=next.id;}
  draw();status(`已读取 ${jobs.length} 条记录 · 后台安全区块 ${data.safeBlock}`);
}
async function publish(){if(!provider||!wallet)throw Error('请先点击页面顶部的“连接判官钱包”。');const j=chosen();if(!j?.revealId||j.verdictId)throw Error('请先公开揭示，再发布裁决。');
  if(!$('confirm').checked)throw Error('请先确认核对原文和证据。');
  const decision={outcome:$('outcome').value,reason:$('verdict-reason').value.trim(),sources:[]};
  if(j.proposed&&decision.outcome===j.proposed.outcome&&decision.reason===j.proposed.reason){decision.sources=j.proposed.sources;decision.ruleVersion=j.proposed.ruleVersion;}
  else if($('source-url').value.trim()) {
    const at=Date.parse($('source-time').value+'+08:00')/1000;
    if(!Number.isSafeInteger(at))throw Error('请填写证据的北京时间。');
    decision.sources=[{name:$('source-name').value.trim(),value:$('source-value').value.trim(),url:$('source-url').value.trim(),at}];
  }
  status('正在核对判官持有人、公开揭示与交易内容…');const {state,safe}=await judge();
  status('正在准备裁决内容…');
  const data=await api('/api/judge/prepare-verdict',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({caseId:j.id,decision})});
  const tx=data.transaction,parsed=mod.parsePayload(mod.hexToBytes(tx.payload));if(parsed.kind!=='public')throw Error('裁决不是公开消息');
  const scv=JSON.parse(new TextDecoder().decode(parsed.content)).scv;
  const pointer=scv.commitment;
  if(pointer?.chainId!==196||pointer.to!==endpoint||mod.messageId(196,chain.hub,endpoint,pointer.inboxIndex)!==j.id)throw Error('裁决引用错误');
  const page=await readStep('核对链上原始承诺',()=>chain.inbox(endpoint,{before:pointer.inboxIndex+1,limit:1,block:'0x'+safe.toString(16)}));
  const original=page.items.find(e=>e.id===j.id);if(!original||original.fromEndpoint!==j.authorEndpoint)throw Error('承诺未通过链上核验');
  await readStep('核对承诺消息内容',()=>chain.fetchMessage(original));
  // The unsigned server result cannot redirect payment or alter the recipient.
  const expected=chain.encodeSend({circuits:CPU,tokenId:1,to:original.fromEndpoint,ref:tx.ref,payload:tx.payload});
  if(tx.to!==chain.hub||tx.value!=='0x0'||expected.data!==tx.data||tx.ref!=='0x5343563103'+j.id.slice(2,56)||
    scv.type!=='verdict'||scv.outcome!==decision.outcome||scv.reason!==decision.reason||JSON.stringify(scv.sources)!==JSON.stringify(decision.sources))throw Error('后台交易内容与所确认裁决不同');
  const sending={from:wallet,to:tx.to,data:tx.data,value:'0x0'};
  const [gas,price]=await readStep('估算网络费',()=>Promise.all([provider.request({method:'eth_estimateGas',params:[sending]}),provider.request({method:'eth_gasPrice',params:[]})]));
  const cost=(Number(BigInt(gas)*BigInt(price))/1e18).toFixed(8);status(`预估网络费 ${cost} OKB。请在钱包核对并确认；钱包确认页显示最终费用。`);
  await judge();status(`等待钱包确认，预估网络费 ${cost} OKB；请打开钱包扩展查看。`);const hash=await provider.request({method:'eth_sendTransaction',params:[sending]});
  status(`裁决交易已发出，等待安全区块与后台同步：\n${hash}\nhttps://www.oklink.com/xlayer/tx/${hash}\n稍后点击“刷新链上案件”。现在尚不标为已裁决。`);
}
function action(id,fn){$(id).onclick=async()=>{
  if(busy){status('上一项操作仍在处理中，请等待；若正在等待签名，请打开钱包扩展。');return;}
  busy=true;const button=$(id),label=button.textContent;button.disabled=true;button.textContent='处理中…';
  status('正在处理，请稍候…');
  try{await fn();}catch(error){status(error.code===4001?'你取消了钱包确认，尚未发布裁决。':error.message);}
  finally{busy=false;button.disabled=false;button.textContent=label;}
};}
action('connect',async()=>{provider=window.okxwallet||window.ethereum?.providers?.find(p=>p.isOkxWallet)||window.ethereum;if(!provider?.request)throw Error('请在安装钱包的 Chrome 打开工作台。');const accounts=await provider.request({method:'eth_requestAccounts'});wallet=accounts[0]?.toLowerCase();if(BigInt(await readStep('核对钱包网络',()=>provider.request({method:'eth_chainId'})))!==196n)await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xc4'}]});await judge();$('wallet').textContent='已核验判官钱包：'+wallet;status('钱包已核验。选择公开揭示后的承诺，准备裁决。');});
action('refresh',refresh);action('publish',publish);$('cases').onchange=draw;
refresh().catch(error=>status(error.message));

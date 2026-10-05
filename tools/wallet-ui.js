// A wallet session is live only after checking X Layer and circuit ownership.
const chainSession={provider:Chain168.findProvider(),address:null,owned:[],activeId:null,loading:false,error:'',price:null,manual:false,revision:0};
// Old local sample selections are never an authorisation to write.
const priorCircuit=store.active?.chain?{owner:store.active.owner,tokenId:store.active.tokenId}:null;
store.data.active=null;
save();
function shortWallet(address){return address?address.slice(0,6)+'…'+address.slice(-4):'连接钱包';}
function walletSummary(){return `<div class="wallet-inline"><div><span class="wallet-caption">X Layer 钱包 · 居民电路持有人</span><strong>${chainSession.address?esc(shortWallet(chainSession.address)):'尚未连接'}</strong></div><button type="button" class="btn" onclick="openWallet()">${chainSession.address?'查看钱包':'连接钱包'}</button></div><p class="flow-hint">发帖前核验当前钱包持有的 168 电路；其他处理器的电路不能作为 168 居民身份。</p>`;}
function paintWallet(){const b=$('#wallet-trigger');if(!b)return;b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8H5a2 2 0 0 1 0-4h13v4M4 6v13a1 1 0 0 0 1 1h15V8M20 12h-6v4h6M16 14h.01"/></svg><span>${chainSession.address?esc(shortWallet(chainSession.address)):'连接钱包'}<small>${chainSession.activeId?esc(chainSession.activeId+'.2.168'):chainSession.address?'等待居民核验':'X Layer'}</small></span>`;document.querySelectorAll('[data-wallet-summary]').forEach(el=>el.innerHTML=walletSummary());}
function clearWallet(){chainSession.revision++;chainSession.address=null;chainSession.owned=[];chainSession.activeId=null;chainSession.price=null;chainSession.manual=false;store.data.active=null;save();paintWallet();}
async function refreshWallet(){
  let revision=chainSession.revision;
  const p=chainSession.provider;
  if(!p)throw Error('没有检测到钱包。请在装有 OKX Wallet 或 MetaMask 的浏览器中打开。');
  const address=await Chain168.authorized(p);
  if(!address){clearWallet();return;}
  await Chain168.assertProcessor(p);
  if(chainSession.address&&chainSession.address!==address){clearWallet();revision=chainSession.revision;}
  chainSession.address=address;
  chainSession.manual=false;
  try{const found=await Chain168.owned(p,address);if(revision!==chainSession.revision)throw Error('钱包在核验期间已切换，请重试。');chainSession.owned=found;}
  catch(error){if(error.code!=='scan-limit')throw error;chainSession.owned=[];chainSession.manual=true;}
  if(chainSession.activeId&&!chainSession.owned.some(c=>c.id===chainSession.activeId)){chainSession.activeId=null;store.data.active=null;save();}
  if(!chainSession.activeId&&priorCircuit?.owner===address&&chainSession.owned.some(c=>c.id===priorCircuit.tokenId))selectOwnedCircuit(priorCircuit.tokenId);
  if(!chainSession.activeId&&chainSession.owned.length===1)selectOwnedCircuit(chainSession.owned[0].id);
  chainSession.price=chainSession.owned.length||chainSession.manual?null:await Chain168.quote(p,address);
  if(revision!==chainSession.revision)throw Error('钱包在核验期间已切换，请重试。');
  chainSession.error='';
  paintWallet();
}
async function connectWallet(){
  const p=chainSession.provider;
  const address=await Chain168.connect(p);
  if(chainSession.address&&chainSession.address!==address)clearWallet();
  chainSession.address=address;
  await refreshWallet();
  return address;
}
function selectOwnedCircuit(id){
  const circuit=chainSession.owned.find(c=>c.id===String(id));
  if(!chainSession.address||!circuit)throw Error('请先核验当前钱包持有的居民电路。');
  const key='chain-'+chainSession.address+'-'+circuit.id;
  let resident=store.residents.find(p=>p.id===key);
  if(!resident){resident={id:key,name:'居民 #'+circuit.id,address:circuit.address,type:'human',pending:false,chain:true,owner:chainSession.address,tokenId:circuit.id};store.residents.push(resident);}
  store.data.active=key;chainSession.activeId=circuit.id;save();paintWallet();return resident;
}
async function verifyActiveCircuit(){
  if(!chainSession.provider||!chainSession.address||!chainSession.activeId)throw Error('请先连接钱包并选择自己持有的居民电路。');
  const account=await Chain168.authorized(chainSession.provider);
  if(account!==chainSession.address){clearWallet();throw Error('钱包地址已变化，请重新连接并核验。');}
  const activeId=chainSession.activeId,revision=chainSession.revision;
  const circuit=await Chain168.verify(chainSession.provider,account,activeId);
  if(revision!==chainSession.revision||chainSession.address!==account||chainSession.activeId!==activeId)throw Error('钱包或居民身份已变化，请重新核验。');
  if(!store.active||store.active.id!=='chain-'+account+'-'+circuit.id)throw Error('居民身份未完成核验。');
  return circuit;
}
function openWallet(){drawWallet();if(!$('#wallet-dialog').open)$('#wallet-dialog').showModal();}
function closeWallet(){if($('#wallet-dialog').open)$('#wallet-dialog').close();}
function drawWallet(){
  const d=$('#wallet-dialog');
  const needsResident=chainSession.address&&!chainSession.activeId&&!chainSession.owned.length&&!chainSession.manual;
  d.innerHTML=`<div class="dialog-top"><span>168 · 钱包</span><button type="button" class="flow-close" aria-label="关闭钱包窗口">×</button></div><div class="wallet-emblem">◈</div><h2>${chainSession.address?'钱包已连接':'连接 X Layer 钱包'}</h2><p class="wallet-intro">${chainSession.address?esc(chainSession.address):'发帖使用钱包当前持有的 168 居民电路。'}</p><div class="wallet-network"><span class="wallet-network-dot"></span><span>X Layer · 处理器 168</span></div><p class="flow-hint">${chainSession.activeId?'已核验居民 '+esc(chainSession.activeId+'.2.168'):chainSession.address?`已发现 ${chainSession.owned.length} 个 168 居民电路。`:'公开记录可直接浏览；发帖必须先完成居民核验。'}</p>${needsResident?'<div class="wallet-resident-callout"><strong>还需要一个 168 居民身份</strong><p>其他处理器上的电路不会自动成为 168 居民。我们可以帮你在 168 号处理器流片一个简单电路；168 晶体管价格、协议费与流片费从 X Layer 合约分别读取，另需网络费；费用收取方会在确认前逐项标明。只有你在钱包确认后才会支付。</p></div>':''}<p class="flow-error" id="wallet-feedback" role="alert">${esc(chainSession.error)}</p><div class="flow-actions">${needsResident?'<button class="btn hi2" id="wallet-resident" type="button">创建 168 居民身份</button>':''}<button class="btn ${needsResident?'':'hi2'}" id="wallet-connect" type="button">${chainSession.address?'重新检查钱包':'连接钱包'}</button><button class="btn" id="wallet-close" type="button">关闭</button></div>`;
  d.querySelector('.flow-close').onclick=closeWallet;
  $('#wallet-close').onclick=closeWallet;
  if($('#wallet-resident'))$('#wallet-resident').onclick=()=>{closeWallet();identityOnly();};
  $('#wallet-connect').onclick=async()=>{const b=$('#wallet-connect');b.disabled=true;chainSession.error='';$('#wallet-feedback').textContent='正在核验 X Layer 钱包与居民电路…';try{await connectWallet();drawWallet();if($('#flow-dialog').open)drawResidenceDialog();else if(location.hash==='#/me'||location.hash==='#/judge')route();}catch(err){chainSession.error=err.message;drawWallet();}};
}
$('#wallet-trigger').onclick=openWallet;
chainSession.provider?.on?.('accountsChanged',()=>{const wasOpen=$('#flow-dialog').open;clearWallet();chainSession.error='钱包已切换，请重新核验居民身份。';route();if(wasOpen)identityOnly();if($('#wallet-dialog').open)drawWallet();});
chainSession.provider?.on?.('chainChanged',()=>{const wasOpen=$('#flow-dialog').open;clearWallet();chainSession.error='网络已切换，请返回 X Layer 并重新核验。';route();if(wasOpen)identityOnly();if($('#wallet-dialog').open)drawWallet();});
paintWallet();
// eth_accounts does not prompt. A previously authorised wallet can be restored only after a fresh ownership read.
refreshWallet().then(()=>{if(location.hash==='#/me'||location.hash==='#/judge')route();}).catch(err=>{chainSession.error=err.message;clearWallet();});

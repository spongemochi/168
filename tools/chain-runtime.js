// X Layer identity and one-NAND resident circuit flow for the standalone preview.
// No transaction is sent until the user presses the create button in the UI.
const Chain168=(()=>{
  const chainId='0xc4';
  const factory='0x1f09daefa827f02cbb40967cc91b259763760761';
  const processor='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282';
  const transistor='0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7';
  const opener='0x536add8f30f03b69f6fbf29d425a816a0dc50106';
  const sel={cpuAt:'0x4bc7cbbd',ownerOf:'0x6352211e',balanceOf:'0x70a08231',nextId:'0x61b8ce8c',tapeoutFee:'0xadfb2b69',tapeout:'0x7bd3ac1d',mintPrice:'0x6817c76c',protocolFee:'0xb0e21e8a',balanceOf1155:'0x00fdd58e',mint:'0x1b2ef1ca',openFee:'0xc57981b5',isOpened:'0x8b508494',open:'0x0a0e5c9d'};
  const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const address=/^0x[0-9a-fA-F]{40}$/;
  const word=n=>BigInt(n).toString(16).padStart(64,'0');
  const addrWord=a=>{if(!address.test(a))throw Error('钱包地址无效。');return a.slice(2).toLowerCase().padStart(64,'0');};
  const integer=x=>BigInt(x==='0x'||!x?'0x0':x);
  const fmt=wei=>(Number(wei)/1e18).toFixed(6).replace(/\.?0+$/,'');
  const request=(p,method,params=[])=>p.request({method,params});
  const call=(p,to,data)=>request(p,'eth_call',[{to,data},'latest']);
  function findProvider(){const eth=window.ethereum;const all=[window.okxwallet,...(Array.isArray(eth?.providers)?eth.providers:[]),eth].filter(p=>p&&typeof p.request==='function');return all.find(p=>p.isOkxWallet||p.isOKExWallet)||all[0]||null;}
  async function ensureChain(p){
    if(BigInt(await request(p,'eth_chainId'))===196n)return;
    try{await request(p,'wallet_switchEthereumChain',[{chainId}]);}
    catch(e){if(e?.code!==4902)throw e;await request(p,'wallet_addEthereumChain',[{chainId,chainName:'X Layer',nativeCurrency:{name:'OKB',symbol:'OKB',decimals:18},rpcUrls:['https://rpc.xlayer.tech'],blockExplorerUrls:['https://www.oklink.com/xlayer']}]);}
    if(BigInt(await request(p,'eth_chainId'))!==196n)throw Error('请将钱包切换到 X Layer。');
  }
  async function connect(p){if(!p)throw Error('没有检测到浏览器钱包。请在装有 OKX Wallet 或 MetaMask 的浏览器中打开。');const a=await request(p,'eth_requestAccounts');if(!address.test(a?.[0]||''))throw Error('钱包没有返回有效地址。');await ensureChain(p);await assertProcessor(p);return a[0].toLowerCase();}
  async function authorized(p){if(!p)return null;const a=await request(p,'eth_accounts');return address.test(a?.[0]||'')?a[0].toLowerCase():null;}
  async function assertProcessor(p){
    if(BigInt(await request(p,'eth_chainId'))!==196n)throw Error('请将钱包切换到 X Layer。');
    const response=await call(p,factory,sel.cpuAt+word(168));
    if(!/^0x[0-9a-fA-F]{64}$/.test(response)||'0x'+response.slice(-40).toLowerCase()!==processor)throw Error('链上 168 号处理器与页面配置不一致，已停止操作。');
    const transistorResponse=await call(p,processor,'0x6fbd1719');
    if(!/^0x[0-9a-fA-F]{64}$/.test(transistorResponse)||'0x'+transistorResponse.slice(-40).toLowerCase()!==transistor)throw Error('168 晶体管合约与页面配置不一致，已停止操作。');
  }
  async function ownerOf(p,id){const response=await call(p,processor,sel.ownerOf+word(id));if(!/^0x[0-9a-fA-F]{64}$/.test(response))throw Error('无法读取电路所有者。');return '0x'+response.slice(-40).toLowerCase();}
  async function verify(p,wallet,id){await assertProcessor(p);if(BigInt(id)<=1n||!address.test(wallet))throw Error('判官 1.2.168 不能作为居民发帖，请使用其他电路。');const owner=await ownerOf(p,id);if(owner!==wallet.toLowerCase())throw Error('这个电路不属于当前钱包。');return {id:String(id),address:`${id}.2.168`,owner};}
  async function owned(p,wallet){
    await assertProcessor(p);
    const count=integer(await call(p,processor,sel.balanceOf+addrWord(wallet)));
    if(count===0n)return [];
    const last=integer(await call(p,processor,sel.nextId));
    if(last>5000n)throw Object.assign(Error('电路数量较多，请输入你持有的电路编号来核验。'),{code:'scan-limit'});
    const result=[];
    for(let start=1n;start<=last;start+=8n){
      const ids=Array.from({length:Number(last-start+1n<8n?last-start+1n:8n)},(_,i)=>start+BigInt(i));
      const owners=await Promise.all(ids.map(id=>ownerOf(p,id).catch(()=>null)));
      ids.forEach((id,i)=>{if(id!==1n&&owners[i]===wallet.toLowerCase())result.push({id:id.toString(),address:`${id}.2.168`,owner:owners[i]});});
      if(BigInt(result.length)>=count)break;
    }
    return result;
  }
  async function quote(p,wallet){
    await assertProcessor(p);
    if(integer(await call(p,processor,sel.nextId))<1n)throw Error('判官电路尚未建立，已停止居民流片。');
    const [mintPrice,protocolFee,tapeoutFee,have]=await Promise.all([
      call(p,transistor,sel.mintPrice),call(p,transistor,sel.protocolFee),call(p,processor,sel.tapeoutFee),call(p,transistor,sel.balanceOf1155+addrWord(wallet)+word(0))
    ]);
    const needMint=integer(have)===0n;
    const transistorPrice=needMint?integer(mintPrice):0n;
    const tapeoutProtocolFee=needMint?integer(protocolFee):0n;
    const mint=transistorPrice+tapeoutProtocolFee;
    const tapeout=integer(tapeoutFee);
    return {transistorPrice,tapeoutProtocolFee,mint,tapeout,total:mint+tapeout,needMint};
  }
  async function waitReceipt(p,hash){
    const start=Date.now();
    while(Date.now()-start<180000){
      const receipt=await request(p,'eth_getTransactionReceipt',[hash]);
      if(receipt){if(integer(receipt.status)!==1n)throw Error('交易已上链，但执行失败。');return receipt;}
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw Error(`等待交易确认超时，请用交易哈希 ${hash} 在区块浏览器核对。`);
  }
  async function send(p,wallet,to,data,value,onHash=()=>{}){
    const tx={from:wallet,to,data};if(value>0n)tx.value='0x'+value.toString(16);
    const hash=await request(p,'eth_sendTransaction',[tx]);onHash(hash);return waitReceipt(p,hash);
  }
  async function create(p,wallet,price,onStep=()=>{},journal={},onJournal=()=>{}){
    await assertProcessor(p);
    if((await authorized(p))!==wallet.toLowerCase())throw Error('连接的钱包已变化，请重新核验。');
    if(journal.wallet&&journal.wallet!==wallet.toLowerCase())throw Error('背书恢复记录属于另一个钱包。');
    journal.wallet=wallet.toLowerCase();
    if(journal.tapeoutTx){
      const receipt=await waitReceipt(p,journal.tapeoutTx);
      const log=(receipt.logs||[]).find(l=>l.address?.toLowerCase()===processor&&l.topics?.[0]?.toLowerCase()===transferTopic&&l.topics?.length===4&&BigInt(l.topics[1])===0n&&'0x'+l.topics[2].slice(-40).toLowerCase()===wallet.toLowerCase());
      if(!log)throw Error('背书交易缺少电路铸造日志，请保留交易哈希核对。');
      const resident=await verify(p,wallet,BigInt(log.topics[3]).toString());return {...resident,txHash:journal.tapeoutTx};
    }
    if(journal.mintTx)await waitReceipt(p,journal.mintTx);
    const current=await quote(p,wallet);
    if(current.total!==price.total||current.needMint!==price.needMint||current.transistorPrice!==price.transistorPrice||current.tapeoutProtocolFee!==price.tapeoutProtocolFee||current.tapeout!==price.tapeout)throw Error('链上费用已变化，请刷新报价后重新确认。');
    const balance=integer(await request(p,'eth_getBalance',[wallet,'latest']));
    if(balance<current.total)throw Error(`钱包 OKB 不足，至少需要 ${fmt(current.total)} OKB，另需 X Layer 网络费。`);
    if(current.needMint){onStep('正在等待钱包确认晶体管交易…');await send(p,wallet,transistor,sel.mint+word(0)+word(1),current.mint,hash=>{journal.mintTx=hash;onJournal(journal);});}
    // One NAND, two inputs, one output. Signal 2 and 3 are the two inputs.
    onStep('晶体管已准备，正在等待钱包确认电路流片…');
    const net='00000002000003';
    const data=sel.tapeout+word(0x60)+word(2)+word(1)+word(7)+net.padEnd(64,'0');
    const receipt=await send(p,wallet,processor,data,current.tapeout,hash=>{journal.tapeoutTx=hash;onJournal(journal);});
    const log=(receipt.logs||[]).find(l=>l.address?.toLowerCase()===processor&&l.topics?.[0]?.toLowerCase()===transferTopic&&l.topics?.length===4&&BigInt(l.topics[1])===0n);
    if(!log)throw Error(`流片交易已确认，但没有找到电路编号。请核对交易 ${receipt.transactionHash}。`);
    const id=BigInt(log.topics[3]).toString();
    const resident=await verify(p,wallet,id);
    return {...resident,txHash:receipt.transactionHash};
  }
  async function mailboxQuote(p,wallet,id){
    await assertProcessor(p);
    if((await ownerOf(p,id))!==wallet.toLowerCase())throw Error('当前钱包不是这枚电路的持有人。');
    const [opened,fee]=await Promise.all([
      call(p,opener,sel.isOpened+addrWord(processor)+word(id)),
      call(p,opener,sel.openFee)
    ]);
    return {opened:integer(opened)!==0n,fee:integer(fee)};
  }
  async function openMailbox(p,wallet,id,expectedFee,onStep=()=>{}){
    if((await authorized(p))!==wallet.toLowerCase())throw Error('钱包地址已变化，请重新核验。');
    const quote=await mailboxQuote(p,wallet,id);
    if(quote.opened)return {skipped:true};
    if(quote.fee!==expectedFee)throw Error('链上开通费用已变化，请重新检查报价。');
    const balance=integer(await request(p,'eth_getBalance',[wallet,'latest']));
    if(balance<quote.fee)throw Error(`钱包 OKB 不足，至少需要 ${fmt(quote.fee)} OKB，另需 X Layer 网络费。`);
    onStep('请在钱包中确认开通 '+id+'.2.168 信箱…');
    const receipt=await send(p,wallet,opener,sel.open+addrWord(processor)+word(id),quote.fee);
    const checked=await mailboxQuote(p,wallet,id);
    if(!checked.opened)throw Error('交易已有回执，但信箱尚未在当前节点显示，请稍后重新检查。');
    return {txHash:receipt.transactionHash};
  }
  return {findProvider,connect,authorized,ensureChain,assertProcessor,owned,verify,quote,create,mailboxQuote,openMailbox,waitReceipt,fmt,processor,opener};
})();

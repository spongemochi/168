import {CHUNK,chunkAt,resumeIndex,compareBytes} from './site-publish-core.mjs';
const $=id=>document.getElementById(id),E=globalThis.ethers;
const CPU='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',CONTAINER='0xf053f07efcc2ade76d35dfbb6ed7c0f8eb976d35',REG='0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6',BINDING='0x68809fd2fb343aa57d0aeb7f33defe477c9666f9',OPENER='0x536add8f30f03b69f6fbf29d425a816a0dc50106',FACTORY='0x1f09daefa827f02cbb40967cc91b259763760761';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ABI=new E.Interface(['function cpuAt(uint256) view returns(address)','function ownerOf(uint256) view returns(address)','function accountOf(address,uint256) view returns(address)','function isOpened(address,uint256) view returns(bool)','function fileInfo(address,string) view returns(uint32,string,bytes32,uint40,uint256)','function readRange(address,string,uint256,uint256) view returns(bytes)','function isOpenedContainer(address) view returns(bool)','function putFile(address,string,string,bytes32,bytes)','function appendChunk(address,string,uint256,bytes)','function setFallback(address,string)','function fallbackPath(address) view returns(string)','function isContainerLive(address) view returns(bool)','function monthlyFee() view returns(uint256)','function bind(string,address,uint256) payable']);
let manifest,files=[],provider,wallet,busy=false,verified=false;
const status=t=>$('status').textContent=t;
const rpc=(method,params=[])=>provider.request({method,params});
async function read(to,name,args=[]){const data=ABI.encodeFunctionData(name,args),value=await rpc('eth_call',[{to,data},'latest']);return ABI.decodeFunctionResult(name,value);}
async function holder(){if(BigInt(await rpc('eth_chainId'))!==196n)throw Error('请切换到 X Layer。');const accounts=await rpc('eth_accounts');if(accounts[0]?.toLowerCase()!==wallet)throw Error('钱包已切换，请重新连接。');if((await read(CPU,'ownerOf',[1]))[0].toLowerCase()!==wallet)throw Error('当前钱包没有持有 1.2.168。');}
const hex=b=>E.hexlify(b);
async function digest(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}
function row(file,message){$('files').querySelector(`[data-path="${file.path}"]`).textContent=message;}
async function fetchBytes(file){const r=await fetch(new URL('../release/site/'+file.path,import.meta.url));if(!r.ok)throw Error('发布文件缺失：'+file.path);const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length!==file.bytes||await digest(bytes)!==file.sha256)throw Error('发布包校验失败：'+file.path);return bytes;}
async function check(){
 provider=window.okxwallet||window.ethereum?.providers?.find(p=>p.isOkxWallet)||window.ethereum;
 if(!provider?.request)throw Error('请在安装钱包的 Chrome 中打开本页。');
 const accounts=await rpc('eth_requestAccounts');wallet=accounts[0]?.toLowerCase();
 if(BigInt(await rpc('eth_chainId'))!==196n)await rpc('wallet_switchEthereumChain',[{chainId:'0xc4'}]);
 await holder();
 if((await read(FACTORY,'cpuAt',[168]))[0].toLowerCase()!==CPU)throw Error('处理器配置不匹配。');
 if((await read(OPENER,'accountOf',[CPU,1]))[0].toLowerCase()!==CONTAINER)throw Error('电路容器配置不匹配。');
 if(!(await read(OPENER,'isOpened',[CPU,1]))[0]||!(await read(REG,'isOpenedContainer',[CONTAINER]))[0])throw Error('容器尚未开通。');
 for(const [target,expected] of [[REG,'0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f'],[BINDING,'0x5ebf29b80789e548907c707530c3c7607c4347df']]){
 const implementation=await rpc('eth_getStorageAt',[target,SLOT,'latest']);if('0x'+implementation.slice(-40).toLowerCase()!==expected)throw Error('官方合约实现已变化，请重新核验。');}
 const fee=(await read(BINDING,'monthlyFee'))[0],live=(await read(BINDING,'isContainerLive',[CONTAINER]))[0];
 $('wallet').textContent='已核验判官钱包：'+wallet;
 $('fee').textContent=live?'网站名字已开通，无需重复支付开通费。':'网站名字开通费：'+E.formatEther(fee)+' OKB / 30 天，由官方 DomainBinding 合约收取；另需网络费。上传交易只支付网络费。';
 $('upload').disabled=false;$('verify').disabled=false;$('activate').disabled=live||!verified;
 for(const file of files){const info=await read(REG,'fileInfo',[CONTAINER,file.path]);row(file,Number(info[4])===0?'待上传':info[2].toLowerCase()===file.sha256&&Number(info[0])===file.bytes?'待核验':'需要更新或续传');}
 status('条件已核验。点击“发布完整网站”后，请逐笔在钱包中确认；取消可稍后继续，已验证的分块会保留。');
}
async function send(to,name,args=[],value=0n){
 await holder();const tx={from:wallet,to,data:ABI.encodeFunctionData(name,args),value:'0x'+value.toString(16)};
 await rpc('eth_estimateGas',[tx]);
 const hash=await rpc('eth_sendTransaction',[tx]);status('等待交易确认：'+hash);
 for(let i=0;i<120;i++){const receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt){if(BigInt(receipt.status)!==1n)throw Error('交易执行失败：'+hash);return hash;}await new Promise(resolve=>setTimeout(resolve,1500));}
 throw Error('等待交易超时，请先在区块浏览器核验，再继续：'+hash);
}
async function verifyBytes(file,bytes,length=file.bytes){
 for(let offset=0;offset<length;offset+=CHUNK){const n=Math.min(CHUNK,length-offset);const chain=E.getBytes((await read(REG,'readRange',[CONTAINER,file.path,offset,n]))[0]);if(!compareBytes(chain,bytes.slice(offset,offset+n)))throw Error('链上字节与发布包不一致：'+file.path);}
}
async function upload(){
 verified=false;$('activate').disabled=true;
 for(const file of files){await holder();const bytes=await fetchBytes(file),info=await read(REG,'fileInfo',[CONTAINER,file.path]);let next=resumeIndex(info,file);
 if(next>0)await verifyBytes(file,bytes,Number(info[0]));
 if(next===0){row(file,'等待第一段钱包确认');status('写入文件：'+file.path+'（1 / '+file.chunks+'）');await send(REG,'putFile',[CONTAINER,file.path,file.contentType,file.sha256,hex(chunkAt(bytes,0))]);next=1;}
 for(let i=next;i<file.chunks;i++){row(file,'写入 '+(i+1)+' / '+file.chunks+' 段');status('追加文件：'+file.path+'（'+(i+1)+' / '+file.chunks+'）');await send(REG,'appendChunk',[CONTAINER,file.path,i,hex(chunkAt(bytes,i))]);}
 await verifyFile(file,bytes);row(file,'链上字节已核验');
 }
 if((await read(REG,'fallbackPath',[CONTAINER]))[0]!=='index.html')await send(REG,'setFallback',[CONTAINER,'index.html']);
 await verify();
}
async function verifyFile(file,bytes){const info=await read(REG,'fileInfo',[CONTAINER,file.path]);if(Number(info[0])!==file.bytes||info[2].toLowerCase()!==file.sha256||Number(info[4])!==file.chunks||info[1]!==file.contentType)throw Error('文件清单核验失败：'+file.path);await verifyBytes(file,bytes);}
async function verify(){for(const file of files){row(file,'核验中');await verifyFile(file,await fetchBytes(file));row(file,'链上字节已核验');}if((await read(REG,'fallbackPath',[CONTAINER]))[0]!=='index.html')throw Error('入口回退尚未设置，请继续发布。');verified=true;const live=(await read(BINDING,'isContainerLive',[CONTAINER]))[0];$('activate').disabled=live;status(live?'完整网站已上传并逐字节核验，名字已开通。请打开链上入口继续测试。':'完整网站已上传并逐字节核验。下一步开通网站名字，费用由官方合约收取。');}
async function activate(){if(!verified)throw Error('请先核验完整网站。');await holder();if((await read(BINDING,'isContainerLive',[CONTAINER]))[0])return status('名字已经开通。');const fee=(await read(BINDING,'monthlyFee'))[0];status('请在钱包确认官方名字开通费：'+E.formatEther(fee)+' OKB（30 天）及网络费。');await send(BINDING,'bind',['1.2.168.tape',CONTAINER,1],fee);if(!(await read(BINDING,'isContainerLive',[CONTAINER]))[0])throw Error('交易已确认，名字状态仍待核验。');$('activate').disabled=true;status('网站与名字均已发布。打开链上入口测试封存与到期揭示。');}
function action(id,fn){$(id).onclick=async()=>{if(busy)return;busy=true;const button=$(id);button.disabled=true;try{await fn();}catch(err){status(err.code===4001?'你取消了钱包确认。已上传的文件保留，可重新发布继续。':err.message);}finally{busy=false;if(id==='check'||id==='upload'||id==='verify')button.disabled=false;else if(id==='activate')button.disabled=!verified;}};}
try{manifest=await(await fetch(new URL('../release/manifest.json',import.meta.url))).json();if(manifest.name!=='1.2.168.tape'||manifest.container!==CONTAINER||manifest.registry!==REG||manifest.chainId!==196)throw Error('发布清单目标不匹配。');files=manifest.files;for(const f of files){if(!/^[a-zA-Z0-9_./-]+$/.test(f.path)||f.path.split('/').some(x=>['','..','.'].includes(x)))throw Error('发布路径异常。');await fetchBytes(f);const tr=document.createElement('tr');for(const text of [f.path,(f.bytes/1024).toFixed(1)+' KB','本地校验通过']){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.lastChild.dataset.path=f.path;$('files').append(tr);}$('summary').textContent=files.length+' 个文件 · '+(manifest.totalBytes/1024).toFixed(1)+' KB · 首次上传最多 '+manifest.transactions+' 笔写入交易；入口文件最后写入。';$('check').disabled=false;}catch(err){status(err.message);}
action('check',check);action('upload',upload);action('verify',verify);action('activate',activate);

// Public, read-only evidence collection. No keys, signing, broadcast or Cloudflare access.
import {parseArgs} from 'node:util';
import {installReadOnlyProxy} from './scoring-curl.mjs';
import {tchain} from '../vendor/tapesend.bundle.mjs';
const {values}=parseArgs({options:{proxy:{type:'string'},'deployment-tx':{type:'string'},'window-close':{type:'string'},help:{type:'boolean'}}});
if(values.help){
 console.log('node tools/check-hackathon-evidence.mjs [--proxy URL] [--deployment-tx 0xHASH] [--window-close ISO_DATE_WITH_TIMEZONE]');
 console.log('核对工厂目录、当前 mintPrice、真实流片日志/时间；可选读取创建交易。初始供应与上限仍需部署参数及 ABI 核对。');
 process.exit(0);
}
const deployment=values['deployment-tx'];
if(deployment&&!/^0x[0-9a-fA-F]{64}$/.test(deployment))throw Error('invalid deployment transaction hash');
const close=values['window-close'];
const deadline=close?Date.parse(close)/1000:null;
if(close&&(!/(Z|[+-]\d{2}:\d{2})$/.test(close)||!Number.isSafeInteger(deadline)))throw Error('window-close requires ISO time with timezone');
installReadOnlyProxy(values.proxy);
const chain=tchain.createTapeSendChains({fetchImpl:globalThis.fetch}).get(196);
const processor='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',factory='0x1f09daefa827f02cbb40967cc91b259763760761',transistor='0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7';
const wallet='0x5f829a59f88c13264b408ab5cb732cd3b5bbe3b2';
const tapeout='0x41771e7398b0aaf3dccbf28ce617eeb8202d21c45ded7e99bfe22fefb5285d6b';
const word=v=>BigInt(v).toString(16).padStart(64,'0'),hex=v=>'0x'+BigInt(v).toString(16),low=v=>String(v||'').toLowerCase();
const output={source:'User-run strict multi-node public chain reads',processor,factory,transistor,claimedDeploymentWallet:wallet,walletSource:'user statement; creation transaction required',deadline:close||null,checks:{},missing:['Initial supply and deployment-time price/cap settings','Deployment-time public disclosure and parameter mutability proof'],qualificationComplete:false};
async function read(method,params,normalize=v=>v){
 const [r]=await chain.rpc.many([{method,params,normalize}],{all:true});
 if(!r?.ok||(r.raw??r.value)==null)throw Error('RPC quorum did not verify '+method);
 return r.raw??r.value;
}
async function stage(name,fn){
 console.log('\n【'+name+'】');
 try{output.checks[name]=await fn();console.log(JSON.stringify(output.checks[name],null,2));}
 catch(e){output.checks[name]={error:String(e.message)};console.log('读取未通过：'+e.message);process.exitCode=1;}
}
console.log('只读检查参赛凭证：不读取密钥、不发交易；当前 getter 不证明初始发行参数。');
await chain.assertChain();
const safe=await chain.finalizedBlock();
if(safe===null)throw Error('X Layer safe block quorum unavailable');
output.safeBlock=String(safe);const block=hex(safe);
await stage('工厂与晶体管关联',async()=>{
 const actual=await read('eth_call',[{to:factory,data:'0x4bc7cbbd'+word(168)},block]);
 const token=await read('eth_call',[{to:processor,data:'0x6fbd1719'},block]);
 if(low(actual)!=='0x'+processor.slice(2).padStart(64,'0')||low(token)!=='0x'+transistor.slice(2).padStart(64,'0'))throw Error('factory or transistor address mismatch');
 return {processorNumber:168,processor,transistor,verified:true,scope:'Factory directory at the specified safe block; not creation-transaction provenance'};
});
await stage('当前单价（不是部署时单价）',async()=>{
 const raw=await read('eth_call',[{to:transistor,data:'0x6817c76c'},block]);
 if(!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error('invalid price ABI response');
 const n=BigInt(raw);return {mintPriceWei:n.toString(),mintPriceOKB:String(n/10n**18n)+'.'+String(n%10n**18n).padStart(18,'0'),block};
});
await stage('真实电路流片与时间',async()=>{
 const receipt=await read('eth_getTransactionReceipt',[tapeout],tchain.normalizeReceipt);
 if(BigInt(receipt.status)!==1n||BigInt(receipt.blockNumber)>safe)throw Error('tapeout not successful at safe block');
 const tx=await read('eth_getTransactionByHash',[tapeout],v=>v&&({hash:low(v.hash),from:low(v.from),to:low(v.to),input:low(v.input),blockNumber:v.blockNumber}));
 if(low(tx.to)!==processor||low(tx.from)!==wallet)throw Error('tapeout processor or author mismatch');
 const mint=receipt.logs.some(l=>low(l.address)===processor&&l.topics.length===4&&low(l.topics[0])==='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'&&BigInt(l.topics[1])===0n&&low(l.topics[2])==='0x'+wallet.slice(2).padStart(64,'0')&&BigInt(l.topics[3])===3n);
 if(!mint)throw Error('circuit #3 mint log missing');
 const header=await read('eth_getBlockByNumber',[hex(receipt.blockNumber),false],tchain.normalizeHeader);
 const timestamp=Number(BigInt(header.timestamp));
 return {tx:tapeout,circuitId:'3',from:low(tx.from),blockNumber:String(BigInt(receipt.blockNumber)),timestamp,atBeijing:new Date(timestamp*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),mintLogVerified:true,beforeProvidedDeadline:deadline===null?null:timestamp<deadline};
});
if(deployment)await stage('提供的处理器创建交易',async()=>{
 const receipt=await read('eth_getTransactionReceipt',[deployment],tchain.normalizeReceipt);
 const tx=await read('eth_getTransactionByHash',[deployment],v=>v&&({hash:low(v.hash),from:low(v.from),to:low(v.to),input:low(v.input),blockNumber:v.blockNumber}));
 if(BigInt(receipt.status)!==1n||BigInt(receipt.blockNumber)>safe||low(tx.from)!==wallet||low(tx.to)!==factory)throw Error('transaction is not a successful direct factory call from the claimed wallet');
 return {tx:deployment,from:low(tx.from),to:low(tx.to),input:tx.input,blockNumber:String(BigInt(receipt.blockNumber)),factoryCallVerified:true,processorCreationAndParametersVerified:false,note:'Factory call alone does not prove which processor was created; decode creation events/ABI and initialization parameters next.'};
});
else output.missing.push('Processor creation transaction hash');
if(deadline===null)output.missing.push('Confirmed official closing time and mint-time comparison');
console.log('\n【参赛凭证汇总】\n'+JSON.stringify(output,null,2));
console.log('读取结果仅供补齐凭证；本工具不宣布全部参赛资格通过。');

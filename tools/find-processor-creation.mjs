// Locates a historical deployment candidate using public RPC only.
// Does not claim to decode initial issuance parameters or read wallet keys.
import {parseArgs} from 'node:util';
import {installReadOnlyProxy} from './scoring-curl.mjs';
import {tchain} from '../vendor/tapesend.bundle.mjs';
import {pathToFileURL} from 'node:url';
export async function findCodeBoundary(hasCode,upper,onProgress=()=>{}){
 let lo=0n,hi=BigInt(upper);
 if(hi<=0n||!await hasCode(hi))throw Error('no processor code at the upper bound');
 if(await hasCode(0n))throw Error('processor already has code at genesis; ordinary deployment search does not apply');
 let step=0;
 while(hi-lo>1n){
  const mid=(lo+hi)/2n;
  if(await hasCode(mid))hi=mid;else lo=mid;
  onProgress({step:++step,low:lo.toString(),high:hi.toString()});
 }
 return hi;
}
const PROCESSOR='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',FACTORY='0x1f09daefa827f02cbb40967cc91b259763760761',TOKEN='0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7';
const WALLET='0x5f829a59f88c13264b408ab5cb732cd3b5bbe3b2';
const hex=v=>'0x'+BigInt(v).toString(16),word=v=>BigInt(v).toString(16).padStart(64,'0');
const lower=v=>String(v||'').toLowerCase();
async function main(){
 const {values}=parseArgs({options:{proxy:{type:'string'},help:{type:'boolean'}}});
 if(values.help){console.log('node tools/find-processor-creation.mjs [--proxy URL]\n只读查询处理器代码出现的区块与工厂交易候选；约 27 轮定位，逐轮输出。');return;}
 installReadOnlyProxy(values.proxy);
 const chain=tchain.createTapeSendChains({fetchImpl:globalThis.fetch}).get(196);
 const read=async(method,params,normalize=v=>v)=>{
  const [r]=await chain.rpc.many([{method,params,normalize}],{all:true});
  if(!r?.ok||(r.raw??r.value)==null)throw Error('节点未核验 '+method+' '+JSON.stringify(params));
  return r.raw??r.value;
 };
 console.log('只读查找处理器创建交易；不读取密钥、不发送交易。');
 await chain.assertChain();
 const safe=await chain.finalizedBlock();if(safe===null)throw Error('safe block quorum unavailable');
 const upper=safe<72360297n?safe:72360297n; // Already verified circuit-mint block: processor must exist by here.
 const hasCode=async(n)=>{
  const code=await read('eth_getCode',[PROCESSOR,hex(n)]);
  if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(code))throw Error('malformed eth_getCode response');
  return code!=='0x';
 };
 const found=await findCodeBoundary(hasCode,upper,p=>console.log('定位 '+p.step+'：候选区块范围 '+p.low+'–'+p.high));
 if(await hasCode(found-1n)||!await hasCode(found))throw Error('code boundary changed or was not verified');
 const expected='0x'+PROCESSOR.slice(2).padStart(64,'0');
 const directory=await read('eth_call',[{to:FACTORY,data:'0x4bc7cbbd'+word(168)},hex(found)]);
 if(lower(directory)!==expected)throw Error('factory cpuAt(168) does not match at candidate block');
 const block=await read('eth_getBlockByNumber',[hex(found),true],b=>({
  ...tchain.normalizeHeader(b),
  factoryCalls:b.transactions.filter(tx=>typeof tx==='object'&&lower(tx.to)===FACTORY).map(tx=>({hash:lower(tx.hash),from:lower(tx.from),to:lower(tx.to),input:lower(tx.input),blockNumber:String(BigInt(tx.blockNumber))}))
 }));
 const candidates=[];
 for(const tx of block.factoryCalls){
  const receipt=await read('eth_getTransactionReceipt',[tx.hash],tchain.normalizeReceipt);
  if(BigInt(receipt.status)!==1n||BigInt(receipt.blockNumber)!==found||lower(receipt.blockHash)!==lower(block.hash))continue;
  const factoryLogs=receipt.logs.filter(l=>lower(l.address)===FACTORY);
  const referencesProcessor=factoryLogs.some(l=>[l.data,...l.topics].some(v=>lower(v).includes(PROCESSOR.slice(2))));
  const processorLogs=receipt.logs.filter(l=>lower(l.address)===PROCESSOR||lower(l.address)===TOKEN);
  if(!referencesProcessor&&!processorLogs.length)continue;
  candidates.push({...tx,fromMatchesClaimedWallet:tx.from===WALLET,factoryEventReferencesProcessor:referencesProcessor,factoryLogs,processorAndTokenLogs:processorLogs});
 }
 if(!candidates.length)throw Error('代码边界已找到：'+found+'；未找到可关联的直接工厂调用，请保留此区块号继续核对。');
 const timestamp=Number(BigInt(block.timestamp));
 const result={chainId:196,processor:PROCESSOR,factory:FACTORY,codeAppearanceBlock:found.toString(),blockHash:block.hash,timestamp,atBeijing:new Date(timestamp*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),claimedDeploymentWallet:WALLET,candidates,scope:'Code boundary assumes no historical destruction/recreation. Candidate receipts and factory directory verified; factory creation-event ABI and initial issuance parameters still require decoding.',initialIssuanceParametersVerified:false};
 console.log('\n【创建交易候选与公开日志】\n'+JSON.stringify(result,null,2));
 console.log('定位完成。请贴以上候选结果，继续核对创建事件、初始供应、单价和上限。');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('读取未完成：'+e.message);process.exitCode=1;});

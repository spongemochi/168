// Read-only X Layer identity checks. Transactions and wallet prompting are
// intentionally separate from these queries so callers cannot confuse a
// local profile with a circuit controlled by the connected wallet.
export const XLAYER = Object.freeze({
  chainId: 196,
  factory: '0x1f09daefa827f02cbb40967cc91b259763760761',
  opener: '0x536add8f30f03b69f6fbf29d425a816a0dc50106',
  processorNumber: 168,
  expectedProcessor: '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282',
});
const SELECTOR = Object.freeze({cpuAt:'0x4bc7cbbd',ownerOf:'0x6352211e',accountOf:'0x0c1905e5',isOpened:'0x8b508494',balanceOf:'0x70a08231',nextId:'0x61b8ce8c'});
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const word = value => BigInt(value).toString(16).padStart(64,'0');
const addressWord = value => {
  if(!ADDRESS.test(value))throw new TypeError('invalid address');
  return value.slice(2).toLowerCase().padStart(64,'0');
};
function decodedAddress(value){
  if(typeof value!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value))throw new Error('invalid ABI address response');
  if(!/^0+$/.test(value.slice(2,26)))throw new Error('invalid ABI address padding');
  return `0x${value.slice(26).toLowerCase()}`;
}
function decodedBool(value){
  if(value!==`0x${'0'.repeat(63)}0`&&value!==`0x${'0'.repeat(63)}1`)throw new Error('invalid ABI boolean response');
  return value.endsWith('1');
}
async function request(provider,method,params=[]){
  if(!provider||typeof provider.request!=='function')throw new TypeError('EIP-1193 provider required');
  return provider.request({method,params});
}
async function read(provider,to,data,block='safe'){
  return request(provider,'eth_call',[{to,data},block]);
}
export async function assertXLayer(provider){
  const chainId=await request(provider,'eth_chainId');
  if(typeof chainId!=='string'||!/^0x[0-9a-fA-F]+$/.test(chainId)||BigInt(chainId)!==196n){
    throw Object.assign(new Error('请将钱包切换到 X Layer'),{code:'wrong-chain'});
  }
}
export async function processor168(provider,block='safe'){
  await assertXLayer(provider);
  const actual=decodedAddress(await read(provider,XLAYER.factory,SELECTOR.cpuAt+word(XLAYER.processorNumber),block));
  if(actual!==XLAYER.expectedProcessor){
    throw Object.assign(new Error('链上的 168 号处理器与项目配置不一致'),{code:'processor-mismatch',actual});
  }
  return actual;
}
export async function circuitIdentity(provider,tokenId,{wallet,block='safe'}={}){
  const id=BigInt(tokenId);
  if(id<1n||id>10n**18n)throw new RangeError('invalid circuit ID');
  const processor=await processor168(provider,block);
  const owner=decodedAddress(await read(provider,processor,SELECTOR.ownerOf+word(id),block));
  const args=addressWord(processor)+word(id);
  const container=decodedAddress(await read(provider,XLAYER.opener,SELECTOR.accountOf+args,block));
  const opened=decodedBool(await read(provider,XLAYER.opener,SELECTOR.isOpened+args,block));
  const belongsToWallet=wallet==null?null:ADDRESS.test(wallet)&&owner===wallet.toLowerCase();
  return {name:`${id}.2.168`,tokenId:id.toString(),chainId:196,processor,owner,container,opened,belongsToWallet,block};
}

// A resident is a circuit NFT currently held by this wallet on processor 168.
// Display names and browser storage never confer ownership.
export async function ownedResidentCircuits(provider,wallet,{block='latest',scanLimit=5000}={}){
  if(!ADDRESS.test(wallet))throw new TypeError('invalid wallet address');
  const processor=await processor168(provider,block);
  const count=BigInt(await read(provider,processor,SELECTOR.balanceOf+addressWord(wallet),block));
  if(count===0n)return [];
  const last=BigInt(await read(provider,processor,SELECTOR.nextId,block));
  if(last>BigInt(scanLimit))throw Object.assign(new Error('链上电路数量较多，请输入你的电路编号进行核验。'),{code:'scan-limit'});
  const owned=[];
  for(let first=1n;first<=last;first+=8n){
    const ids=Array.from({length:Number((last-first+1n)<8n?(last-first+1n):8n)},(_,i)=>first+BigInt(i));
    const owners=await Promise.all(ids.map(async id=>{
      try{return decodedAddress(await read(provider,processor,SELECTOR.ownerOf+word(id),block));}
      catch{return null;}
    }));
    ids.forEach((id,i)=>{if(id!==1n&&owners[i]===wallet.toLowerCase())owned.push({tokenId:id.toString(),address:`${id}.2.168`,owner:owners[i],processor});});
    if(BigInt(owned.length)>=count)break;
  }
  return owned;
}

export async function verifyResidentCircuit(provider,wallet,tokenId,{block='latest'}={}){
  if(!ADDRESS.test(wallet))throw new TypeError('invalid wallet address');
  const id=BigInt(tokenId);
  if(id<=1n||id>10n**18n)throw new RangeError('judge circuit cannot be a resident');
  const processor=await processor168(provider,block);
  const owner=decodedAddress(await read(provider,processor,SELECTOR.ownerOf+word(id),block));
  if(owner!==wallet.toLowerCase())throw Object.assign(new Error('这个电路不属于当前钱包。'),{code:'not-owner'});
  return {tokenId:id.toString(),address:`${id}.2.168`,owner,processor};
}

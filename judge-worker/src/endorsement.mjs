import ethers from '../vendor/ethers.cjs';
import {PROCESSOR} from '../../app/scoring/rules.mjs';
const TRANSISTOR='0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7';
const hex=n=>'0x'+BigInt(n).toString(16),word=n=>BigInt(n).toString(16).padStart(64,'0');
const lower=x=>String(x||'').toLowerCase();
const transfer=ethers.id('Transfer(address,address,uint256)'),burn=ethers.id('TransferSingle(address,address,address,uint256,uint256)');
const net='0x7bd3ac1d'+word(96)+word(2)+word(1)+word(7)+'00000002000003'.padEnd(64,'0');
async function read(chain,method,params){
  const [r]=await chain.rpc.many([{method,params,normalize:v=>v}],{all:true});
  if(!r?.ok||(r.raw??r.value)==null)throw Error('endorsement RPC unavailable: '+method);return r.raw??r.value;
}
export async function verifyEndorsement(chain,row,slot){
  const block=hex(row.committed_block);
  const author=await chain.resolveEndpoint(row.author_container,{block,skipFreshness:true});
  if(author.status!=='ok'||lower(author.circuits)!==PROCESSOR||lower(author.endpoint)!==row.author_endpoint||BigInt(author.tokenId)<=1n||String(author.tokenId)===slot.circuitId)throw Error('endorsement must differ from resident identity');
  const wallet=lower(author.holder);
  const [receipt,tx,owner]=await Promise.all([
    read(chain,'eth_getTransactionReceipt',[slot.tapeoutTx]),read(chain,'eth_getTransactionByHash',[slot.tapeoutTx]),
    read(chain,'eth_call',[{to:PROCESSOR,data:'0x6352211e'+word(slot.circuitId)},block])]);
  if(BigInt(receipt.status)!==1n||lower(receipt.transactionHash)!==slot.tapeoutTx||BigInt(receipt.blockNumber)>=BigInt(row.committed_block)||
    lower(tx.to)!==PROCESSOR||lower(tx.from)!==wallet||lower(tx.input)!==net||lower(owner)!=='0x'+wallet.slice(2).padStart(64,'0'))throw Error('endorsement transaction or historical owner mismatch');
  const mint=receipt.logs?.some(l=>lower(l.address)===PROCESSOR&&l.topics?.length===4&&lower(l.topics[0])===transfer&&BigInt(l.topics[1])===0n&&lower(l.topics[2])==='0x'+wallet.slice(2).padStart(64,'0')&&BigInt(l.topics[3])===BigInt(slot.circuitId));
  const consumed=receipt.logs?.some(l=>lower(l.address)===TRANSISTOR&&l.topics?.length===4&&lower(l.topics[0])===burn&&lower(l.topics[2])==='0x'+wallet.slice(2).padStart(64,'0')&&BigInt(l.topics[3])===0n&&lower(l.data)==='0x'+word(0)+word(1));
  if(!mint||!consumed)throw Error('missing minted circuit or one-NAND burn evidence');
  // Attribution uses the actual commitment transaction too, not today's holder.
  const page=await chain.inbox(row.judgeEndpoint,{before:row.inbox_index+1,limit:1,block});
  const entry=page.items.find(e=>e.id===row.id);if(!entry)throw Error('original commitment missing');
  const message=await chain.fetchMessage(entry);
  const original=await read(chain,'eth_getTransactionByHash',[message.txHint]);
  if(lower(original.from)!==wallet)throw Error('commitment submitter differs from historical holder');
  return {authorWallet:wallet,residentId:String(author.tokenId)};
}

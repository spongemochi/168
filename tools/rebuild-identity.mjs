import {PROCESSOR} from '../app/scoring/rules.mjs';

// Verify the known processor index at the SAME historical commitment block.
// This seeds the SDK's own strictly read identity cache, avoiding an unrelated
// 80-entry reverse scan. It does not substitute today's registry or ownership.
export async function verifyHistoricalProcessor(chain,row){
  if(chain.chainId!==196||!Number.isSafeInteger(row.committed_block)||row.committed_block<=0)throw Error('invalid historical X Layer block');
  await chain.assertChain();
  const block='0x'+BigInt(row.committed_block).toString(16);
  const processor=await chain.identity.cpuAt(168n,block);
  if(processor?.toLowerCase()!==PROCESSOR)throw Error('historical processor 168 does not match the committed protocol');
  return {processor,block};
}

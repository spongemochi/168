// Recover old false rejections without trusting them or altering on-chain messages.
import {mod} from '../../vendor/tapesend.bundle.mjs';
import {CHAIN_ID,HUB} from './protocol.mjs';
export async function scanStart(db,stream,next,judgeEndpoint){
  if(stream!=='in'||next===0)return next;
  const rows=await db.prepare(`SELECT id FROM chain_records WHERE direction='in' AND record_type='commitment' AND valid=0
    AND (reason LIKE '可用节点不足：%' OR reason LIKE '可用节点不足:%' OR reason LIKE '节点返回的结果不一致%'
      OR reason LIKE 'Not enough nodes:%' OR reason LIKE 'Nodes returned different results%')`).all();
  const pending=new Set(rows.results.map(r=>r.id.toLowerCase()));
  let start=next;
  // Inbox message IDs deterministically bind endpoint + index. The rejected
  // record did not store an index; derive it rather than editing the record.
  for(let index=next-1;index>=0&&pending.size;index--){
    const id=mod.messageId(CHAIN_ID,HUB,judgeEndpoint,index).toLowerCase();
    if(pending.delete(id))start=index;
  }
  if(pending.size)throw Error('rejected commitment ID does not match the indexed judge inbox');
  return start;
}

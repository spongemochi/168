import {scoreType} from '../../app/scoring/rules.mjs';
import {ingestScore} from './scoring.mjs';
import { mod, tchain } from '../../vendor/tapesend.bundle.mjs';
import { parseRef } from '../../app/protocol/scv1-ref.mjs';
import { CHAIN_ID, HUB, JUDGE_NAME, commitmentEntry, linkedRecord, strictContent } from './protocol.mjs';
import {scanStart} from './index-retry.mjs';

const lower = value => String(value || '').toLowerCase();
const chainFor = () => tchain.createTapeSendChains().get(CHAIN_ID);

async function saveRecord(db, entry, message, direction, type, caseId, error) {
  await db.prepare(`INSERT OR REPLACE INTO chain_records
    (id,direction,record_type,case_id,valid,reason,block_number,tx_hint)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(lower(entry.id), direction, type, caseId, error ? 0 : 1, error || null,
      entry.blockNumber, message.txHint || null).run();
}

async function ingest(db, chain, entry, message, direction, judgeEndpoint, safeHex) {
  if(scoreType(message.ref)){
    try{await ingestScore(db,chain,entry,message,direction);await saveRecord(db,entry,message,direction,'score-'+scoreType(message.ref),strictContent(mod.parsePayload(message.payload).content).score.caseId,null);}
    catch(error){await saveRecord(db,entry,message,direction,'score-'+scoreType(message.ref),null,String(error.message));}
    return;
  }
  const ref = parseRef(message.ref);
  if (!ref || !['commitment', 'reveal', 'verdict'].includes(ref.type)) return;
  let author;
  if(ref.type==='commitment'&&direction==='in'&&lower(entry.to)===lower(judgeEndpoint)){
    // Read failures are retryable infrastructure failures, not invalid content.
    // Keep this outside the format-validation catch so the cursor cannot skip it.
    try{author=await chain.resolveEndpoint(entry.from,{block:`0x${BigInt(entry.blockNumber).toString(16)}`,skipFreshness:true});}
    catch(error){throw Error('resident.identity: '+String(error.message||error));}
  }
  let caseId = null;
  try {
    if (ref.type === 'commitment') {
      if (direction !== 'in' || lower(entry.to) !== lower(judgeEndpoint)) throw Error('commitment is not in judge inbox');
      if (author.status !== 'ok' || author.chainId !== CHAIN_ID ||
          lower(author.circuits) !== '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282' ||
          BigInt(author.tokenId) === 1n || lower(author.container) !== lower(entry.from)) {
        throw Error('commitment author is not a 168 resident circuit');
      }
      const c = commitmentEntry(entry, message);
      caseId = c.id;
      await db.prepare(`INSERT OR IGNORE INTO cases
        (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(c.id,c.inboxIndex,c.authorEndpoint,c.authorContainer,c.kind,c.openTime,c.ref,c.payloadHex,c.blockNumber,c.timestamp).run();
      await db.prepare('UPDATE cases SET resident_id=? WHERE id=? AND resident_id IS NULL').bind(String(author.tokenId),c.id).run();
    } else {
      const p = mod.parsePayload(message.payload);
      if (p.kind !== 'public') throw Error('linked record is not public');
      const scv = strictContent(p.content).scv;
      if (scv?.commitment?.chainId !== CHAIN_ID || lower(scv.commitment.to) !== lower(judgeEndpoint) ||
          !Number.isSafeInteger(scv.commitment.inboxIndex) || scv.commitment.inboxIndex < 0) throw Error('invalid commitment pointer');
      caseId = lower(mod.messageId(CHAIN_ID,HUB,judgeEndpoint,scv.commitment.inboxIndex));
      const c = await db.prepare('SELECT * FROM cases WHERE id = ?').bind(caseId).first();
      if (!c) throw Error('commitment has not been indexed');
      const record = linkedRecord(entry,message,ref.type,c,judgeEndpoint);
      if (ref.type === 'reveal') {
        if (direction === 'in' && lower(entry.to) !== lower(judgeEndpoint)) throw Error('reveal was not sent to judge');
        if (direction === 'out' && lower(entry.to) !== lower(c.author_endpoint)) throw Error('judge reveal was not sent to author');
        await db.prepare(`UPDATE cases SET reveal_id = ?, revealed_body = ?, revealed_condition = ?, revealed_claim = ?, revealed_scoring = ?
          WHERE id = ? AND reveal_id IS NULL`)
          .bind(lower(entry.id),record.body,record.condition,JSON.stringify(record.claim),JSON.stringify(record.scoring),caseId).run();
      } else {
        if (direction !== 'out') throw Error('designated judge verdict must be in outbox');
        if (!c.reveal_id && !record.reveal && record.outcome !== 'undecidable') throw Error('hit/miss requires verified reveal');
        if (entry.timestamp < c.open_time) throw Error('early verdict is not final');
        await db.prepare(`UPDATE cases SET
          reveal_id = COALESCE(reveal_id, ?), revealed_body = COALESCE(revealed_body, ?),
          revealed_condition = COALESCE(revealed_condition, ?), revealed_claim = COALESCE(revealed_claim, ?),
          revealed_scoring = COALESCE(revealed_scoring, ?), verdict_id = ?, outcome = ?, verdict_reason = ?, verdict_sources = ?
          WHERE id = ? AND verdict_id IS NULL`)
          .bind(record.reveal ? lower(entry.id) : null,record.reveal?.body ?? null,
            record.reveal?.condition ?? null,record.reveal ? JSON.stringify(record.reveal.claim) : null,
            record.reveal ? JSON.stringify(record.reveal.scoring) : null,lower(entry.id),record.outcome,record.reason,JSON.stringify(record.sources),caseId).run();
      }
    }
    await saveRecord(db,entry,message,direction,ref.type,caseId,null);
  } catch (error) {
    await saveRecord(db,entry,message,direction,ref.type,caseId,String(error.message || error));
  }
}

async function scanStream(db, chain, stream, judge, safeHex, safeTime, pageSize) {
  const cursor = await db.prepare('SELECT next_index FROM cursors WHERE stream = ?').bind(stream).first();
  const next = await scanStart(db,stream,cursor?.next_index??0,judge.endpoint);
  const page = stream === 'in'
    ? await chain.inbox(judge.endpoint,{before:next+pageSize,limit:pageSize,block:safeHex})
    : await chain.outbox(judge.container,{before:next+pageSize,limit:pageSize,block:safeHex});
  if (page.count < next) throw Error(`${stream} directory shrank below indexed cursor`);
  const end = Math.min(page.count,next+pageSize);
  const expected = end-next;
  // A newest-first page also contains previously indexed entries when the
  // requested upper bound exceeds the directory count. Only consume [next,end).
  const entries = page.items.filter(entry => entry.index >= next && entry.index < end);
  const indexes = entries.map(entry=>Number(entry.index)).sort((a,b)=>a-b);
  if (entries.length !== expected || indexes.some((index,i)=>index!==next+i)) {
    throw Error(`incomplete ${stream} page`);
  }
  for (const entry of entries.sort((a,b)=>Number(a.index)-Number(b.index))) {
    if (entry.blockNumber > Number(BigInt(safeHex))) throw Error('message exceeds safe block');
    const message = await chain.fetchMessage(entry); // A failed digest check stops the cursor.
    await ingest(db,chain,entry,message,stream,judge.endpoint,safeHex);
  }
  await db.prepare(`INSERT INTO cursors (stream,next_index,safe_block,safe_timestamp,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(stream) DO UPDATE SET next_index=excluded.next_index,safe_block=excluded.safe_block,
      safe_timestamp=excluded.safe_timestamp,updated_at=excluded.updated_at`)
    .bind(stream,end,Number(BigInt(safeHex)),safeTime,Math.floor(Date.now()/1000)).run();
  return {stream,processed:expected,nextIndex:end,total:page.count};
}

export async function syncJudge(db,{chain=chainFor(),pageSize=25}={}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw Error('invalid page size');
  const safe = await chain.finalizedBlock();
  if (safe === null) throw Error('X Layer safe block quorum unavailable');
  const safeHex = `0x${safe.toString(16)}`;
  const [header] = await chain.rpc.many([{method:'eth_getBlockByNumber',params:[safeHex,false],
    normalize:value=>({hash:String(value.hash).toLowerCase(),timestamp:BigInt(value.timestamp).toString()})}],{all:true});
  if (!header.ok || !header.raw) throw Error('X Layer safe block timestamp quorum unavailable');
  const safeTime = Number(header.raw.timestamp);
  const judge = await chain.resolveEndpoint(JUDGE_NAME,{block:safeHex,skipFreshness:true});
  if (judge.status !== 'ok' || judge.chainId !== CHAIN_ID || !judge.endpoint ||
      lower(judge.circuits) !== '0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282') {
    throw Error('judge endpoint unavailable or belongs to another processor at safe block');
  }
  const inbox = await scanStream(db,chain,'in',judge,safeHex,safeTime,pageSize);
  const outbox = await scanStream(db,chain,'out',judge,safeHex,safeTime,pageSize);
  // Upgrade older indexed records without attributing them to today's owner.
  const missing=await db.prepare('SELECT id,author_container,author_endpoint,committed_block FROM cases WHERE resident_id IS NULL ORDER BY committed_block LIMIT 5').all();
  for(const row of missing.results){
    try{
      const author=await chain.resolveEndpoint(row.author_container,{block:`0x${BigInt(row.committed_block).toString(16)}`,skipFreshness:true});
      if(author.status==='ok'&&author.chainId===CHAIN_ID&&lower(author.circuits)==='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282'&&lower(author.endpoint)===row.author_endpoint&&BigInt(author.tokenId)>1n)
        await db.prepare('UPDATE cases SET resident_id=? WHERE id=? AND resident_id IS NULL').bind(String(author.tokenId),row.id).run();
    }catch{/* Retry the historical identity lookup next run; other work can continue. */}
  }
  return {safeBlock:Number(safe),safeBlockTime:safeTime,judgeEndpoint:judge.endpoint,inbox,outbox};
}

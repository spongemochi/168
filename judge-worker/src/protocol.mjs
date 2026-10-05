import { mod } from '../../vendor/tapesend.bundle.mjs';
import { linkedRef, parseRef } from '../../app/protocol/scv1-ref.mjs';

export const JUDGE_NAME = '1.2.168';
export const CHAIN_ID = 196;
export const HUB = '0xe61a9c7213a6aa616c246a2b569e555b417b25ee';
const HEX32 = /^0x[0-9a-f]{64}$/;
const normalize = value => String(value || '').toLowerCase();

export function strictContent(bytes) {
  const decoded = mod.decodeContent(bytes);
  if (decoded.kind !== 'message') throw Error('unsupported TAP-10 content');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function commitmentEntry(entry, message) {
  const ref = parseRef(message.ref);
  if (ref?.type !== 'commitment' || ref.malformed || ref.openTime <= 0n || ref.openTime > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw Error('invalid SCV1 commitment ref');
  }
  if (mod.parsePayload(message.payload).kind !== 'sealed') throw Error('SCV1 commitment is not sealed');
  return { id: normalize(entry.id), inboxIndex: entry.index, authorEndpoint: normalize(entry.fromEndpoint),
    authorContainer: normalize(entry.from), kind: ref.kind, openTime: Number(ref.openTime),
    ref: normalize(message.ref), payloadHex: mod.bytesToHex(message.payload),
    blockNumber: entry.blockNumber, timestamp: entry.timestamp };
}

function revealContent(key, commitment, judgeEndpoint) {
  if (!HEX32.test(key)) throw Error('invalid reveal key');
  const revealed = strictContent(mod.openWithContentKey({
    payload: mod.hexToBytes(commitment.payload_hex), key,
    to: judgeEndpoint, from: commitment.author_endpoint, hub: HUB, ref: commitment.commitment_ref,
  }));
  if (revealed.scv?.v !== 1 || revealed.scv.type !== 'commitment' || revealed.scv.kind !== commitment.kind ||
      revealed.scv.open !== commitment.open_time || typeof revealed.scv.condition !== 'string') {
    throw Error('revealed content does not match commitment metadata');
  }
  return { body: revealed.body, condition: revealed.scv.condition, claim: revealed.scv.claim ?? null, scoring: revealed.scv.scoringVersion ? {version:revealed.scv.scoringVersion,slot:revealed.scv.slot} : null };
}

export function linkedRecord(entry, message, recordType, commitment, judgeEndpoint) {
  const ref = parseRef(message.ref);
  if (ref?.type !== recordType || normalize(message.ref) !== linkedRef(recordType, commitment.id)) throw Error('SCV1 linked ref mismatch');
  const parsed = mod.parsePayload(message.payload);
  if (parsed.kind !== 'public') throw Error('linked record must be public');
  const content = strictContent(parsed.content);
  const scv = content.scv;
  if (scv?.v !== 1 || scv.type !== recordType || scv.commitment?.chainId !== CHAIN_ID ||
      normalize(scv.commitment.to) !== normalize(judgeEndpoint) || scv.commitment.inboxIndex !== commitment.inbox_index) {
    throw Error('SCV1 commitment pointer mismatch');
  }
  if (recordType === 'reveal') {
    if (![normalize(commitment.author_container), `0x${judgeEndpoint.slice(-40)}`].includes(normalize(entry.from))) {
      throw Error('reveal sender is not author or judge');
    }
    return { type: 'reveal', ...revealContent(scv.key,commitment,judgeEndpoint) };
  }
  if (normalize(entry.fromEndpoint) !== normalize(judgeEndpoint)) throw Error('verdict sender is not designated judge');
  if (normalize(entry.to) !== normalize(commitment.author_endpoint)) throw Error('verdict recipient is not author');
  if (!['hit', 'miss', 'undecidable'].includes(scv.outcome)) throw Error('invalid verdict outcome');
  if (scv.outcome !== 'undecidable' && (!Array.isArray(scv.sources) || scv.sources.length === 0)) throw Error('verdict lacks sources');
  for (const source of scv.sources ?? []) {
    if (!source || typeof source.name !== 'string' || !source.name || typeof source.value !== 'string' ||
        !Number.isSafeInteger(source.at) || (source.url !== undefined &&
        (typeof source.url !== 'string' || !/^https:\/\//.test(source.url)))) throw Error('invalid verdict source');
  }
  return { type: 'verdict', outcome: scv.outcome, reason: String(scv.reason || ''),
    sources: scv.sources ?? [], reveal: scv.key ? revealContent(scv.key,commitment,judgeEndpoint) : null };
}

export function displayState(row, nowSeconds) {
  if (row.verdict_id && row.reveal_id) return 'judged';
  if (row.reveal_id) return 'revealed-awaiting-verdict';
  if (nowSeconds >= row.open_time + 604800) return 'unrevealed';
  if (nowSeconds >= row.open_time) return 'due-awaiting-verified-reveal';
  return 'sealed';
}

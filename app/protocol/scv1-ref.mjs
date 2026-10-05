// SCV1 ref layout from the author's Sealed Commitments and Verdicts TAP draft.
// This module only encodes the public 32-byte ref. It does not validate a TAP-10
// message, a commitment ID, or on-chain finality.
export const TAG = '53435631';
export const RECORD_TYPE = Object.freeze({ commitment: 1, reveal: 2, verdict: 3 });
export const COMMITMENT_KIND = Object.freeze({ promise: 1, forecast: 2 });

function hexBytes(value, length, name) {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${length * 2}}$`).test(value)) {
    throw new TypeError(`${name} must be ${length} bytes of 0x-prefixed hex`);
  }
  return value.slice(2).toLowerCase();
}

function uint64(value) {
  let n;
  try { n = BigInt(value); } catch { throw new TypeError('open time must be an integer'); }
  if (n <= 0n || n > 0xffffffffffffffffn ||
      (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new RangeError('open time must be a positive uint64');
  }
  return n;
}

export function commitmentRef(kind, openTime) {
  if (!(kind in COMMITMENT_KIND)) throw new RangeError('unknown commitment kind');
  const type = RECORD_TYPE.commitment.toString(16).padStart(2, '0');
  const kindByte = COMMITMENT_KIND[kind].toString(16).padStart(2, '0');
  const open = uint64(openTime).toString(16).padStart(16, '0');
  return `0x${TAG}${type}${kindByte}${open}${'00'.repeat(18)}`;
}

export function linkedRef(type, commitmentId) {
  if (type !== 'reveal' && type !== 'verdict') throw new RangeError('linked record must be reveal or verdict');
  const id = hexBytes(commitmentId, 32, 'commitment ID');
  return `0x${TAG}${RECORD_TYPE[type].toString(16).padStart(2, '0')}${id.slice(0, 54)}`;
}

export function parseRef(ref) {
  const bytes = hexBytes(ref, 32, 'ref');
  if (bytes.slice(0, 8) !== TAG) return null; // An ordinary TAP-10 message.
  const type = Number.parseInt(bytes.slice(8, 10), 16);
  if (type === RECORD_TYPE.commitment) {
    const kind = Number.parseInt(bytes.slice(10, 12), 16);
    const reserved = bytes.slice(28);
    if (![COMMITMENT_KIND.promise, COMMITMENT_KIND.forecast].includes(kind) || !/^0+$/.test(reserved)) {
      return { type: 'commitment', malformed: true };
    }
    return { type: 'commitment', kind: kind === COMMITMENT_KIND.promise ? 'promise' : 'forecast',
      openTime: BigInt(`0x${bytes.slice(12, 28)}`), malformed: false };
  }
  if (type === RECORD_TYPE.reveal || type === RECORD_TYPE.verdict) {
    return { type: type === RECORD_TYPE.reveal ? 'reveal' : 'verdict',
      commitmentPrefix: `0x${bytes.slice(10)}` };
  }
  return { type: 'unknown-type', code: type };
}

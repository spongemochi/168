export const JUDGE_API = 'https://168-judge.joezuooo.workers.dev';
const states = {sealed:'sealed','due-awaiting-verified-reveal':'due',unrevealed:'unrevealed',
  'revealed-awaiting-verdict':'revealed',judged:'judged'};
const hex32 = /^0x[0-9a-f]{64}$/;

function record(row) {
  if (!row || !hex32.test(row.id) || !states[row.state] ||
      !/^0x[0-9a-f]{40}$/.test(row.authorContainer) ||
      !Number.isSafeInteger(row.openTime) || !Number.isSafeInteger(row.committedBlock)) {
    throw Error('后台返回的记录格式不完整。');
  }
  // A sealed or overdue record never displays plaintext from a server response.
  const revealed = ['revealed-awaiting-verdict','judged'].includes(row.state) && hex32.test(row.revealId);
  return {id:row.id,residentId:row.residentId,from:row.authorContainer,authorEndpoint:row.authorEndpoint,
    kind:row.kind,openTime:row.openTime,timestamp:row.committedAt,blockNumber:row.committedBlock,
    status:states[row.state],body:revealed ? row.body : null,condition:revealed ? row.condition : null,
    claim:revealed ? row.claim : null,revealId:revealed ? row.revealId : null,
    verdictId:row.verdictId,outcome:revealed ? row.outcome : null,reason:row.reason,sources:row.sources};
}

export function createJudgeApi(fetcher = globalThis.fetch) {
  async function get(path) {
    const response = await fetcher(JUDGE_API+path,{signal:AbortSignal.timeout(8000),credentials:'omit',cache:'no-store'});
    if (!response.ok) throw Error('判官后台暂时无法读取。');
    const data = await response.json();
    if (!Number.isSafeInteger(data.asOf) || !Number.isSafeInteger(data.safeBlock) ||
        !Number.isSafeInteger(data.syncedAt) || data.asOf <= 0) throw Error('判官后台尚未完成同步。');
    return data;
  }
  function meta(data) {
    return {source:'index',safeBlock:data.safeBlock,safeBlockTime:data.asOf,syncedAt:data.syncedAt,
      stale:Date.now()/1000-data.syncedAt>900};
  }
  return {
    async list(limit=12,after=null,{residentId}={}) {
      const query = new URLSearchParams({limit:String(limit)});
      if (after) query.set('after',after);
      if(residentId){if(!/^[1-9]\d*$/.test(residentId)||residentId==='1')throw Error('居民编号格式不正确。');query.set('resident',residentId);}
      const data = await get('/api/cases?'+query);
      if (!Array.isArray(data.cases) || (data.next !== null && !hex32.test(data.next))) throw Error('后台列表格式不完整。');
      return {...meta(data),items:data.cases.map(record),hasMore:!!data.next,next:data.next};
    },
    async detail(id) {
      if (!hex32.test(id)) throw Error('承诺 ID 格式不正确。');
      const data = await get('/api/cases/'+id);
      if (data.case?.id !== id || !Array.isArray(data.records)) throw Error('后台详情格式不完整。');
      const item = record(data.case);
      item.txHint = data.records.find(r=>r.valid===1&&r.record_type==='commitment')?.tx_hint || null;
      return {...meta(data),item,records:data.records,submissions:data.submissions || []};
    },
  };
}

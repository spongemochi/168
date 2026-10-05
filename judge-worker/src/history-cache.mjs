import {SCORE_RULE,units} from '../../app/scoring/rules.mjs';
export const subjects=['BTC/USD','ETH/USD'];
const cutoffFor=at=>Math.floor(at/3600)*3600;
export async function historyPage(subject,before,{fetchImpl=fetch}={}){
  if(!subjects.includes(subject)||!Number.isSafeInteger(before)||before<=0)throw Error('invalid history request');
  const url='https://www.okx.com/api/v5/market/history-index-candles?'+new URLSearchParams({instId:subject.replace('/','-'),bar:'1H',after:String(before),limit:'100'});
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('probability history unavailable');
  const data=await response.json();
  if(data.code!=='0'||!Array.isArray(data.data)||!data.data.length)throw Error('probability history incomplete');
  let oldest=before;const candles=[];
  for(const c of data.data){
    if(!Array.isArray(c)||c.length!==6||c[5]!=='1'||!/^\d+$/.test(c[0]))throw Error('unconfirmed history candle');
    const start=Number(c[0]);
    if(!Number.isSafeInteger(start)||start%3600000!==0||start>=before||units(c[4])<=0n)throw Error('invalid history pagination');
    oldest=Math.min(oldest,start);candles.push({at:start/1000+3600,close:c[4]});
  }
  if(oldest>=before)throw Error('history pagination stalled');
  return {candles,nextBefore:oldest};
}
export async function cachedHistory(db,subject,at){
  const cutoff=cutoffFor(at),first=cutoff-(SCORE_RULE.historyHours-1)*3600;
  const rows=await db.prepare('SELECT at,close FROM price_history WHERE subject=? AND at BETWEEN ? AND ? ORDER BY at').bind(subject,first,cutoff).all();
  if(rows.results.length!==SCORE_RULE.historyHours||rows.results.some((r,i)=>r.at!==first+i*3600))throw Error('180-day history cache incomplete');
  return rows.results;
}
export async function historyReadiness(db,now=Math.floor(Date.now()/1000)){
  const cutoff=cutoffFor(now),assets=[];
  for(const subject of subjects){
    const first=cutoff-(SCORE_RULE.historyHours-1)*3600;
    const row=await db.prepare('SELECT COUNT(*) AS count FROM price_history WHERE subject=? AND at BETWEEN ? AND ?').bind(subject,first,cutoff).first();
    const sync=await db.prepare('SELECT error,updated_at FROM history_sync WHERE subject=?').bind(subject).first();
    assets.push({subject,candles:Number(row?.count||0),required:SCORE_RULE.historyHours,ready:row?.count===SCORE_RULE.historyHours&&!sync?.error,error:sync?.error||null,updatedAt:sync?.updated_at||null});
  }
  return {ready:assets.every(a=>a.ready),cutoff,assets};
}
// Bounded background work: no 180-day download in a commitment's admission path.
export async function warmHistory(db,{now=Math.floor(Date.now()/1000),pagesPerAsset=4,fetchImpl=fetch}={}){
  const cutoff=cutoffFor(now),first=cutoff-(SCORE_RULE.historyHours-1)*3600;
  for(const subject of subjects){
    const state=await db.prepare('SELECT * FROM history_sync WHERE subject=?').bind(subject).first();
    let before=state?.cutoff===cutoff?state.next_before:cutoff*1000,error=null,ready=false;
    try{
      try{await cachedHistory(db,subject,now);ready=true;}catch{}
      for(let page=0;page<pagesPerAsset&&!ready;page++){
        const result=await historyPage(subject,before,{fetchImpl});
        const existing=await db.prepare('SELECT at,close FROM price_history WHERE subject=? AND at BETWEEN ? AND ?').bind(subject,result.nextBefore/1000+3600,before/1000).all();
        const known=new Map(existing.results.map(r=>[r.at,r.close])),writes=[];
        for(const candle of result.candles){
          if(candle.at<first||candle.at>cutoff)continue;
          const old=known.get(candle.at);
          if(old&&units(old)!==units(candle.close))throw Error('conflicting historical candles');
          if(!old)writes.push(db.prepare('INSERT OR IGNORE INTO price_history (subject,at,close) VALUES (?,?,?)').bind(subject,candle.at,candle.close));
          known.set(candle.at,candle.close);
        }
        if(writes.length){if(db.batch)await db.batch(writes);else for(const statement of writes)await statement.run();}
        before=result.nextBefore;
        try{await cachedHistory(db,subject,now);ready=true;}catch{}
        if(before/1000+3600<first&&!ready){before=cutoff*1000;throw Error('180-day history cache incomplete');}
      }
    }catch(e){error=String(e.message).slice(0,300);}
    await db.prepare(`INSERT INTO history_sync (subject,cutoff,next_before,ready,error,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(subject) DO UPDATE SET cutoff=excluded.cutoff,next_before=excluded.next_before,ready=excluded.ready,error=excluded.error,updated_at=excluded.updated_at`)
      .bind(subject,cutoff,before,ready?1:0,error,now).run();
    // Keep a week beyond the active window for delayed parameter verification.
    await db.prepare('DELETE FROM price_history WHERE subject=? AND at<?').bind(subject,first-SCORE_RULE.maxHorizon).run();
  }
  return historyReadiness(db,now);
}

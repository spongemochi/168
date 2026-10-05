import {prepareScores,verifyScores} from './scoring.mjs';
import {operation} from './operation.mjs';
import {syncJudge} from './indexer.mjs';
import {prepareDecisions} from './adjudicator.mjs';
import {executeJudge,observeTransactions} from './executor.mjs';
import {warmHistory} from './history-cache.mjs';
export async function runJudge(db,{sync=syncJudge,decide=prepareDecisions,execute=executeJudge,observe=observeTransactions,warm=warmHistory,prepare=prepareScores,verify=verifyScores,env={},now=Math.floor(Date.now()/1000)}={}) {
  await db.prepare(`INSERT INTO service_runs (name,started_at,completed_at,ok,error) VALUES ('judge',?,NULL,NULL,NULL)
    ON CONFLICT(name) DO UPDATE SET started_at=excluded.started_at,completed_at=NULL,ok=NULL,error=NULL`).bind(now).run();
  let trackingError=null,scoringError=null,warmed=false;
  try{await operation('transactions.observe',()=>observe(db));}catch(error){trackingError=String(error.message);}
  try {
    const result=await operation('index.sync',()=>sync(db)),jobs=await operation('price.prepare',()=>decide(db));
    const caughtUp=[result.inbox,result.outbox].every(s=>!s||s.nextIndex>=s.total);
    let execution=caughtUp?await operation('auto.execute',()=>execute(db,env)):{state:'index-catching-up'};
    // Existing reveal/verdict work runs before potentially slow history collection.
    if(caughtUp&&env.SCORING_ENABLED==='true'){
      try{
        warmed=true;await warm(db);
        await prepare(db,env);
        if(execution.state==='no-automatic-work')execution=await execute(db,env);
        await verify(db);
      }catch(error){scoringError=String(error.message);}
    }
    await db.prepare("UPDATE service_runs SET completed_at=?,ok=1,scoring_error=?,tracking_error=? WHERE name='judge'").bind(Math.floor(Date.now()/1000),scoringError,trackingError).run();
    return {...result,jobs,execution,scoringError,trackingError};
  }catch(error) {
    if(!warmed&&env.SCORING_ENABLED==='true'){try{await warm(db);}catch(e){scoringError=String(e.message);}}
    await db.prepare("UPDATE service_runs SET completed_at=?,ok=0,error=?,scoring_error=?,tracking_error=? WHERE name='judge'").bind(Math.floor(Date.now()/1000),String(error.message||error).slice(0,1500),scoringError,trackingError).run();
    throw error;
  }
}

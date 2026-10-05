// Rebuild a NEW local database from public chain data; never load executor keys.
import {installReadOnlyProxy} from './scoring-curl.mjs';import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';import path from 'node:path';
import {parseArgs} from 'node:util';
import {createRebuildTrace} from './rebuild-diagnostics.mjs';
import {verifyHistoricalProcessor} from './rebuild-identity.mjs';
const {values}=parseArgs({options:{resume:{type:'string'},diagnose:{type:'boolean'}}});
installReadOnlyProxy();
const trace=values.diagnose?createRebuildTrace(globalThis.fetch):null;
if(trace)globalThis.fetch=trace.fetchImpl;
const {syncJudge}=await import('../judge-worker/src/indexer.mjs');
const {verifyScores,leaderboard,collectHistory}=await import('../judge-worker/src/scoring.mjs');
const {verifyEndorsement}=await import('../judge-worker/src/endorsement.mjs');
const {collectPrices}=await import('../judge-worker/src/price-sources.mjs');
const {createPriceChains}=await import('../judge-worker/src/price-rpc.mjs');
const {tchain}=await import('../vendor/tapesend.bundle.mjs');
const root=new URL('../',import.meta.url),directory=new URL('verification/',root);fs.mkdirSync(directory,{recursive:true});
const file=new URL('scoring-rebuild-'+Date.now()+'.sqlite',directory);if(fs.existsSync(file))throw Error('refusing to overwrite a database');
let resumeSnapshot;
if(values.resume){
 const source=path.resolve(values.resume);
 if(path.dirname(fs.realpathSync(source))!==fs.realpathSync(directory)||!/^scoring-rebuild-\d+\.sqlite$/.test(path.basename(source)))throw Error('resume requires a local verification/scoring-rebuild-*.sqlite file');
 if(fs.existsSync(source+'-wal'))throw Error('resume database is open or has a WAL; close its writer first');
 resumeSnapshot=JSON.parse(fs.readFileSync(source+'.json','utf8'));
 if(resumeSnapshot.version!=='168-score-history-v2'||!Number.isSafeInteger(resumeSnapshot.asOf)||resumeSnapshot.asOf<=0||!Array.isArray(resumeSnapshot.records))throw Error('resume needs the completed scan JSON from the same rebuild');
 fs.copyFileSync(source,file,fs.constants.COPYFILE_EXCL);
 console.log('复制原只读重建结果，核验在新本地数据库中继续：',file.pathname);
}
const sql=new DatabaseSync(file.pathname);
if(!values.resume)for(const f of fs.readdirSync(new URL('judge-worker/migrations/',root)).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('judge-worker/migrations/'+f,root),'utf8'));
const db={prepare(q){const s=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};}};
try{
 let result,complete=false;
 if(values.resume){
  const saved=sql.prepare('SELECT MIN(safe_block) AS block, MIN(safe_timestamp) AS timestamp,COUNT(*) AS streams FROM cursors').get();
  if(saved.streams!==2||!saved.block||!saved.timestamp||saved.timestamp!==resumeSnapshot.asOf)throw Error('resume database lacks a matching indexed snapshot');
  result={safeBlock:saved.block,safeBlockTime:saved.timestamp};complete=true;
  sql.exec('UPDATE score_receipts SET next_verify_at=0 WHERE verified=0');
 }else for(let i=0;i<100;i++){result=await syncJudge(db);console.log(JSON.stringify(result));if([result.inbox,result.outbox].every(s=>s.nextIndex>=s.total)){complete=true;break;}}
 if(!complete)throw Error('rebuild scan limit reached; no complete leaderboard claimed');
 const count=sql.prepare('SELECT COUNT(*) AS n FROM score_receipts WHERE parameters_id IS NOT NULL').get().n;
 const chain=tchain.createTapeSendChains({fetchImpl:globalThis.fetch}).get(196);
 if(trace)trace.wrap(chain,'背书、历史所有权及原始发送钱包');
 const priceChains=createPriceChains({fetchImpl:globalThis.fetch});
 if(trace)for(const [id,c] of priceChains)trace.wrap(c,'初始历史价 / '+id);
 const stage=(name,run)=>async(...args)=>{if(values.diagnose)console.log('【核验步骤】'+name);try{return await run(...args);}catch(error){if(values.diagnose)console.log('【步骤失败】'+name+'：'+error.message);throw error;}};
 const endorse=stage('历史处理器 168、背书及历史归属',async(chain,row,slot)=>{
  const pinned=await verifyHistoricalProcessor(chain,row);
  if(values.diagnose)console.log('【历史处理器核验】'+JSON.stringify(pinned));
  return verifyEndorsement(chain,row,slot);
 });
 const prices=stage('独立读取初始价格',async(...args)=>{const got=await collectPrices(...args,{chains:priceChains,fetchImpl:globalThis.fetch});if(values.diagnose)console.log('【初始价格来源】'+JSON.stringify({sources:got.sources.map(s=>({id:s.id,value:s.value,at:s.at})),errors:got.errors}));return got;});
 const history=stage('独立读取 4320 根历史样本',collectHistory);
 for(let i=0;i<count;i++)await verifyScores(db,{chain,history,endorse,prices});
 const output=await leaderboard(db,result.safeBlockTime);
 output.unverified=sql.prepare('SELECT case_id,error FROM score_receipts WHERE verified=0').all();
 fs.writeFileSync(file.pathname+'.json',JSON.stringify(output,null,2));
 console.log('本地重建结果：',file.pathname+'.json');console.log(JSON.stringify(output,null,2));
 if(output.unverified.length){console.log('独立重建尚未通过；保留原记录和诊断结果，不输出成功。');process.exitCode=1;}
 else console.log('独立重建核验通过；结果对应上述索引截止时间。');
}finally{sql.close();}

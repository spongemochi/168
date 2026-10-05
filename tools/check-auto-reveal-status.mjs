// Read public Worker status only. Never load keys or send chain transactions.
import {installReadOnlyProxy} from './scoring-curl.mjs';
installReadOnlyProxy();
const base='https://168-judge.joezuooo.workers.dev';
const argument=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const id=argument('--case')||'0x791aa5ef6ee31177523e4fb3ee69272e5a9494b8ef321696beb3aadba18b7df3';
if(!/^0x[0-9a-f]{64}$/.test(id))throw Error('invalid --case commitment ID');
const openText=argument('--open-at'),openAt=openText?Date.parse(openText):null;
if(openText&&(!Number.isFinite(openAt)||!/(Z|[+-]\d{2}:\d{2})$/.test(openText)))throw Error('invalid --open-at time with timezone');
const expectedRule=argument('--expect-rule');
const expectedVersion='168-index-retry-v5';
console.log('只读查询自动揭示状态；不发送交易。');
console.log('目标承诺：'+id);
const watch=process.argv.includes('--watch'),afterIndex=process.argv.indexOf('--after');
const untilVerdict=process.argv.includes('--until-verdict');
const after=afterIndex>=0?Number(process.argv[afterIndex+1]):Math.floor(Date.now()/1000);
if(!Number.isSafeInteger(after))throw Error('invalid --after timestamp');
const retryableSyncError=error=>/^\[index\.sync\] X Layer safe block(?: timestamp)? quorum unavailable$/.test(String(error));
let failedSyncRounds=0,lastCompletedRound=null;
if(watch){
  const deadline=openAt!==null?Math.max(Date.now(),openAt)+30*60*1000:Date.now()+(untilVerdict?12:7)*60*1000;
  console.log(openAt!==null?'等待到期开舱、自动揭示及裁决核验；等待截止（北京）：'+new Date(deadline).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'，每 20 秒查一次。':untilVerdict?'等待新任务及裁决安全区块核验，最多十二分钟；每 20 秒查一次。':'等待部署后的新一轮任务，最多七分钟；每 20 秒查一次。');
  while(Date.now()<deadline){
    try{
      const response=await fetch(base+'/health',{signal:AbortSignal.timeout(30000),cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json(),run=data.run;
      const time=run?.started_at?new Date(run.started_at*1000).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'}):'未记录';
      console.log('版本：'+(data.automation?.executorVersion||'尚无版本标记')+'；最近任务 '+time+'；'+(run?.completed_at?'已结束':'执行中/等待'));
      if(data.automation?.executorVersion===expectedVersion&&run?.started_at>=after&&run?.completed_at){
        if(!untilVerdict){console.log('已取得部署后的新任务结果。');break;}
        if(lastCompletedRound!==run.started_at){
          lastCompletedRound=run.started_at;
          failedSyncRounds=run.ok===0&&retryableSyncError(run.error)?failedSyncRounds+1:0;
        }
        if(run.ok===0){
          if(!retryableSyncError(run.error)){console.log('后台任务失败，输出完整结果。');break;}
          console.log('安全区块读取未通过，后台会在下一轮重试；连续失败 '+failedSyncRounds+'/3。已有交易保留。');
          if(failedSyncRounds>=3){console.log('连续三轮未取得安全区块，停止等待并输出完整状态。');break;}
        }
        const caseResponse=await fetch(base+'/api/cases/'+id,{signal:AbortSignal.timeout(30000),cache:'no-store'});
        if(!caseResponse.ok)throw Error('case HTTP '+caseResponse.status);
        const detail=await caseResponse.json();
        if(detail.case?.revealId&&expectedRule&&detail.case.claim?.ruleVersion!==expectedRule){
          console.log('实际封存规则：'+(detail.case.claim?.ruleVersion||'未固定')+'；与期望 '+expectedRule+' 不符，输出完整结果。');break;
        }
        if(detail.case?.verdictId){console.log('裁决已进入安全区块并核验。');break;}
        const tx=(data.transactions||[]).find(t=>t.case_id===id&&t.type==='verdict');
        if(!tx){
          if(openAt!==null){
            const revealTx=(data.transactions||[]).find(t=>t.case_id===id&&t.type==='reveal');
            console.log(Date.now()<openAt?'尚未到开舱时间，继续等待。':'承诺状态：'+(detail.case?.state||'尚待索引')+(revealTx?'；揭示交易 '+revealTx.state:'')+'；等待自动裁决。');
            if(revealTx&&['reverted','nonce-conflict'].includes(revealTx.state))break;
          }else{console.log('本轮尚未发出目标裁决，输出证据准备状态。');break;}
        }
        if(!tx){await new Promise(resolve=>setTimeout(resolve,20000));continue;}
        console.log('裁决交易：'+tx.state+'；等待安全区块收录。');
        if(['reverted','nonce-conflict'].includes(tx.state))break;
      }
    }catch(error){console.log('读取暂未成功：'+error.message);}
    await new Promise(resolve=>setTimeout(resolve,20000));
  }
}
let health,detail,jobs;
for(const [title,path] of [['后台运行状态','/health'],['承诺状态','/api/cases/'+id],['自动裁决进度','/api/judge/jobs']]){
  console.log('\n【'+title+'】');
  try{
    const response=await fetch(base+path,{signal:AbortSignal.timeout(30000),cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    if(path==='/health')health=data;
    else if(path.endsWith('/jobs')){data.jobs=(data.jobs||[]).filter(j=>j.id===id);jobs=data;}
    else detail=data;
    console.log(JSON.stringify(data,null,2));
  }catch(error){console.log('查询失败：'+error.message);process.exitCode=1;}
}
console.log('\n【判读】');
if(health?.run?.started_at)console.log('后台任务时间（北京）：'+new Date(health.run.started_at*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));
if(watch&&(!health?.run?.completed_at||health.run.started_at<after||health?.automation?.executorVersion!==expectedVersion)){
  console.log('等待期间未取得修正版部署后的完整任务结果；以下是最近记录，不能当作新版本验收。');process.exitCode=1;
}
if(detail?.case?.revealId){
  console.log('原封存取价规则：'+(detail.case.claim?.ruleVersion||'未固定'));
  if(expectedRule&&detail.case.claim?.ruleVersion!==expectedRule){console.log('该笔不能作为 '+expectedRule+' 验收；实际规则与期望不符。');process.exitCode=1;}
  console.log('自动测试已出现核验过的揭示，revealId：'+detail.case.revealId);
  console.log(detail.case.verdictId?'已核验裁决：'+detail.case.outcome:'尚未核验到裁决；继续查看三源证据和裁决任务状态。');
}else if(health?.run?.ok===0){
  console.log('仍未核验到揭示，后台任务失败：'+health.run.error);
}else{
  console.log('尚未核验到揭示；查看任务是否仍在执行、定时任务时间及索引状态，不能据此宣布成功。');
}
for(const tx of health?.transactions||[])if(tx.case_id===id)console.log('目标承诺交易：'+tx.type+' / '+tx.state+' / '+tx.tx_hash+(tx.error?' / '+tx.error:''));
if(jobs?.jobs?.[0]?.jobReason)console.log('裁决任务说明：'+jobs.jobs[0].jobReason);
if(watch&&untilVerdict&&!detail?.case?.verdictId){console.log('尚未完成裁决安全区块验收；请贴以上完整输出。');process.exitCode=1;}

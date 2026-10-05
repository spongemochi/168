// Public reads only. Does not load keys, deploy, synchronize or send transactions.
import {installReadOnlyProxy} from './scoring-curl.mjs';installReadOnlyProxy();
const base='https://168-judge.joezuooo.workers.dev',arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const id=arg('--case'),watch=process.argv.includes('--watch');
if(id&&!/^0x[0-9a-f]{64}$/.test(id))throw Error('invalid commitment ID');
const openAt=arg('--open-at'),expectedOpen=openAt?Date.parse(openAt)/1000:null;
if(openAt&&(!id||!/(?:Z|[+-]\d{2}:\d{2})$/.test(openAt)||!Number.isSafeInteger(expectedOpen)))throw Error('--open-at requires a case and ISO date with timezone');
async function get(path){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(30000),cache:'no-store'});
 if(!response.ok)throw Error(path+' HTTP '+response.status);
 if(response.headers.get('access-control-allow-origin')!=='*')throw Error(path+' 缺少公开读取 CORS 头');
 return response.json();
}
console.log('只读查询计分后台；不读取密钥，不发送交易。');
const deadline=expectedOpen!==null?Math.max(Date.now()+15*60*1000,(expectedOpen+3600)*1000):Date.now()+(id?3*60*60:20*60)*1000;
if(id){
 console.log('目标承诺：'+id);
 if(watch)console.log('先核验事前回执，再等待揭示、裁决和分数；截止（北京）：'+new Date(deadline).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}));
}
let health,rules,detail,board,passed=false;
do{
 try{
  health=await get('/health');rules=await get('/api/scoring/rules');
  console.log('版本：'+health.automation?.executorVersion+'；计分：'+(rules.enabled?'已启用':'未启用')+'；历史：'+rules.history.assets.map(a=>a.subject+' '+a.candles+'/'+a.required+(a.error?'（'+a.error+'）':'')).join(' · '));
  if(health.run?.error)console.log('最近任务：'+health.run.error);
  if(health.run?.scoring_error)console.log('计分准备：'+health.run.scoring_error);
  if(health.run?.tracking_error)console.log('交易跟踪：'+health.run.tracking_error);
  board=await get('/api/leaderboard');
  if(id){
    detail=await get('/api/cases/'+id);
    if(expectedOpen!==null&&detail.case.openTime!==expectedOpen){console.log('开舱时间与输入不一致，请核对承诺 ID。');break;}
    const scoring=detail.scoring;
    const timely=Boolean(scoring?.receipt_id&&Number.isSafeInteger(scoring.receipt_at)&&scoring.receipt_at>=detail.case.committedAt&&scoring.receipt_at<=detail.case.committedAt+rules.rule.receiptWindow&&scoring.receipt_at<detail.case.openTime);
    console.log('承诺：'+detail.case.state+'；事前回执：'+(scoring?.receipt_id||'尚未核验')+'；参数公开：'+(scoring?.parameters_id||'尚未核验')+'；计分核验：'+(scoring?.verified?'通过':'等待'));
    if(scoring?.receipt_id)console.log('事前窗口核验：'+(timely?'通过，回执已在封存后十分钟内且开舱前上链':'未通过')+'；回执交易：'+(scoring.receipt_tx||'尚无交易链接'));
    if(detail.scoringAdmission)console.log('计分收录状态：'+detail.scoringAdmission.state);
    if(detail.scoringAdmission?.reason)console.log('收录说明：'+detail.scoringAdmission.reason);
    const record=board.records.find(r=>r.caseId===id);
    passed=Boolean(health.automation?.executorVersion==='168-scoring-v6'&&board.version==='168-score-history-v2'&&timely&&scoring?.verified&&scoring?.parameters_id&&record?.verified&&['hit','miss'].includes(record.outcome)&&Number.isInteger(record.scoreUnits)&&detail.scoringResult?.outcome===record.outcome&&detail.scoringResult?.scoreUnits===record.scoreUnits);
    if(passed)console.log('本笔判断分：'+(record.scoreUnits>0?'+':'')+(record.scoreUnits/1e6).toFixed(6)+'；'+(record.outcome==='hit'?'命中':'未中'));
    if(['expired','rejected','ignored'].includes(detail.scoringAdmission?.state))break;
  }else passed=health.automation?.executorVersion==='168-scoring-v6'&&rules.enabled&&rules.ready&&rules.rule.version==='168-score-history-v2';
  if(passed)break;
 }catch(error){console.log('读取暂未成功：'+error.message);}
 if(!watch)break;
 await new Promise(resolve=>setTimeout(resolve,20000));
}while(Date.now()<deadline);
for(const [label,data] of [['后台运行状态',health],['计分就绪状态',rules],['目标承诺',detail],['榜单',board]])if(data)console.log('\n【'+label+'】\n'+JSON.stringify(data,null,2));
console.log(passed?(id?'已核验计分：事前回执、公开参数、有效裁决和榜单记录齐备。':'计分后台已就绪。接下来发布前端并创建一笔新的背书价格判断。'):'尚未通过计分验收；请贴完整输出。部署成功不等于计分数据已就绪。');
process.exitCode=passed?0:1;

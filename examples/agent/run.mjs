import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createAgentClient,inspectLeaderboard} from './client.mjs';
import {prepareForecast} from './forecast.mjs';
import {HEX32} from '../../app/scoring/rules.mjs';

try{
  const {values}=parseArgs({options:{proxy:{type:'string'},api:{type:'string'},case:{type:'string'},rebuild:{type:'string'},draft:{type:'string'},out:{type:'string'},'max-age':{type:'string',default:'900'},help:{type:'boolean'}}});
  if(values.help){console.log('Read: node examples/agent/run.mjs [--proxy http://127.0.0.1:15236] [--case ID]\nOffline ranking: --rebuild RESULT.json\nPrepare unsigned forecast: --draft PRIVATE.json --out NEW_DIRECTORY\nNo private wallet keys, signing or broadcast.');process.exit(0);}
  if(values.proxy){const {installReadOnlyProxy}=await import('../../tools/scoring-curl.mjs');installReadOnlyProxy(values.proxy);}
  const client=createAgentClient({base:values.api,fetchImpl:globalThis.fetch});
  if(values.draft){
    if(!values.out||values.case||values.rebuild)throw Error('--draft requires --out and cannot be combined with --case/--rebuild');
    const output=path.resolve(values.out);
    if(fs.existsSync(output))throw Error('output directory already exists; use a new private directory');
    const prepared=await prepareForecast(JSON.parse(fs.readFileSync(values.draft,'utf8')),{readRules:()=>client.get('/api/scoring/rules')});
    fs.mkdirSync(output,{mode:0o700});
    fs.writeFileSync(path.join(output,'reveal-private.json'),JSON.stringify(prepared.backup,null,2),{mode:0o600,flag:'wx'});
    fs.writeFileSync(path.join(output,'unsigned-transaction.json'),JSON.stringify(prepared.transaction,null,2),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({status:'unsigned',safeBlock:prepared.safeBlock,output,admission:prepared.admission,transactionSent:false},null,2));
  }else if(values.rebuild){
    if(values.case)throw Error('--rebuild cannot be combined with --case');
    const data=JSON.parse(fs.readFileSync(values.rebuild,'utf8'));
    if(!Array.isArray(data.unverified)||data.unverified.length)throw Error('independent rebuild has unresolved records or lacks provenance field');
    console.log(JSON.stringify({...inspectLeaderboard(data,{maxAge:Number(values['max-age'])}),verification:'rebuild-file-arithmetic-checked',trust:'Chain verification belongs to the rebuild producer; this reader checks file consistency.'},null,2));
  }else{
    if(values.case){
      if(!HEX32.test(values.case))throw Error('invalid case ID');
      const d=await client.get(`/api/cases/${values.case}`);
      console.log(JSON.stringify({caseId:d.case.id,state:d.case.state,receiptId:d.scoring?.receipt_id||null,
        parametersId:d.scoring?.parameters_id||null,scoringVerified:d.scoring?.verified===1,scoringResult:d.scoringResult||null},null,2));
    }
    console.log(JSON.stringify(await client.read({maxAge:Number(values['max-age'])}),null,2));
    console.log('Agent 只读示例完成；没有发送交易或分配资源。');
  }
}catch(error){console.error('Agent 示例未通过：',error.message);process.exitCode=1;}

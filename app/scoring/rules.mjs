// 168 application extension, NOT an additional SCV1/TAP record type.
export const SCORE_RULE=Object.freeze({version:'168-score-history-v2',priceRule:'168-price-usd-v2',scale:1000000,
  historyHours:4320,minSamples:1000,minHorizon:3600,maxHorizon:604800,receiptWindow:600,grace:604800,minRankSamples:10});
export const PROCESSOR='0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282';
export const HEX32=/^0x[0-9a-f]{64}$/;
export function canonical(x){
  if(x===null||typeof x==='string'||typeof x==='boolean')return JSON.stringify(x);
  if(typeof x==='number'&&Number.isSafeInteger(x))return String(x);
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(x&&Object.getPrototypeOf(x)===Object.prototype)return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  throw Error('non-canonical scoring value');
}
export async function digest(value){return '0x'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function units(s){if(typeof s!=='string'||!/^\d{1,30}(\.\d{1,18})?$/.test(s))throw Error('invalid score price');const [a,b='']=s.split('.');return BigInt(a)*10n**18n+BigInt(b.padEnd(18,'0'));}
export function validateRequest(scv,committedAt){
  const c=scv?.claim,slot=scv?.slot;
  if(scv?.scoringVersion!==SCORE_RULE.version||scv.type!=='commitment'||scv.kind!=='forecast'||c?.ruleVersion!==SCORE_RULE.priceRule||
    c.metric!=='price'||!['BTC/USD','ETH/USD'].includes(c.subject)||!['>','<'].includes(c.op)||c.at!==scv.open||units(c.value)<=0n||
    !Number.isSafeInteger(scv.open)||scv.open%60!==0||scv.open-committedAt<SCORE_RULE.minHorizon||scv.open-committedAt>SCORE_RULE.maxHorizon)throw Error('unsupported scoring request');
  if(slot?.chainId!==196||slot.processor!==PROCESSOR||typeof slot.circuitId!=='string'||!/^[1-9]\d*$/.test(slot.circuitId)||BigInt(slot.circuitId)<=1n||!HEX32.test(slot.tapeoutTx))throw Error('invalid endorsement');
  return {claim:c,slot};
}
export function estimate(claim,committedAt,open,px0,candles){
  const horizon=Math.ceil((open-committedAt)/3600),cutoff=Math.floor(committedAt/3600)*3600;
  if(horizon<1||horizon>168||candles.length!==SCORE_RULE.historyHours||units(px0)<=0n)throw Error('invalid probability inputs');
  // Exact contiguous 180-day window. Timestamp denotes the END of each hour.
  const values=candles.map((c,i)=>{if(c.at!==cutoff-(candles.length-1-i)*3600||units(c.close)<=0n)throw Error('missing, future or unordered historical candle');return units(c.close);});
  const threshold=units(claim.value),initial=units(px0);let hits=0;
  if(!['>','<'].includes(claim.op))throw Error('invalid comparison');
  for(let i=0;i+horizon<values.length;i++){
    const a=initial*values[i+horizon],b=threshold*values[i];
    if(claim.op==='>'?a>b:a<b)hits++;
  }
  const samples=values.length-horizon;
  if(samples<SCORE_RULE.minSamples)throw Error('insufficient historical samples');
  // Round once to six decimal places. All later score arithmetic is integer.
  const pUnits=Number((BigInt(hits+1)*1000000n+BigInt(samples+2)/2n)/BigInt(samples+2));
  if(pUnits<50000||pUnits>950000)throw Error('baseline probability outside scoring range');
  return {horizonHours:horizon,cutoff,hits,samples,pUnits};
}
export function scoreUnits(p,outcome){if(!Number.isInteger(p)||p<50000||p>950000)throw Error('invalid probability');return outcome==='hit'?1000000-p:['miss','unrevealed'].includes(outcome)?-p:null;}
export function scoreRef(type,id){if(!HEX32.test(id)||!['receipt','parameters'].includes(type))throw Error('invalid scoring ref');return '0x31363853'+(type==='receipt'?'01':'02')+id.slice(2,56);}
export function scoreType(ref){return /^0x313638530[12][0-9a-f]{54}$/.test(ref)?(ref.slice(10,12)==='01'?'receipt':'parameters'):null;}
export async function parameterHash(parameters){return digest({domain:SCORE_RULE.version,chainId:196,processor:PROCESSOR,parameters});}
export function rank(records,asOf){
  const residents=new Map(),seen=new Set();
  for(const r of records){
    if(seen.has(r.caseId)||!r.verified||!r.receiptId||!r.parametersId||!r.authorWallet||r.residentId==='1')continue;seen.add(r.caseId);
    const outcome=r.outcome==='hit'||r.outcome==='miss'?r.outcome:!r.revealId&&asOf>=r.openTime+SCORE_RULE.grace?'unrevealed':null;
    const value=scoreUnits(r.pUnits,outcome),key=r.authorWallet+':'+r.residentId;
    const row=residents.get(key)||{authorWallet:r.authorWallet,residentId:r.residentId,scoreUnits:0,settled:0,hit:0,miss:0,unrevealed:0,pending:0,totalPUnits:0,cases:[]};
    row.cases.push(r.caseId);
    if(value===null)row.pending++;else{row.scoreUnits+=value;row.settled++;row[outcome]++;row.totalPUnits+=r.pUnits;}
    residents.set(key,row);
  }
  return [...residents.values()].map(r=>({...r,eligible:r.settled>=SCORE_RULE.minRankSamples})).sort((a,b)=>b.scoreUnits-a.scoreUnits||b.settled-a.settled||a.authorWallet.localeCompare(b.authorWallet)||a.residentId.localeCompare(b.residentId));
}

// v1 is immutable. A future rule must use another version and be committed
// before the prediction's outcome; legacy commitments require judge review.
export const PRICE_RULE = Object.freeze({
  version:'168-price-usd-v1',
  assets:{
    'BTC/USD':{bnb:'0x264990fbd0a4796a3e3d8e37c4d5f87a3aca5ebf',base:'0x64c911996d3c6ac71f9b455b1e8e7266bcbd848f',okx:'BTC-USD'},
    'ETH/USD':{bnb:'0x9ef1b8c0e4f7dc8bf5719ea496883dc6401d5b2e',base:'0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70',okx:'ETH-USD'},
  },
  chainlinkMaxAgeSeconds:3600,
  chainlinkSelection:'latestRoundData at last finalized/safe block with timestamp <= T; next block must be > T',
  okxSelection:'confirmed USD index 1m candle closing at T; no USDT=USD assumption',
  aggregation:'median of all three sources; missing source retries without issuing hit/miss',
  comparison:'strict > or <; equality is miss; integer decimal arithmetic',
  scoring:'none; existing commitments have no precommitted baseline probability or verified endorsement',
});
export const PRICE_RULE_V2=Object.freeze({...PRICE_RULE,version:'168-price-usd-v2',
  aggregation:'three sources: median; two sources: OKX plus one Chainlink, spread <= 2% of the lower price and matching threshold outcomes; report their mean; otherwise wait',
  minimumProviders:2,twoSourceMaxSpreadPercent:2,scoring:'optional under a separate precommitted scoring rule; ordinary commitments do not score'});
export const PRICE_RULES=Object.freeze({[PRICE_RULE.version]:PRICE_RULE,[PRICE_RULE_V2.version]:PRICE_RULE_V2});
export const isPriceRule=version=>typeof version==='string'&&Object.hasOwn(PRICE_RULES,version);
export function ruleFor(claim){
  const version=claim?.ruleVersion||PRICE_RULE.version;
  if(!isPriceRule(version))throw Error('unsupported price rule version');
  return PRICE_RULES[version];
}
export function priceEvidencePending(message){
  const error=Error(message);error.code='PRICE_EVIDENCE_PENDING';return error;
}
export function scaled(value,decimals=18) {
  if(typeof value!=='string'||value.length>80||!/^\d+(\.\d+)?$/.test(value))throw Error('invalid positive decimal');
  const [whole,fraction='']=value.split('.');
  if(fraction.length>decimals)throw Error('unsupported decimal precision');
  return BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');
}
export function decimal(value,decimals) {
  const s=BigInt(value).toString().padStart(decimals+1,'0');
  return decimals?s.slice(0,-decimals)+'.'+s.slice(-decimals):s;
}
export function validateClaim(claim,open) {
  const rule=ruleFor(claim);
  if(!claim||claim.metric!=='price'||!rule.assets[claim.subject]||!['>','<'].includes(claim.op)||
    claim.at!==open||!Number.isSafeInteger(open)||open<=0||open%60!==0||scaled(claim.value)<=0n)throw Error('unsupported price claim');
  return claim;
}
export function decidePrice(claim,open,sources) {
  validateClaim(claim,open);const rule=ruleFor(claim);
  const expected=['chainlink-bnb','chainlink-base','okx-usd-index'];
  if(!Array.isArray(sources)||sources.some(s=>!expected.includes(s.id))||new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('invalid or duplicate price source');
  if(rule===PRICE_RULE&&(sources.length!==3||expected.some(name=>sources.filter(s=>s.id===name).length!==1)))throw priceEvidencePending('all three fixed sources required');
  if(rule===PRICE_RULE_V2&&(sources.length<2||!sources.some(s=>s.id==='okx-usd-index')||!sources.some(s=>s.id.startsWith('chainlink-'))))throw priceEvidencePending('OKX and at least one Chainlink source required');
  for(const s of sources) {
    if(!Number.isSafeInteger(s.at)||s.at>open||open-s.at>PRICE_RULE.chainlinkMaxAgeSeconds||scaled(s.value)<=0n)throw Error('stale or future price evidence');
  }
  const values=sources.map(s=>scaled(s.value)).sort((a,b)=>a<b?-1:a>b?1:0),threshold=scaled(claim.value);
  const hits=value=>claim.op==='>'?value>threshold:value<threshold;
  if(rule===PRICE_RULE_V2&&sources.length===2){
    if((values[1]-values[0])*100n>values[0]*2n)throw priceEvidencePending('two-source price spread exceeds 2%');
    if(hits(values[0])!==hits(values[1]))throw priceEvidencePending('two sources disagree on threshold outcome');
    const mean=(values[0]+values[1])/2n;
    return {outcome:hits(values[0])?'hit':'miss',price:decimal(mean,18),sources,
      reason:`${rule.version}：OKX 与 Chainlink 双源差价不超过低价的 2%，阈值判断一致；均价 ${decimal(mean,18)}，约定 ${claim.subject} ${claim.op} ${claim.value}；等于阈值记未中。`};
  }
  const median=values[1],hit=hits(median);
  return {outcome:hit?'hit':'miss',price:decimal(median,18),sources,
    reason:`${rule.version}：三源美元价中位数 ${decimal(median,18)}，约定 ${claim.subject} ${claim.op} ${claim.value}；等于阈值记未中。`};
}

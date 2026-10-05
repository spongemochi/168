// One browser-time rule for the form and transaction preparation.
const CommitmentTime = (()=>{
  const minimumMinutes=15;
  const parse=draft=>Date.parse(`${draft.date}T${draft.time}:00+08:00`);
  function validate(draft,now=Date.now()){
    const open=parse(draft);
    if(!Number.isFinite(open))return '请选择有效的开舱日期和时间。';
    if(open<=now+minimumMinutes*60000)return '开舱时间太近或已过，请设为当前时间十五分钟以后，再重新下载揭示文件。';
    return '';
  }
  function assert(draft,now=Date.now()){
    const error=validate(draft,now);if(error)throw Error(error);
    return Math.floor(parse(draft)/1000);
  }
  function suggest(now=Date.now(),minutes=20){
    // Round up to a minute, leaving five minutes for reviewing and signing.
    const ms=Math.ceil((now+minutes*60000)/60000)*60000;
    const beijing=new Date(ms+8*3600000).toISOString();
    return {date:beijing.slice(0,10),time:beijing.slice(11,16)};
  }
  return {minimumMinutes,parse,validate,assert,suggest};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CommitmentTime;

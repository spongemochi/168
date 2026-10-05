const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Time=require('./commitment-time');

test('form rejects expired and fifteen-minute boundary; suggested time works across Beijing midnight',()=>{
  const now=Date.parse('2026-10-04T23:55:30+08:00');
  assert(Time.validate({date:'2026-10-04',time:'13:51'},now));
  assert(Time.validate({date:'2026-10-05',time:'00:10'},now));
  const next=Time.suggest(now);
  assert.deepEqual(next,{date:'2026-10-05',time:'00:16'});
  assert.equal(Time.validate(next,now),'');
  assert.equal(Time.assert(next,now),Date.parse('2026-10-05T00:16:00+08:00')/1000);
});

test('an aged prepared commitment never requests a wallet transaction; reveal remains sendable',async()=>{
  const requests=[];
  const wallet='0x'+'a'.repeat(40),hub='0xe61a9c7213a6aa616c246a2b569e555b417b25ee';
  const ctx=vm.createContext({CommitmentTime:Time,Date,Chain168:{authorized:async()=>wallet,assertProcessor:async()=>{}},
    provider:{request:async({method})=>{requests.push(method);return 'hash';}}});
  vm.runInContext(fs.readFileSync(__dirname+'/tape-runtime.js','utf8')+';globalThis.runtime=Tape168;',ctx);
  ctx.wallet=wallet;ctx.expired={tx:{to:hub,data:'0x'},open:Math.floor(Date.now()/1000)+60};
  await assert.rejects(vm.runInContext('runtime.send(provider,wallet,expired)',ctx),/开舱时间已太近/);
  assert.equal(requests.length,0);
  ctx.reveal={tx:{to:hub,data:'0x'}};
  await vm.runInContext('runtime.send(provider,wallet,reveal)',ctx);
  assert.deepEqual(requests,['eth_sendTransaction']);
});

test('scoring suggestion leaves two hours rather than the ordinary twenty-minute horizon',()=>{
 const time=require('./commitment-time.js'),now=Date.parse('2026-10-04T23:50:10+08:00');
 const suggestion=time.suggest(now,120),open=Date.parse(suggestion.date+'T'+suggestion.time+':00+08:00');
 assert.ok(open-now>=120*60000);assert.ok(open-now<121*60000);
});

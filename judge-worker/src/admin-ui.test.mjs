import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'发布',disabled:false});return elements.get(id);}};
  const code=fs.readFileSync(new URL('../public/admin/console.mjs',import.meta.url),'utf8').replace(/^import .*\n/,'').split("action('connect'")[0];
  const context={document,setTimeout,clearTimeout,AbortSignal,tchain:{createTapeSendChains:()=>new Map([[196,{}]]),endpointId:()=>''}};
  vm.runInNewContext(code+'\nthis.ui={readStep,action,publish};',context);
  return {ui:context.ui,get:id=>document.getElementById(id)};
}
test('missing wallet produces visible feedback beside publish and restores the button',async()=>{
  const {ui,get}=setup();ui.action('publish',ui.publish);await get('publish').onclick();
  assert.match(get('publish-status').textContent,/连接判官钱包/);
  assert.equal(get('status').textContent,get('publish-status').textContent);
  assert.equal(get('publish').disabled,false);
});
test('timed out read cannot continue to a later send when the underlying read eventually resolves',async()=>{
  const {ui}=setup();let resolve,sends=0;
  const pending=new Promise(r=>{resolve=r;});
  const action=async()=>{await ui.readStep('核验',()=>pending,5);sends++;};
  await assert.rejects(action(),/超时/);resolve('late');await Promise.resolve();
  assert.equal(sends,0);
});
test('successful read returns its result and displays the current step',async()=>{
  const {ui,get}=setup();assert.equal(await ui.readStep('核对原文',async()=>42),42);
  assert.match(get('publish-status').textContent,/核对原文/);
});

import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./scoring-ui.js',import.meta.url),'utf8');
function fixture(fetch){
 const button={},target={isConnected:true,innerHTML:'',querySelector:()=>button};
 const context={fetch,AbortSignal,TypeError,setTimeout:fn=>fn(),renderPublicCase(){},resident(){},V:{innerHTML:''},$:()=>target,heading:()=>'',esc:String};
 vm.runInNewContext(source,context);return {context,target,button};
}
test('network failure explains that scores are unread and offers retry rather than fabricating zero',async()=>{
 let calls=0;const {context,target,button}=fixture(async()=>{calls++;throw new TypeError('Failed to fetch');});
 await context.ranking();assert.equal(calls,2);assert.match(target.innerHTML,/分数尚未读取/);assert.match(target.innerHTML,/重新读取/);assert.equal(typeof button.onclick,'function');
});
test('disabled scoring and an empty verified leaderboard remain distinct from an unavailable service',async()=>{
 const {context,target}=fixture(async()=>Response.json({enabled:false,rows:[],records:[],asOf:1791121860}));
 await context.ranking();assert.match(target.innerHTML,/新判断计分暂未启用/);assert.match(target.innerHTML,/样本积累中/);assert.doesNotMatch(target.innerHTML,/Failed to fetch/);
});

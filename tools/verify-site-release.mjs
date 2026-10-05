import {readFile} from 'node:fs/promises';
import {createKernel} from '../vendor/tapesend-src/kernel/src/index.js';
import {compareBytes} from './site-publish-core.mjs';
import {installReadOnlyProxy} from './scoring-curl.mjs';
installReadOnlyProxy();
console.log('只读校验新版链上网站：使用已配置的网络，不读取密钥、不发送交易。');
const root=new URL('../release/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',root)));
const kernel=createKernel({locale:'zh',fetchImpl:globalThis.fetch}),res=await kernel.resolve(m.name);
if(res.container!==m.container||res.chainId!==196)throw Error('链上目标不匹配。');
const site=await kernel.openSite(res);
for(const entry of m.files){const file=await site.get(entry.path),local=new Uint8Array(await readFile(new URL('site/'+entry.path,root)));if(file.status!=='ok'||!compareBytes(file.bytes,local))throw Error('链上文件未完整核验：'+entry.path);console.log('已与多个链节点核对：'+entry.path);}
console.log('完整站点校验通过；名字状态：'+res.status);

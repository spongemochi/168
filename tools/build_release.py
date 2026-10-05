# coding: utf-8
"""Create an allowlisted static publication folder; never copy private backups or worker config."""
from pathlib import Path
import re,json,hashlib,subprocess,zipfile
b=Path(__file__).resolve().parents[1]
esbuild=b/'node_modules/.bin/esbuild'
if not esbuild.exists():raise SystemExit('Missing esbuild; run npm ci at the repository root first.')
out=b/'release/site';out.mkdir(parents=True,exist_ok=True)
s=(b/'index.html').read_text()
a=s.index('function fixtures()');z=s.index('const api={Store,fixtures,',a)
s=s[:a]+'''class Store {
 constructor(data){this.data=data;}
 get residents(){return this.data.residents;} get records(){return this.data.records;}
 get active(){return this.residents.find(p=>p.id===this.data.active)||null;}
 get(id){return this.records.find(r=>r.id===id);} by(owner){return this.records.filter(r=>r.owner===owner);}
 select(id){const p=this.residents.find(p=>p.id===id&&p.type!=='judge');if(!p)throw Error('请核验居民身份。');this.data.active=id;return p;}
}
'''+s[z:].replace('const api={Store,fixtures,','const api={Store,',1)
s=s.replace("goal:'一个目标',letter:'写给未来'","goal:'一个目标'")
s=s.replace('等于阈值记为未中（体验规则）','等于阈值记为未中').replace('到期公开读信（本原型演示方式）','到期公开读信')
s=s.replace('本次演示采用到期公开读信','到期公开读信')
s=s.replace('示例累计判断分曲线','累计判断分曲线')
s=s.replace('人和 Agent 将使用同一套计分规则。','人和 Agent 将使用同一套计分规则。')
# Minify inline JavaScript without bundling away relative dynamic imports.
def minify(code,loader):
 return subprocess.run([str(esbuild),'--minify','--legal-comments=inline','--loader='+loader],input=code,text=True,capture_output=True,check=True).stdout.strip()
s=re.sub(r'<script>([\s\S]*?)</script>',lambda m:'<script>'+minify(m[1],'js').replace('</script','<\\/script')+'</script>',s)
s=re.sub(r'<style>([\s\S]*?)</style>',lambda m:'<style>'+minify(m[1],'css')+'</style>',s)
s=re.sub(r'<!--[^>]*-->','',s)
(out/'index.html').write_text(s)
files=['vendor/tapesend.bundle.mjs','tools/judge-key-crypto.mjs','tools/judge-api.mjs','app/protocol/scv1-ref.mjs','app/protocol/scv1-reveal.mjs','judge-worker/src/protocol.mjs','app/scoring/rules.mjs']
for p in files:
 dst=out/p;dst.parent.mkdir(parents=True,exist_ok=True)
 dst.write_text(minify((b/p).read_text(),'js'))
entries=[]
for p in [*files,'index.html']:
 data=(out/p).read_bytes();entries.append(dict(path=p,bytes=len(data),sha256='0x'+hashlib.sha256(data).hexdigest(),contentType='text/html; charset=utf-8' if p.endswith('.html') else 'text/javascript; charset=utf-8',chunks=(len(data)+23999)//24000))
manifest=dict(name='1.2.168.tape',chainId=196,container='0xf053f07efcc2ade76d35dfbb6ed7c0f8eb976d35',registry='0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6',files=entries,totalBytes=sum(x['bytes'] for x in entries),transactions=sum(x['chunks'] for x in entries)+1)
(b/'release/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(b/'release/168-onchain-site.zip','w',zipfile.ZIP_DEFLATED) as f:
 for p in [*files,'index.html']:f.write(out/p,p)
print(json.dumps({k:v for k,v in manifest.items() if k!='files'}))

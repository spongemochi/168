from pathlib import Path
import re
b=Path(__file__).resolve().parents[1]
s=(b/'168-original-prototype.html').read_text()
head=s.split('<body')[0]
head=re.sub(r'<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?', '',head)
head=head.replace('</style>',(b/'tools/prototype-enhancements.css').read_text()+'\n'+(b/'tools/flow.css').read_text()+'\n</style>')
head=head.replace('<title>168 · 一路发</title>','<title>168 · 一路发｜从承诺到履历</title>')
body='''<body class="home"><canvas id="dust" aria-hidden="true"></canvas><canvas id="heap" aria-hidden="true"></canvas><div class="veil"></div>
<div id="storage-note" role="status"></div>
<div class="top"><a class="mark" href="#/"><b>168</b> · 一路发</a><div class="theme-pick" role="group" aria-label="外观主题"><button data-prototype-theme="dark" aria-pressed="true">黑金</button><button data-prototype-theme="light" aria-pressed="false">白色</button></div><nav class="tnav" aria-label="主导航"><a href="#/">封存</a><a href="#/all">档案</a><a href="#/ranking">一路发榜</a><a href="#/me">我的一路</a><a href="#/judge">判官</a><a href="#/about">关于</a></nav><button type="button" class="wallet-trigger" id="wallet-trigger" aria-haspopup="dialog">连接钱包</button></div>
<main id="view"></main><div class="peek" id="peek"></div><dialog id="flow-dialog" aria-label="封存与身份设置"></dialog><dialog id="wallet-dialog" aria-label="钱包连接"></dialog><script>'''
rank=(b/'tools/prototype-ranking.js').read_text()
rank=rank[rank.index('const rankState='):]
rank=rank[:rank.index('function resident(')]+rank[rank.index('function setPrototypeTheme'):]
rank='''function rankRecords(p,days){return store.by(p.id).filter(r=>['price','event'].includes(r.kind)&&r.stake&&(!days||r.created>=D(-days))).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)).map(r=>({...r,result:FlowModel.result(r)}));}
function rankStats(records){return FlowModel.stats(records);}
function rankList(o){return store.residents.filter(p=>p.type!=='judge'&&(o.type==='all'||p.type===o.type)).filter(p=>`${p.name} ${p.address}`.toLowerCase().includes(o.search.toLowerCase())).map(p=>({...p,records:rankRecords(p,o.days),stats:rankStats(rankRecords(p,o.days))})).filter(p=>p.stats.count>0&&p.stats.count>=o.min).sort((a,b)=>(b.stats[o.sort]??-Infinity)-(a.stats[o.sort]??-Infinity)||b.stats.count-a.stats.count||a.id.localeCompare(b.id));}
'''+rank
rank=rank.replace('最近 7 天','最近 7 天提交').replace('最近 30 天','最近 30 天提交')
rank=rank.replace('先读记录，再读分数。','只统计已背书、已最终裁决的价格与事件判断。')
rank=rank.replace('分数相同时，已裁决样本量较多者在前；仍相同则按固定居民标识排序。','正式榜单仅统计符合计分规则的链上记录。')
rank=rank.replace('本页全部数据为虚构示例，逐条记录与统计一致；没有连接真实判官或链上数据，也不代表真实信用排名。','正式裁决与榜单索引尚未上线，因此目前不展示任何分数；判官不参与排名。')
rank=rank.replace('人和 Agent 使用同一套示例计分规则。','人和 Agent 将使用同一套计分规则。').replace('已裁决的示例判断','已裁决的判断').replace(' · 示例数据',' · 暂无正式榜单').replace('当前筛选范围内的示例排名','当前筛选范围内的排名').replace('本页使用示例值','待判官正式给出').replace('这只是原型规则，不代表已解决选择性揭示问题。','未揭示惩罚规则仍待确定。')
canvas=s[s.index('// ————— 尘埃 —————'):s.index('function paintChrome() {')]
canvas=canvas.replace("const SAMPLE = CAPS.map((c) => c.t).concat(['今年练到能跑半马', '这轮牛市还没结束', '三年内搬去另一个城市']);", "const SAMPLE = ['一段等待时间检验的承诺'];")
start=canvas.index('    pk.innerHTML =')
end=canvas.index('    pk.style.left', start)
canvas=canvas[:start]+'''    const r=store.records.length?store.records[Math.abs(hit.no)%store.records.length]:null;
    pk.innerHTML=r?`<div class="no">${FlowModel.names[r.kind]} · ${label(r)}</div><div class="t">${esc(recordText(r))}</div><a href="#/record/${r.id}" class="b">查看记录 ↗</a>`:'<div class="no">168 · 一路发</div><div class="t">真实记录，正在等待第一句话。</div>';
'''+canvas[end:]
canvas=canvas.replace("x.globalAlpha = p.a; x.fillStyle = '#CFCAB8';", "x.globalAlpha=p.a;x.fillStyle=document.documentElement.dataset.theme==='light'?'#8c7a4e':'#CFCAB8';")
canvas=canvas.replace('const breathe = .88',"const lightTheme=document.documentElement.dataset.theme==='light';\n    const breathe = .88")
canvas=canvas.replace('x.fillStyle = `rgba(16,16,19,${.55 + l})`;','x.fillStyle=lightTheme?`rgba(234,230,215,${.65+l})`:`rgba(16,16,19,${.55+l})`;')
canvas=canvas.replace('gold ? `rgba(216,169,59,${.28 + l * 2})` : `rgba(255,255,255,${l})`','gold ? (lightTheme ? `rgba(139,106,36,${.38+l*2})` : `rgba(216,169,59,${.28+l*2})`) : (lightTheme ? `rgba(96,94,76,${l*1.2})` : `rgba(255,255,255,${l})`)')
canvas=canvas.replace('x.strokeStyle = `rgba(255,255,255,${l * .8})`;','x.strokeStyle=lightTheme?`rgba(96,94,76,${l*.8})`:`rgba(255,255,255,${l*.8})`;')
# Original animations are decorative, not additional records.
canvas=canvas.replace('for (let i = 0; i < 2200; i++)','for (let i = 0; i < 1400; i++)')
# Respect reduced motion by drawing one still frame.
canvas=canvas.replace('requestAnimationFrame(draw);',"if(!matchMedia('(prefers-reduced-motion: reduce)').matches)requestAnimationFrame(draw);")
canvas=canvas.replace('requestAnimationFrame(paint);',"if(!matchMedia('(prefers-reduced-motion: reduce)').matches)requestAnimationFrame(paint);")
# Keep canvas redraw on navigation; off-screen work is skipped by original renderer.
canvas=canvas.replace("return if(!matchMedia('(prefers-reduced-motion: reduce)').matches)requestAnimationFrame(paint);",'return requestAnimationFrame(paint);')
script=(b/'tools/commitment-time.js').read_text()+'\n'+(b/'tools/flow-model.js').read_text()+'\n'+(b/'tools/flow-app.js').read_text()+'\n'+(b/'tools/chain-runtime.js').read_text()+'\n'+(b/'tools/tape-runtime.js').read_text()+'\n'+(b/'tools/wallet-ui.js').read_text()+'\n'+rank+'\n'+canvas+'\nroute();'
out=b/'168-prototype-v2.html'
backup=b/'168-prototype-visual-backup.html'
if out.exists() and not backup.exists():backup.write_bytes(out.read_bytes())
out.write_text(head+body+script+'\n</script></body></html>')
(b/'tools/generated-flow-check.js').write_text(script)
print(out)

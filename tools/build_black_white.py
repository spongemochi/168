from pathlib import Path
b=Path(__file__).resolve().parents[1]
s=(b/'168-prototype-v2.html').read_text()
s=s.replace('</style>',(b/'tools/black-white-home.css').read_text()+'\n'+(b/'tools/resident-journey.css').read_text()+'\n</style>',1)
s=s.replace('<title>168 · 一路发｜从承诺到履历</title>','<title>168 · 一路发｜封了，就改不了了。</title>',1)
s=s.replace("'168-prototype-theme'","'168-black-white-theme'")
s=s.replace('\nroute();\n</script>', '\n'+(b/'tools/black-white-home.js').read_text()+'\n'+(b/'tools/resident-journey.js').read_text()+'\n'+(b/'tools/scoring-ui.js').read_text()+'\nroute();\n</script>')
out=b/'168-black-white.html'
out.write_text(s)
index=b/'index.html'
index.write_text(s)
print(out)

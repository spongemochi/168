"""Generate editable SVG diagrams and PNG previews from the current documented implementation.
Requires Pillow and a CJK font. Override README_FONT to use another local font.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import os, html, math
ROOT=Path(__file__).resolve().parents[1]
FONT=os.environ.get('README_FONT','/System/Library/Fonts/Hiragino Sans GB.ttc')
W=1600
class Figure:
 def __init__(self,name,title,subtitle,h=920):
  self.name,self.h=name,h;self.im=Image.new('RGB',(W,h),'white');self.d=ImageDraw.Draw(self.im);self.svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}" role="img"><title>{html.escape(title)}</title><desc>{html.escape(subtitle)}</desc><rect width="100%" height="100%" fill="white"/>']
  self.text(55,35,title,38,bold=True);self.text(55,93,subtitle,24,'#555');self.line([(55,h-95),(W-55,h-95)],color='#555');self.text(55,h-69,'168 · 一路发  |  版本与验收依据：2026-10-05 README',22,'#555')
 def text(self,x,y,s,size=26,color='#181818',bold=False):
  s=s.replace('−','-').replace('⁶','^6')
  font=ImageFont.truetype(FONT,size)
  box=self.d.textbbox((0,0),s,font=font)
  if x+box[2]>W-24 or y+size>self.h-15:raise ValueError('text overflow: '+s)
  self.d.text((x,y-box[1]),s,font=font,fill=color,stroke_width=0)
  self.svg.append(f'<text x="{x}" y="{y}" dominant-baseline="text-before-edge" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, sans-serif" font-size="{size}" font-weight="{600 if bold else 400}" fill="{color}">{html.escape(s)}</text>')
 def box(self,x,y,w,h,title=None,lines=(),fill='#fff',dash=False,size=27):
  self.d.rectangle((x,y,x+w,y+h),fill=fill,outline='#333',width=2)
  self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#333" stroke-width="2"'+(' stroke-dasharray="8 5"' if dash else '')+'/>')
  if title:self.text(x+20,y+17,title,size,bold=True)
  for i,s in enumerate(lines):
   size_line=22
   while ImageFont.truetype(FONT,size_line).getlength(s)>w-40 and size_line>16:size_line-=1
   self.text(x+20,y+62+36*i,s,size_line,'#555')
 def line(self,points,color='#333',width=2,arrow=False,dash=False):
  if dash:
   for a,b in zip(points,points[1:]):
    length=math.dist(a,b)
    for k in range(0,int(length),14):
     u=k/length;v=min(k+7,length)/length;self.d.line((a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v),fill=color,width=width)
  else:self.d.line(points,fill=color,width=width)
  self.svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in points)+f'" fill="none" stroke="{color}" stroke-width="{width}"'+(' stroke-dasharray="7 7"' if dash else '')+'/>')
  if arrow:
   a,b=points[-2:];angle=math.atan2(b[1]-a[1],b[0]-a[0]);ps=[b,(b[0]-14*math.cos(angle-.4),b[1]-14*math.sin(angle-.4)),(b[0]-14*math.cos(angle+.4),b[1]-14*math.sin(angle+.4))];self.d.polygon(ps,fill=color);self.svg.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in ps)+f'" fill="{color}"/>')
 def dot(self,x,y,r=6):
  self.d.ellipse((x-r,y-r,x+r,y+r),fill='#111');self.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#111"/>')
 def save(self):
  out=ROOT/'assets';out.mkdir(exist_ok=True);self.im.save(out/(self.name+'.png'),optimize=True);(out/(self.name+'.svg')).write_text('\n'.join(self.svg+['</svg>']))

f=Figure('readme-01-architecture','图 1  系统结构与公开记录生命周期','复用 TapeOut 身份、容器与 TapeSend；执行服务与独立读取各有职责。')
f.text(55,159,'(a) 分层结构',27,bold=True)
layers=[('应用读取','前端 · Agent · 独立重建客户端'),('168 应用','封存 · 揭示 · 裁决 · 事前回执 · 计分'),('身份与容器','居民 n.2.168 · 判官 1.2.168 · NAND 背书'),('消息与结算','TAP-10 / SCV1 · X Layer 196')]
for i,(title,line) in enumerate(layers):f.box(55,212+i*120,620,102,title,[line],fill='#f7f7f7' if i==1 else '#fff')
f.text(760,159,'(b) 消息经核验后更新状态',27,bold=True)
f.box(760,240,230,105,'封存',['原文与规则加密'])
f.box(1120,240,310,105,'到期',['等待有效公开揭示'])
f.line([(990,292),(1120,292)],arrow=True);f.text(1010,253,'到 T',22)
f.box(1120,448,310,105,'已揭示',['公开单条内容密钥'])
f.line([(1275,345),(1275,448)],arrow=True)
f.box(760,448,230,105,'已裁决',['结果与来源可查'])
f.line([(1120,500),(990,500)],arrow=True)
f.box(1120,641,310,100,'未揭示',['到期后七天仍未核验'])
f.line([(1430,292),(1480,292),(1480,692),(1430,692)],arrow=True)
f.text(55,730,'Worker / D1：索引、历史缓存、定时执行与私有参数保存。',24)
f.text(55,772,'公开消息与历史材料支持独立重建；分数由规则计算，非单独的合约资产余额。',24)
f.save()

f=Figure('readme-02-message-sequence','图 2  一条背书价格判断怎样结算','当前 v6 流程：事前回执只公开哈希；裁决和公开参数是分别关联原承诺的消息。',h=1100)
xs=[145,430,740,1075,1440]
for x,t,s in zip(xs,['作者钱包','链上消息','判官服务','历史价格','读取者 / Agent'],['居民 + 背书','TapeSend / X Layer','1.2.168 + Worker','Chainlink / OKX','读取与核验']):
 f.box(x-105,165,210,100,t,[s],size=24);f.line([(x,265),(x,935)],color='#888',dash=True)
def msg(a,b,y,label):
 f.line([(xs[a],y),(xs[b],y)],arrow=True);f.text(min(xs[a],xs[b])+12,y-37,label,23)
msg(0,1,316,'① 流片独立 NAND 背书')
msg(0,1,395,'② 封存原话、价格规则与 slot')
msg(1,2,474,'③ 核验原始消息')
msg(2,1,553,'④ 十分钟内回执：参数哈希')
f.line([(55,610),(1545,610)],color='#aaa',dash=True);f.text(630,584,'到期开舱 T',24,'#555')
msg(2,1,670,'⑤ 揭示：公开单条内容密钥')
msg(2,3,741,'⑥ 读取 T 时刻历史价')
msg(3,2,811,'⑦ 返回价格与边界证据')
msg(2,1,882,'⑧ 裁决 + 另发公开参数')
f.text(80,955,'⑨ 读取者核对公开材料，重新计算 p、价格结果、分数与排序。',24)
f.save()

f=Figure('readme-03-scoring-assets','图 3  判断分与晶体管用途','p 是事前固定的历史频率基准；分数与资产价格、余额分别处理。')
f.text(55,160,'(a) 计分：命中 1−p，未中 −p',27,bold=True)
x0,x1=115,690
f.line([(x0,800),(x0,225)],arrow=True);f.line([(x0,520),(735,520)],arrow=True)
f.text(76,214,'分数',22);f.text(728,534,'p',22)
for y,s in [(260,'+1'),(390,'+0.5'),(520,'0'),(650,'−0.5'),(780,'−1')]:f.text(55,y-13,s,21,'#555')
f.line([(x0,260),(x1,520)],width=3);f.text(398,297,'命中：1−p',25)
f.line([(x0,520),(x1,780)],dash=True,width=3);f.text(455,715,'未中：−p',25)
p=.178977;px=x0+(x1-x0)*p;hy=520-260*(1-p);my=520+260*p
f.dot(px,hy);f.dot(px,my);f.line([(px,hy),(px,my)],dash=True,color='#aaa');f.text(px+18,hy-16,'+0.821023',23);f.text(130,my+35,'−0.178977',23);f.text(px-40,475,'p=0.178977',21,'#555')
f.text(130,791,'有效 p 范围：0.05–0.95；整数精度 10⁶。',22)
f.text(815,160,'(b) 用途与发行披露',27,bold=True)
rows=[('操作','NAND 消耗','当前状态'),('居民身份','1 枚','主网已使用'),('判断背书','另 1 枚','一枚对应一笔'),('普通封存 / 揭示','无额外背书','支付网络费'),('社区评审 / 守约分','规则待定','后续规划')]
for i,(a,b,c) in enumerate(rows):
 y=227+i*78;f.line([(815,y),(1545,y)],color='#999');f.text(827,y+22,a,24);f.text(1120,y+22,b,24);f.text(1340,y+22,c,23)
f.box(815,651,730,144,'发行参数须以部署证据核对',[
 '原设计标注：单价 0.06 OKB，上限 100,000。',
 '初始供应、部署设置与权限尚待链上凭证。'],fill='#f7f7f7',size=27)
f.save()

f=Figure('readme-04-roadmap','图 4  从可验证记录，到协作与资源分配','实线阶段已有实现与验收；虚线阶段是下一步，不代表已经发放资源。')
cols=[55,440,825,1210]
items=[('记录','已完成主网闭环',['身份与信箱','封存、揭示、裁决','失败记录同样保留']),('履历','首笔计分 + 独立重建',['事前 p 回执','公开参数与分数','正式榜要求十条']),('Agent 接口','真实读取已通过',['读取与重算客户端','密文与未签名交易','钱包提交待验收']),('协作 / 资源','政策与执行待完成',['任务选择与资格规则','额度、周期与权重','社区裁决 / 守约评审'])]
for i,(title,state,lines) in enumerate(items):
 x=cols[i];f.box(x,240,330,355,title,lines,fill='#f7f7f7' if i<2 else '#fff',dash=i==3,size=32);f.text(x+18,544,state,21,'#555')
 if i<3:f.line([(x+330,375),(cols[i+1],375)],arrow=True,dash=i==2)
f.box(55,661,1490,132,'人和 Agent 用同一套记录与计分规则',[
 '示例可辅助决定与谁合作；当前不自动转账、不伪造正式榜候选。'],size=28)
f.save()
print('Generated four current-version PNG diagrams and editable SVG sources.')

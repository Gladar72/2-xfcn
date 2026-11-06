import os,re
SRC=["#2F6BFF","#7A4DFF","#FF4F9A","#FF8A3D","#FFC93C","#2FD3FF","#2FD98A","#B58CFF","#FF4A4A","#E9E0FF"]
A=[(0,"#14248F"),(.18,"#2F56E8"),(.36,"#8FA6FF"),(.46,"#F2F4FF"),(.54,"#E6E2FF"),(.66,"#FF6FB0"),(.82,"#FF7A3A"),(1,"#5A1F7A")]
B=[(0,"#F6F4FF"),(.2,"#9FB0FF"),(.42,"#2442D8"),(.6,"#1A2A9A"),(.75,"#B455D8"),(.9,"#FF6F9A"),(1,"#FF9A5A")]
Cc=[(0,"#2A3FD0"),(.3,"#C7D1FF"),(.45,"#FFFFFF"),(.6,"#FF8AC0"),(1,"#3A2AA8")]
def lg(i,st,a): return f'<linearGradient id="{i}" x1="{a[0]}" y1="{a[1]}" x2="{a[2]}" y2="{a[3]}">'+''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o,c in st)+'</linearGradient>'
FILT='''<filter id="mt" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="b"/><feSpecularLighting in="b" surfaceScale="3" specularConstant=".9" specularExponent="40" lighting-color="#fff" result="s"><fePointLight x="22" y="2" z="55"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feOffset in="SourceAlpha" dx="0" dy="2" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="edge"/><feFlood flood-color="#FF7A3A"/><feComposite in2="edge" operator="in" result="or"/><feOffset in="SourceAlpha" dx="0" dy="-1.4" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="edge2"/><feFlood flood-color="#fff" flood-opacity=".85"/><feComposite in2="edge2" operator="in" result="wt"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="or"/><feMergeNode in="wt"/><feMergeNode in="s2"/></feMerge></filter><filter id="dsh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#14103A" flood-opacity=".3"/></filter>'''
os.makedirs('ico_chrome2',exist_ok=True)
for f in sorted(os.listdir('ico')):
    s=open('ico/'+f).read()
    defs=lg('cA',A,(0,0,1,1))+lg('cB',B,(1,0,0,1))+lg('cC',Cc,(0,.2,1,.8))
    cnt=[0]
    def rep(m):
        cnt[0]+=1;return 'url(#'+['cA','cB','cC'][cnt[0]%3]+')'
    s=re.sub(r'url\(#[^)]+\)',rep,s)
    for c in SRC: s=s.replace(f'fill="{c}"','fill="url(#cB)"').replace(f'stroke="{c}"','stroke="url(#cA)"')
    s=s.replace('fill="#fff"','fill="#F2F0FA"')
    s=re.sub(r'<defs>.*?</defs>','<defs>'+FILT+defs+'</defs>',s,flags=re.S)
    s=s.replace('</defs>','</defs><g filter="url(#dsh)"><g filter="url(#mt)">',1).replace('</svg>','</g></g></svg>')
    open('ico_chrome2/'+f,'w').write(s)
print(len(os.listdir('ico_chrome2')))

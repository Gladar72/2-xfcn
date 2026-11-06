import re, os
D = os.path.dirname(os.path.abspath(__file__))
p = re.findall(r'<path[^>]*d="([^"]+)"', open(os.path.join(D, 'img/wordmark-white.svg')).read())[4]
bx, by, bw, bh = 137.89, 245.08, 75.59, 53.31
cx0, cy0 = bx + bw / 2, by + bh / 2

def grad(i, stops, x2=1, y2=1):
    return f'<linearGradient id="{i}" x1="0" y1="0" x2="{x2}" y2="{y2}">' + "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops) + '</linearGradient>'

def icon(tile, glyph, w=880, rot=0, dx=0, dy=0, flip=False, inner="#8A93E8", tex_scale=1900, tex_off=(0, 0)):
    sc = w / bw
    fl = " scale(1,-1)" if flip else ""
    T = f"translate({512+dx},{512+dy}) rotate({rot}){fl} scale({sc:.4f}) translate({-cx0:.2f},{-cy0:.2f})"
    defs = ""
    # tile
    if tile == "tex":
        s = tex_scale
        tile_el = f'<image href="img/body_base.png" x="{512-s/2+tex_off[0]}" y="{512-s/2+tex_off[1]}" width="{s}" height="{s}" preserveAspectRatio="none"/><rect x="100" y="100" width="824" height="824" fill="#fff" opacity=".12"/>'
    else:
        defs += grad("tg", tile)
        tile_el = '<rect x="100" y="100" width="824" height="824" fill="url(#tg)"/><rect x="100" y="100" width="824" height="824" fill="url(#tp)"/><rect x="100" y="100" width="824" height="824" fill="url(#tb)"/>'
    # glyph
    if glyph == "tex":
        g_el = (f'<clipPath id="gc"><path transform="{T}" d="{p}"/></clipPath>'
                f'<g filter="url(#gs)"><g filter="url(#bev)"><g clip-path="url(#gc)"><image href="img/body_base.png" x="-300" y="-300" width="1624" height="1624" preserveAspectRatio="none"/>'
                f'<rect width="1024" height="1024" fill="#fff" opacity=".1"/></g></g></g>')
    else:
        defs += grad("gl", glyph, .5, 1)
        g_el = f'<g filter="url(#gs)"><g filter="url(#bev)"><path transform="{T}" d="{p}" fill="url(#gl)"/></g></g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs}
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F2F8"/><stop offset="1" stop-color="#E4E6F4"/></linearGradient>
<radialGradient id="tp" cx=".2" cy=".85" r=".6"><stop offset="0" stop-color="#FFC9B4" stop-opacity=".45"/><stop offset="1" stop-color="#FFC9B4" stop-opacity="0"/></radialGradient>
<radialGradient id="tb" cx=".85" cy=".15" r=".6"><stop offset="0" stop-color="#A9BEFF" stop-opacity=".45"/><stop offset="1" stop-color="#A9BEFF" stop-opacity="0"/></radialGradient>
<linearGradient id="lac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset=".52" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity=".85"/></linearGradient>
<filter id="bev" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/>
<feSpecularLighting in="b" surfaceScale="12" specularConstant="1.4" specularExponent="40" lighting-color="#fff" result="s"><fePointLight x="300" y="60" z="380"/></feSpecularLighting>
<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feOffset in="SourceAlpha" dy="-10" result="o"/><feGaussianBlur in="o" stdDeviation="9" result="ob"/>
<feComposite in="SourceAlpha" in2="ob" operator="out" result="inner"/><feFlood flood-color="{inner}" flood-opacity=".55"/><feComposite in2="inner" operator="in" result="innerc"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="innerc"/><feMergeNode in="s2"/></feMerge></filter>
<filter id="ds" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dy="34" stdDeviation="38" flood-color="#7C7FD8" flood-opacity=".3"/></filter>
<filter id="gs" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dy="14" stdDeviation="16" flood-color="#2A2A60" flood-opacity=".35"/></filter>
<clipPath id="cp"><rect x="100" y="100" width="824" height="824" rx="210"/></clipPath></defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<rect x="100" y="100" width="824" height="824" rx="210" fill="#DCD8F6" filter="url(#ds)"/>
<g clip-path="url(#cp)">{tile_el}{g_el}<path d="M100 100H924V450C700 400 380 420 100 500Z" fill="url(#lac)" opacity=".55"/></g>
<rect x="103" y="103" width="818" height="818" rx="207" fill="none" stroke="url(#rim)" stroke-width="6"/></svg>'''

WHITE = [(0, "#FFFFFF"), (.65, "#F6F4FF"), (1, "#E3E0FA")]
INK = [(0, "#3A3550"), (.5, "#1E1A2C"), (1, "#0D0B14")]
PEARL = [(0, "#FFFFFF"), (.6, "#F1EEF8"), (1, "#E2DEF2")]
PEACH = [(0, "#FFE2D4"), (.5, "#F2C8E4"), (1, "#C9C2FF")]
ICE = [(0, "#E9EFFF"), (.5, "#C8D6FF"), (1, "#AFC0FA")]
INKT = [(0, "#2E2A3E"), (.6, "#17141F"), (1, "#0A0910")]
V = [
 ("1 · Повёрнута, как в референсе", dict(tile="tex", glyph=WHITE, w=980, rot=-28, dx=30, dy=40)),
 ("2 · На боку", dict(tile="tex", glyph=WHITE, w=900, rot=90, dx=40, dy=10)),
 ("3 · Зеркальная «м»", dict(tile="tex", glyph=WHITE, w=900, rot=0, dx=10, dy=-40, flip=True)),
 ("4 · Перламутр + переливающаяся «м»", dict(tile=PEARL, glyph="tex", w=960, rot=-22, dx=20, dy=40, inner="#7C8AE0")),
 ("5 · Чёрный лак + переливающаяся «м»", dict(tile=INKT, glyph="tex", w=980, rot=-28, dx=30, dy=40, inner="#5060D0")),
 ("6 · Персик-сирень, «м» в угол", dict(tile=PEACH, glyph=WHITE, w=1200, rot=-15, dx=170, dy=170, inner="#C08AC8")),
 ("7 · Лёд, тёмная «м»", dict(tile=ICE, glyph=INK, w=960, rot=18, dx=-20, dy=30, inner="#000")),
 ("8 · Перламутр, тёмная «м» на боку", dict(tile=PEARL, glyph=INK, w=920, rot=-90, dx=-30, dy=0, inner="#000")),
]
for i, (l, kw) in enumerate(V):
    open(os.path.join(D, f"iv{i+1}.svg"), "w").write(icon(**kw))
open(os.path.join(D, "iv_labels.txt"), "w").write("\n".join(l for l, _ in V))

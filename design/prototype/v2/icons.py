import os
D = os.path.dirname(os.path.abspath(__file__))
G = {
 "Кофе": '<path d="M5 9.5h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.6a2.4 2.4 0 0 1 0 4.8H16"/><path d="M8.5 3.5c-.8 1 .8 2-.1 3M12 3.5c-.8 1 .8 2-.1 3"/>',
 "Кино": '<rect x="3.5" y="7" width="13" height="11" rx="2.5"/><path d="M16.5 11l4-2.5v8l-4-2.5"/><circle cx="7" cy="4.5" r="1.8"/><circle cx="12" cy="4.5" r="1.8"/>',
 "Бег": '<circle cx="15" cy="4.5" r="1.9"/><path d="M7.5 21l3-6 3 2.5V21"/><path d="M5.5 11.5L9 8.2l4.2.6 2.2 3.4 3.1 1"/><path d="M10.5 15L13 9"/>',
 "Йога": '<circle cx="12" cy="4.8" r="1.9"/><path d="M12 8v5.5"/><path d="M12 9.5l-4.5 3M12 9.5l4.5 3"/><path d="M4 18.5c2.2-2 5-2.8 8-2.8s5.8.8 8 2.8"/><path d="M8 18l4-4.5 4 4.5"/>',
 "Зал": '<path d="M7 8v8M17 8v8M4.5 10v4M19.5 10v4M7 12h10"/>',
 "Падел": '<path d="M13.5 3.5a6 6 0 0 1 4.2 10.2l-2 2a6 6 0 1 1-2.2-12.2z"/><path d="M8.5 15.5L4 20"/><circle cx="19" cy="19" r="1.8"/>',
 "Футбол": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.8 2.8-1.5 4.5H9.7l-1.5-4.5z"/><path d="M12 3.5v4M15.8 10.3l4-1.3M14.3 14.8l2.5 3.4M9.7 14.8l-2.5 3.4M8.2 10.3l-4-1.3"/>',
 "Вело": '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3.5 7H6M14 6h2.5"/>',
 "Прогулка": '<circle cx="13" cy="4.5" r="1.9"/><path d="M10 21l1.5-5.5 2.5 2V21M9 11l2-3h3l2 3.5 2.5.5M11.5 15.5L13.5 8"/>',
 "Вечеринка": '<path d="M4 20l5-13 8 8z"/><path d="M14 4.5l.5 2M18.5 5.5l-1.5 1.5M19.5 10l-2 .3M11 3l1 1.5"/>',
 "Бар": '<path d="M5 4.5h14l-7 8z"/><path d="M12 12.5V20M8.5 20h7"/><path d="M15 4.5l2.5-2"/>',
 "Ужин": '<path d="M7 3.5v6a2 2 0 0 0 2 2v9M11 3.5v6a2 2 0 0 1-2 2M9 3.5V8"/><path d="M16.5 20.5V3.5c-2 1-3 3.5-3 6.5 0 1.6 1 2.5 3 2.5"/>',
 "Завтрак": '<path d="M6.5 8.5c1.5-3.5 6-4.5 9-2.5 3.2 2 4.5 5.5 3 8.5-1.3 2.8-1 5-4.5 5.5-3.3.5-4-1.5-6.8-2.3C4.4 16.9 5 12 6.5 8.5z"/><circle cx="12.3" cy="12.2" r="3"/>',
 "Бизнес": '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/>',
 "Музыка": '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
 "Книги": '<path d="M4 5.5c2.8-1 5.5-.8 8 1 2.5-1.8 5.2-2 8-1v13c-2.8-1-5.5-.8-8 1-2.5-1.8-5.2-2-8-1z"/><path d="M12 6.5v13"/>',
 "Путешествия": '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.5 5.4 3.5 8.5s-.9 5.9-3.5 8.5c-2.6-2.6-3.5-5.4-3.5-8.5s.9-5.9 3.5-8.5z"/>',
 "Настолки": '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="url(#g)"/><circle cx="15.5" cy="15.5" r="1.2" fill="url(#g)"/><circle cx="12" cy="12" r="1.2" fill="url(#g)"/><circle cx="15.5" cy="8.5" r="1.2" fill="url(#g)"/><circle cx="8.5" cy="15.5" r="1.2" fill="url(#g)"/>',
 "Природа": '<path d="M12 3.5l6 9h-3.5l4 6h-13l4-6H6z"/><path d="M12 18.5v2"/>',
 "Танцы": '<circle cx="12" cy="4.5" r="1.9"/><path d="M12 8l-1 6 3 3 1 4M11 14l-3 3-2 0M7 7.5l5 .5 5-2.5"/>',
}

def icon_svg(path, sw=1.6):
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="url(#g)" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B4BFF"/><stop offset=".5" stop-color="#9A6BFF"/><stop offset="1" stop-color="#E58A9C"/></linearGradient></defs>%s</svg>') % (sw, path)

CSS = """
@font-face{font-family:ID;src:url(file:///usr/share/fonts/opentype/inter/InterDisplay-Medium.otf);font-weight:500}
@font-face{font-family:ID;src:url(file:///usr/share/fonts/opentype/inter/InterDisplay-Light.otf);font-weight:300}
@font-face{font-family:SR;src:url(img/Lora-Italic-Variable.ttf);font-style:italic}
*{margin:0;box-sizing:border-box}
body{width:1200px;font-family:ID;color:#17141F;padding:56px 56px 64px;
background:radial-gradient(40% 30% at 85% 10%,rgba(170,160,255,.45),transparent 70%),radial-gradient(40% 30% at 10% 80%,rgba(255,190,160,.4),transparent 70%),linear-gradient(180deg,#F5F3F8,#ECE8F2)}
h1{font:300 46px ID;letter-spacing:-1.2px}h1 em{font-family:SR;font-style:italic;font-weight:400}
p.s{font:300 18px ID;color:rgba(23,20,31,.6);margin-top:8px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:26px 20px;margin-top:44px}
.it{display:flex;flex-direction:column;align-items:center;gap:12px;font:500 16px ID}
.tile{width:118px;height:118px;border-radius:36px;position:relative;
background:linear-gradient(150deg,rgba(255,255,255,.95),rgba(255,255,255,.55) 55%,rgba(225,218,255,.6));
border:1.5px solid rgba(255,255,255,1);box-shadow:0 14px 30px rgba(70,50,140,.12),inset 0 -8px 18px rgba(160,140,255,.18),inset 0 6px 10px rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center}
.tile::before{content:"";position:absolute;inset:6px;border-radius:30px;background:radial-gradient(60% 45% at 30% 20%,rgba(255,255,255,.9),transparent 70%);pointer-events:none}
.tile svg{width:58px;height:58px;position:relative;filter:drop-shadow(0 4px 6px rgba(90,70,255,.22))}
.row{display:flex;gap:10px;margin-top:46px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px 0 8px;border-radius:22px;background:rgba(255,255,255,.65);border:1px solid #fff;font:500 16px ID;box-shadow:0 6px 16px rgba(70,50,140,.07)}
.chip .m{width:32px;height:32px;border-radius:11px;background:linear-gradient(150deg,#fff,rgba(230,224,255,.8));display:flex;align-items:center;justify-content:center}
.chip svg{width:20px;height:20px}
.chip.on{background:#17141F;color:#fff;border-color:#17141F}
"""
tiles = "".join(f'<div class="it"><div class="tile">{icon_svg(p)}</div>{n}</div>' for n, p in G.items())
chips = "".join(f'<span class="chip{" on" if i==0 else ""}"><span class="m">{icon_svg(G[n],1.9)}</span>{n}</span>' for i, n in enumerate(["Кофе", "Кино", "Бег", "Бар", "Музыка", "Падел"]))
html = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><h1>Иконки <em>интересов</em></h1><p class='s'>Стеклянная плитка, линия с переливом фиолетовый → персик. 20 штук, легко добавить новые.</p><div class='grid'>{tiles}</div><p class='s' style='margin-top:48px'>Так они выглядят в чипах фильтров и в профиле:</p><div class='row'>{chips}</div></body></html>"
open(os.path.join(D, "icons.html"), "w").write(html)

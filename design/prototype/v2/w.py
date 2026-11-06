import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import icon, PH
D = os.path.dirname(os.path.abspath(__file__))
INTER = "/usr/share/fonts/opentype/inter/"
def ico(n): return open(os.path.join(D, "ico", n + ".svg")).read()

BG = ("radial-gradient(55% 35% at 80% 18%,rgba(170,160,255,.45),rgba(170,160,255,0) 70%),"
      "radial-gradient(50% 30% at 15% 70%,rgba(255,190,160,.40),rgba(255,190,160,0) 70%),"
      "radial-gradient(60% 30% at 70% 100%,rgba(140,170,255,.35),rgba(140,170,255,0) 70%),"
      "linear-gradient(180deg,#F5F3F8 0%,#EEEBF3 60%,#E7E3EF 100%)")
CSS = f"""
@font-face{{font-family:ID;src:url(file://{INTER}InterDisplay-Light.otf);font-weight:300}}
@font-face{{font-family:ID;src:url(file://{INTER}InterDisplay-Regular.otf);font-weight:400}}
@font-face{{font-family:ID;src:url(file://{INTER}InterDisplay-Medium.otf);font-weight:500}}
@font-face{{font-family:ID;src:url(file://{INTER}InterDisplay-SemiBold.otf);font-weight:600}}
@font-face{{font-family:SR;src:url(img/Lora-Italic-Variable.ttf);font-style:italic}}
*{{box-sizing:border-box;margin:0;padding:0}}
:root{{--fg:#17141F;--fg2:rgba(23,20,31,.56);--ink:#17141F}}
body{{width:390px;height:844px;overflow:hidden;position:relative;font-family:ID;color:var(--fg);background:{BG}}}
em{{font-family:SR,serif;font-style:italic;font-weight:400}}
svg{{width:16px;height:16px;flex:none}}
.island{{position:absolute;top:11px;left:50%;width:124px;height:36px;margin-left:-62px;background:#000;border-radius:20px;z-index:40}}
.sb{{position:absolute;top:0;left:0;right:0;height:50px;display:flex;justify-content:space-between;align-items:center;padding:6px 30px 0 34px;font:600 16px ID;z-index:39}}
.hb{{position:absolute;bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:var(--fg);z-index:50}}
.g{{background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.95);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4)}}
.gw{{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.45);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);color:#fff}}
.chip{{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:18px;font:500 14px ID;white-space:nowrap}}
.chip .ii svg{{width:20px;height:20px}}.chip .ii{{display:flex;margin-left:-4px}}
.chip.on{{background:var(--ink);color:#fff;border-color:var(--ink)}}
.rb{{width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center}}.rb svg{{width:20px;height:20px}}
.h1{{font:300 38px/1.04 ID;letter-spacing:-1.2px}}.h1 em{{font-size:42px}}
.sub{{font:400 14px/1.45 ID;color:var(--fg2)}}
.sec{{display:flex;justify-content:space-between;align-items:baseline;padding:0 20px;margin-top:18px}}
.sec h3{{font:400 19px ID;letter-spacing:-.4px}}.sec h3 em{{font-size:21px}}.sec span{{font:500 13px ID;color:var(--fg2)}}
.row{{display:flex;gap:10px;padding:12px 20px 0;overflow:hidden}}
.card{{flex:none;position:relative;border-radius:26px;overflow:hidden;color:#fff;background-size:cover;background-position:center}}
.card::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(12,8,24,.7) 100%)}}
.card>*{{position:absolute;z-index:2}}
.card .tg{{top:10px;left:10px;height:28px;padding:0 10px;font-size:12px;border-radius:14px}}
.card .bt{{left:14px;right:14px;bottom:13px}}.card .tt{{font:500 16px/1.15 ID;letter-spacing:-.3px}}.card .tt em{{font-size:18px}}
.card .mm{{font:400 12px ID;opacity:.85;margin-top:4px}}
.avs{{display:flex}}.avs b{{width:26px;height:26px;border-radius:13px;border:2px solid #fff;margin-left:-8px;background-size:cover;background-position:center}}.avs b:first-child{{margin-left:0}}
.nav{{position:absolute;left:18px;width:354px;bottom:44px;height:70px;z-index:30;display:flex;justify-content:space-around;align-items:center;padding:0 6px;filter:drop-shadow(0 14px 22px rgba(60,40,120,.14))}}
.nav::before{{content:"";position:absolute;inset:0;clip-path:path("M35 0H154Q157.6 0 158.6 1.2A30.5 30.5 0 1 0 195.4 1.2Q196.4 0 200 0H319A35 35 0 0 1 319 70H35A35 35 0 0 1 35 0Z");background:rgba(246,244,250,.94);-webkit-backdrop-filter:blur(30px) saturate(1.6);backdrop-filter:blur(30px) saturate(1.6)}}
.nav .edge{{position:absolute;left:0;top:0;width:354px;height:70px;pointer-events:none;overflow:visible}}
.nav .it{{display:flex;flex-direction:column;align-items:center;gap:3px;font:500 10px ID;color:rgba(23,20,31,.62);width:62px;position:relative;z-index:1}}
.nav .it svg{{width:22px;height:22px;stroke-width:1.5}}.nav .it.on{{color:var(--ink)}}
.nav .sp{{width:92px}}
.nav .bl{{position:absolute;left:50%;top:-8px;width:66px;height:66px;margin-left:-33px;background:url(img/blobw.png) center/104% no-repeat;filter:drop-shadow(0 8px 14px rgba(110,80,255,.35));z-index:2}}
.nav .bl::after{{content:"";position:absolute;inset:0;background:linear-gradient(var(--pl),var(--pl)) center/20px 2.6px no-repeat,linear-gradient(var(--pl),var(--pl)) center/2.6px 20px no-repeat;opacity:.82;filter:drop-shadow(0 1px 3px rgba(60,20,120,.35))}}
.badge{{position:absolute;top:-6px;left:36px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;font:600 11px/17px ID;text-align:center;color:var(--ink);background:rgba(255,255,255,.75);border:1px solid #fff;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 2px 8px rgba(80,60,160,.18)}}
.btn{{height:54px;border-radius:27px;display:flex;align-items:center;justify-content:center;gap:8px;font:500 16px ID}}
.btn.d{{background:var(--ink);color:#fff}}.btn.l{{background:rgba(255,255,255,.6);border:1px solid #fff}}
"""
SB = '<i style="display:flex;gap:6px;align-items:center"><svg viewBox="0 0 18 12" style="width:18px;height:12px"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg viewBox="0 0 27 12" style="width:27px;height:12px"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="8" rx="2.2" fill="currentColor"/></svg></i>'
def chrome(c="#17141F"): return f'<div class="island"></div><div class="sb" style="color:{c}"><span>9:41</span>{SB}</div>'
def nav(on=0, plus="rgba(255,255,255,.95)"):
    items = [("home", "Главная"), ("map", "Карта"), None, ("chat", "Встречи"), ("user", "Профиль")]
    h = f'<div class="nav" style="--pl:{plus}"><svg class="edge" viewBox="0 0 354 70"><path d="M35 0H154Q157.6 0 158.6 1.2A30.5 30.5 0 1 0 195.4 1.2Q196.4 0 200 0H319A35 35 0 0 1 319 70H35A35 35 0 0 1 35 0Z" fill="none" stroke="#fff" stroke-width="1.2" opacity=".9"/></svg><div class="bl"></div>'
    for k, it in enumerate(items):
        if it is None: h += '<div class="sp"></div>'; continue
        b = '<span class="badge">2</span>' if it[0] == "chat" else ""
        h += f'<div class="it {"on" if k==on else ""}">{b}{icon(it[0])}<span>{it[1]}</span></div>'
    return h + "</div>"
def page(css, body, bg=None):
    extra = f"body{{background:{bg}}}" if bg else ""
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}{extra}{css}</style></head><body>{body}<div class='hb'></div></body></html>"
def chip(n, on=False, cls="g"): return f'<span class="chip {cls}{" on" if on else ""}"><span class="ii">{ico(n)}</span>{n}</span>'
AV = lambda *xs: '<div class="avs">' + "".join(f'<b style="{PH(x[0], x[1])};background-size:auto 260%"></b>' for x in xs) + "</div>"
ppl = [("running", "52% 4%"), ("running", "12% 12%"), ("walk", "70% 40%")]

S = {}
# 1 home
S["home"] = page("""
.top{padding:62px 20px 0}.city{display:flex;justify-content:space-between;align-items:center}
.city .p{height:40px;padding:0 14px 0 12px;border-radius:20px;display:flex;align-items:center;gap:7px;font:500 14px ID}.city .r{display:flex;gap:8px}
.chips{display:flex;gap:8px;padding:14px 20px 0;overflow:hidden}
.mos{margin:14px 20px 0;height:62px;border-radius:31px;display:flex;align-items:center;gap:10px;padding:0 8px 0 4px}
.mos .o{width:58px;height:58px;background:url(img/blobe.png) center/150% no-repeat}
.mos .t{font:400 14px/1.3 ID;flex:1}.mos .t b{font-weight:600}
.mos .go{height:42px;padding:0 16px;border-radius:21px;background:#17141F;color:#fff;font:500 13px ID;display:flex;align-items:center}
.inv{flex:none;width:112px;height:150px;border-radius:26px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;font:500 12px/1.25 ID;padding:0 10px}
.inv i{width:40px;height:40px;border-radius:20px;background:#17141F;color:#fff;display:flex;align-items:center;justify-content:center;font:300 26px ID;font-style:normal}
""", f"""{chrome()}
<div class="top"><div class="city"><div class="p g">{icon('pin')}Тюмень</div><div class="r"><div class="rb g">{icon('search')}</div><div class="rb g">{icon('bell')}</div></div></div>
<div class="h1" style="margin-top:20px">Найди <em>компанию</em><br>на сегодня</div></div>
<div class="chips"><span class="chip on">Все</span>{chip('Кофе')}{chip('Кино')}{chip('Бег')}{chip('Бар')}</div>
<div class="mos g"><div class="o"></div><div class="t"><b>3 человека</b> рядом свободны<br>сегодня вечером</div><div class="go">Найти</div></div>
<div class="sec"><h3>Личные <em>встречи</em></h3><span>Все</span></div>
<div class="row">
 <div class="card" style="width:176px;height:212px;{PH('running','45% center')}"><span class="tg gw chip">3 из 10</span><div class="bt"><div class="tt">Пробежка<br><em>на рассвете</em></div><div class="mm">Сб, 08:00 · Набережная</div></div></div>
 <div class="card" style="width:176px;height:212px;{PH('coffee','60% center')}"><span class="tg gw chip">2 из 4</span><div class="bt"><div class="tt">Кофе и<br><em>разговоры</em></div><div class="mm">Завтра, 19:00 · Центр</div></div></div>
</div>
<div class="sec"><h3>Люди <em>рядом</em></h3><span>Листать</span></div>
<div class="row">
 <div class="card" style="width:112px;height:150px;{PH('running','52% 4%')};background-size:auto 260%"><div class="bt"><div class="tt">Даша, 27</div><div class="mm">2 общих</div></div></div>
 <div class="card" style="width:112px;height:150px;{PH('running','12% 12%')};background-size:auto 240%"><div class="bt"><div class="tt">Олег, 31</div><div class="mm">Бег</div></div></div>
 <div class="inv g"><i>+</i>Здесь может быть ваше бизнес‑событие</div>
</div>
{nav(0)}""")

# 2 people deck
S["people"] = page("""
.top{position:absolute;top:58px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center;z-index:5}
.top h2{font:300 28px ID;letter-spacing:-.8px}.top h2 em{font-size:31px}
.dk{position:absolute;left:16px;right:16px;top:112px;height:480px;border-radius:34px;overflow:hidden;background-size:auto 215%;box-shadow:0 24px 50px rgba(60,40,110,.22)}
.dk::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(12,8,24,.78) 100%)}
.dk>*{position:absolute;z-index:2}
.dk .tg{top:14px;left:14px}.dk .ds{top:14px;right:14px}
.dk .in{left:18px;right:18px;bottom:18px;color:#fff}
.dk .nm{font:300 34px ID;letter-spacing:-1px}.dk .nm em{font-size:37px}
.dk .mt{font:400 13px ID;opacity:.85;margin-top:2px}
.dk .cs{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}.dk .cs .chip{height:32px;font-size:13px}
.dots{position:absolute;top:126px;left:0;right:0;display:flex;justify-content:center;gap:5px;z-index:6}.dots i{width:26px;height:3px;border-radius:2px;background:rgba(255,255,255,.5)}.dots i.on{background:#fff}
.act{position:absolute;left:0;right:0;bottom:162px;display:flex;justify-content:center;gap:16px;z-index:6}
.act .rb{width:62px;height:62px;border-radius:31px}.act .rb svg{width:26px;height:26px}
.act .main{width:auto;padding:0 26px;background:#17141F;color:#fff;font:500 16px ID;gap:8px;border-radius:31px;height:62px;display:flex;align-items:center}
""", f"""{chrome()}
<div class="top"><h2>Люди <em>рядом</em></h2><div class="rb g">{icon('filter')}</div></div>
<div class="dk" style="{PH('running','56% 2%')}">
<div class="dots" style="top:10px"><i class="on"></i><i></i><i></i></div>
<span class="tg chip gw" style="top:24px">✦ 2 общих интереса</span>
<div class="in"><div class="nm">Даша, <em>27</em></div><div class="mt">1,2 км · ищет компанию на выходные</div>
<div class="cs">{chip('Бег', cls='gw')}{chip('Кофе', cls='gw')}{chip('Йога', cls='gw')}</div></div></div>
<div class="act"><div class="rb g">{icon('x')}</div><div class="main">{icon('heart')}Сердечко</div><div class="rb g">{icon('chat')}</div></div>
{nav(-1)}""")

# 3 match
S["match"] = page("""
.ph{position:absolute;width:168px;height:224px;border-radius:30px;background-size:auto 230%;border:4px solid #fff;box-shadow:0 20px 40px rgba(60,40,110,.22)}
.a{left:30px;top:150px;transform:rotate(-8deg)}.b{right:30px;top:150px;transform:rotate(8deg)}
.mid{position:absolute;left:50%;top:250px;width:170px;height:170px;margin-left:-85px;background:url(img/stk_love.png) center/contain no-repeat;z-index:3}
.t{position:absolute;left:24px;right:24px;top:452px;text-align:center}
.t h1{font:300 46px/1 ID;letter-spacing:-1.5px}.t h1 em{font-size:52px}
.t p{margin-top:12px}
.cs{display:flex;gap:6px;justify-content:center;margin-top:16px}
.bt{position:absolute;left:24px;right:24px;bottom:44px;display:flex;flex-direction:column;gap:10px}
.x{position:absolute;top:58px;right:20px}
.hs{position:absolute;inset:0;pointer-events:none}
""", f"""{chrome()}<div class="rb g x">{icon('x')}</div>
<div class="ph a" style="{PH('walk','70% 40%')};background-size:auto 200%"></div><div class="ph b" style="{PH('running','56% 2%')}"></div>
<div class="mid"></div>
<svg class="hs" viewBox="0 0 390 844" style="width:390px;height:844px">{''.join(f'<path transform="translate({x},{y}) scale({s})" d="M0 9C-9 3-14-3-14-8a7 7 0 0 1 14-3 7 7 0 0 1 14 3c0 5-5 11-14 17z" fill="{c}" opacity=".9"/>' for x,y,s,c in [(60,120,1.2,'#FF7FB0'),(330,110,.9,'#B58CFF'),(40,420,.8,'#7A4DFF'),(356,400,1.1,'#FF4F9A'),(190,110,.7,'#FFB3CF'),(300,560,.6,'#B58CFF'),(80,600,.7,'#FF7FB0')])}</svg>
<div class="t"><h1>Это <em>взаимно!</em></h1><p class="sub">Даша тоже поставила тебе сердечко</p>
<div class="cs">{chip('Бег')}{chip('Кофе')}</div></div>
<div class="bt"><div class="btn d">Позвать на встречу</div><div class="btn l g">Написать</div></div>""")

# 4 event
S["event"] = page("""
.hero{position:absolute;left:0;right:0;top:0;height:470px;background-size:cover}
.fade{position:absolute;left:0;right:0;top:250px;height:240px;background:linear-gradient(180deg,rgba(243,240,247,0),#F2EFF6 92%)}
.tbar{position:absolute;top:56px;left:16px;right:16px;display:flex;justify-content:space-between;z-index:5}
.body{position:absolute;left:20px;right:20px;top:330px;z-index:5}
.title{font:300 38px/1.02 ID;letter-spacing:-1.2px;margin-top:12px}.title em{font-size:42px}
.ln{display:flex;align-items:center;gap:12px;height:62px;border-radius:31px;padding:0 16px 0 8px;margin-top:8px}
.ln .ic{width:46px;height:46px;border-radius:23px;background:rgba(255,255,255,.8);display:flex;align-items:center;justify-content:center}.ln .ic svg{width:20px;height:20px}
.ln b{display:block;font:500 15px ID}.ln small{font:400 12px ID;color:var(--fg2)}
.bot{position:absolute;left:20px;right:20px;bottom:30px;display:flex;gap:10px;z-index:6}
.bot .btn{flex:1}.bot .rb{width:54px;height:54px;border-radius:27px}
""", f"""<div class="hero" style="{PH('running','42% center')}"></div><div class="fade"></div>{chrome('#fff')}
<div class="tbar"><div class="rb gw">{icon('back')}</div><div style="display:flex;gap:8px"><div class="rb gw">{icon('heart')}</div><div class="rb gw">{icon('more')}</div></div></div>
<div class="body">{chip('Бег')}
<div class="title">Пробежка<br><em>на рассвете</em></div>
<div class="ln g"><div class="ic">{icon('cal')}</div><div><b>Суббота, 08:00 – 09:30</b><small>Через 2 дня</small></div></div>
<div class="ln g"><div class="ic">{icon('pin')}</div><div><b>Набережная Туры</b><small>1,4 км · открыть карту</small></div></div>
<div class="ln g"><div class="ic">{AV(*ppl[:1])}</div><div style="flex:1"><b>3 из 10 мест</b><small>Олег, Даша и ещё 1 идут</small></div>{AV(*ppl)}</div></div>
<div class="bot"><div class="rb g">{icon('share')}</div><div class="rb g">{icon('chat')}</div><div class="btn d">Я иду {icon('check')}</div></div>""")

# 5 chat
S["chat"] = page("""
.hd{position:absolute;top:52px;left:12px;right:12px;height:64px;border-radius:32px;display:flex;align-items:center;gap:10px;padding:0 8px 0 6px;z-index:5}
.hd .a{width:48px;height:48px;border-radius:24px;background-size:auto 260%}
.hd b{font:500 16px ID;display:block}.hd small{font:400 12px ID;color:#2FA86A}
.ms{position:absolute;left:16px;right:16px;top:134px;display:flex;flex-direction:column;gap:8px}
.day{align-self:center;font:500 11px ID;color:var(--fg2);padding:5px 11px;border-radius:12px}
.m{max-width:74%;padding:11px 15px;border-radius:22px;font:400 15px/1.35 ID}
.m small{display:block;font:400 10px ID;opacity:.5;text-align:right;margin-top:3px}
.in{align-self:flex-start;border-bottom-left-radius:8px}
.out{align-self:flex-end;background:#17141F;color:#fff;border-bottom-right-radius:8px}
.stk{width:130px;height:130px;background-size:contain;background-repeat:no-repeat}
.evc{align-self:flex-start;width:250px;border-radius:24px;overflow:hidden;padding:6px}
.evc .p{height:110px;border-radius:18px;background-size:cover;background-position:center}
.evc b{display:block;font:500 15px ID;margin:9px 8px 0}.evc small{display:block;font:400 12px ID;color:var(--fg2);margin:2px 8px 8px}
.inp{position:absolute;left:12px;right:12px;bottom:28px;height:56px;border-radius:28px;display:flex;align-items:center;gap:8px;padding:0 6px 0 8px}
.inp .s{width:42px;height:42px;background:url(img/stk_privet.png) center/130% no-repeat}
.inp span{flex:1;font:400 15px ID;color:var(--fg2)}
.inp .snd{width:44px;height:44px;border-radius:22px;background:#17141F;color:#fff;display:flex;align-items:center;justify-content:center}
""", f"""{chrome()}
<div class="hd g"><div class="rb">{icon('back')}</div><div class="a" style="{PH('running','56% 2%')}"></div><div style="flex:1"><b>Даша</b><small>в сети</small></div><div class="rb g">{icon('more')}</div></div>
<div class="ms"><span class="day g">Сегодня</span>
<div class="m in g">Привет! Видела, ты тоже бегаешь по набережной 🙂<small>18:02</small></div>
<div class="m out">Да, каждую субботу! Присоединяйся<small>18:04</small></div>
<div class="evc g"><div class="p" style="{PH('running','45% center')}"></div><b>Пробежка <em>на рассвете</em></b><small>Сб, 08:00 · 3 из 10 · Я иду ✓</small></div>
<div class="stk" style="background-image:url(img/stk_go.png);align-self:flex-end"></div>
<div class="m in g">А после — кофе? ☕<small>18:07</small></div></div>
<div class="inp g"><div class="s"></div><span>Сообщение…</span><div class="snd">{icon('back').replace('M15 5l-7 7 7 7','M5 12h13M13 6l6 6-6 6')}</div></div>""")

# 6 create
S["create"] = page("""
.hd{position:absolute;top:56px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center}
.t{position:absolute;left:20px;right:20px;top:118px}
.cats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
.cat{height:84px;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:500 12px ID}
.cat svg{width:36px;height:36px}.cat.on{background:#17141F;color:#fff;border-color:#17141F}
.f{margin-top:12px;height:58px;border-radius:29px;display:flex;align-items:center;padding:0 18px;font:400 16px ID;gap:10px}
.f.ph{color:var(--fg2)}
.two{display:flex;gap:10px}.two .f{flex:1}
.lb{font:500 13px ID;color:var(--fg2);margin:18px 4px 10px}
.bgs{display:flex;gap:8px}.bgs i{width:72px;height:104px;border-radius:18px;background-size:cover;background-position:center;flex:none;border:3px solid transparent}.bgs i.on{border-color:#17141F}
.go{position:absolute;left:20px;right:20px;bottom:30px}
""", f"""{chrome()}
<div class="hd"><div class="rb g">{icon('x')}</div><span class="chip g">Черновик</span></div>
<div class="t"><div class="h1">Новая <em>встреча</em></div>
<div class="cats">{''.join(f'<div class="cat g{" on" if n=="Кофе" else ""}">{ico(n)}{n}</div>' for n in ['Кофе','Кино','Бег','Бар','Ужин','Вечеринка','Прогулка','Бизнес'])}</div>
<div class="f g">Кофе и разговоры</div>
<div class="two"><div class="f g">{icon('cal')}Завтра</div><div class="f g">{icon('clock')}19:00</div></div>
<div class="two"><div class="f g">{icon('pin')}Центр</div><div class="f g">{icon('people')}до 4</div></div>
<div class="lb">Фон встречи</div>
<div class="bgs"><i class="on" style="{PH('coffee')}"></i><i style="{PH('breakfast')}"></i><i style="{PH('dinner')}"></i><i style="{PH('bar')}"></i></div></div>
<div class="go btn d">Опубликовать</div>""")

# 7 my profile
S["profile"] = page("""
.hero{position:absolute;left:0;right:0;top:0;height:420px;background-size:auto 215%}
.fade{position:absolute;left:0;right:0;top:200px;height:240px;background:linear-gradient(180deg,rgba(243,240,247,0),#F1EEF5 90%)}
.tbar{position:absolute;top:56px;left:16px;right:16px;display:flex;justify-content:space-between;z-index:5}
.c{position:absolute;left:20px;right:20px;top:312px;z-index:5}
.nm{font:300 38px/1.05 ID;letter-spacing:-1.2px;text-align:center}.nm em{font-size:42px}
.mt{text-align:center;margin-top:4px}
.fl{display:flex;justify-content:center;gap:8px;margin-top:12px}
.fl span{font:500 13px ID;padding:7px 12px;border-radius:15px}
.cs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px}.cs .chip{height:32px;font-size:13px}
.sec2{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px}
.sec2 h3{font:400 18px ID}.sec2 h3 em{font-size:20px}.sec2 span{font:500 13px ID;color:var(--fg2)}
.ph3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.ph3 i{aspect-ratio:3/4;border-radius:18px;background-size:cover;background-position:center}
.ph3 i.add{display:flex;align-items:center;justify-content:center;font:300 30px ID;font-style:normal;color:var(--fg2)}
""", f"""<div class="hero" style="{PH('running','14% 10%')};background-size:auto 230%"></div><div class="fade"></div>{chrome('#fff')}
<div class="tbar"><div class="rb gw">{icon('share')}</div><div class="rb gw">{icon('more')}</div></div>
<div class="c"><div class="nm">Олег, <em>31</em></div><div class="mt sub">Тюмень · 12 встреч</div>
<div class="fl"><span class="g">48 подписчиков</span><span class="g">Подписка Старт</span></div>
<div class="cs">{chip('Бар')}{chip('Бег')}{chip('Бизнес')}{chip('Путешествия')}</div>
<div class="sec2"><h3>Мои <em>фото</em></h3><span>Изменить</span></div>
<div class="ph3"><i style="{PH('running','14% 10%')};background-size:auto 260%"></i><i style="{PH('cycling','50% 50%')};background-size:auto 130%"></i><i class="add g">+</i></div></div>
{nav(4)}""")

for k, v in S.items():
    open(os.path.join(D, f"w_{k}.html"), "w").write(v)
print(list(S))

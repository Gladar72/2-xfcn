import os
D = os.path.dirname(os.path.abspath(__file__))
INTER = "/usr/share/fonts/opentype/inter/"

BASE = """
@font-face{font-family:ID;src:url(file://@@I@@InterDisplay-Light.otf);font-weight:300}
@font-face{font-family:ID;src:url(file://@@I@@InterDisplay-Regular.otf);font-weight:400}
@font-face{font-family:ID;src:url(file://@@I@@InterDisplay-Medium.otf);font-weight:500}
@font-face{font-family:ID;src:url(file://@@I@@InterDisplay-SemiBold.otf);font-weight:600}
@font-face{font-family:SR;src:url(img/Lora-Italic-Variable.ttf);font-style:italic}
*{box-sizing:border-box;margin:0;padding:0}
body{width:390px;height:844px;overflow:hidden;font-family:ID,sans-serif;position:relative;color:var(--fg);background:var(--bg)}
em{font-family:SR,serif;font-style:italic;font-weight:400;letter-spacing:-.5px}
.sb{position:absolute;top:0;left:0;right:0;height:50px;display:flex;justify-content:space-between;align-items:center;padding:6px 30px 0 34px;font:600 16px ID;z-index:20;color:var(--sbc,#fff)}
.sb i{display:flex;gap:6px;align-items:center}.sb i svg{width:auto;height:12px}
.island{position:absolute;top:11px;left:50%;width:124px;height:36px;margin-left:-62px;background:#000;border-radius:20px;z-index:21}
.hb{position:absolute;bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:var(--fg);opacity:.85;z-index:30}
.ph{position:absolute;background-size:cover;background-position:center}
.g{background:var(--glass);border:1px solid var(--gline);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4)}
.gw{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.32);-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);color:#fff}
.chip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 15px;border-radius:18px;font:500 14px ID;white-space:nowrap}
.chip.on{background:var(--on);color:var(--onfg);border-color:transparent}
.rb{width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center}
.rb svg{width:20px;height:20px}
svg{width:16px;height:16px;flex:none}
.acts svg,.bot svg{width:20px;height:20px}
.ico{width:18px;height:18px;flex:none}
.nav{position:absolute;left:16px;right:16px;bottom:24px;height:66px;border-radius:33px;display:flex;align-items:center;justify-content:space-around;z-index:25;padding:0 6px}
.nav .it{display:flex;flex-direction:column;align-items:center;gap:3px;font:500 10px ID;color:var(--navc);width:58px}
.nav .it svg{width:23px;height:23px}
.nav .it.on{color:var(--navon)}
.nav .bl{width:84px;height:84px;margin-top:-34px;background:url(img/blob.png) center/108% no-repeat;filter:drop-shadow(0 8px 18px rgba(160,70,255,.45))}
.badge{position:absolute;margin:-4px 0 0 16px;min-width:16px;height:16px;border-radius:8px;background:#FF4F8B;color:#fff;font:600 10px/16px ID;text-align:center}
"""

def icon(name, sw=1.7):
    P = {
        "home": '<path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z"/>',
        "map": '<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14"/>',
        "chat": '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/>',
        "user": '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
        "search": '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
        "bell": '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
        "back": '<path d="M15 5l-7 7 7 7"/>',
        "more": '<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>',
        "share": '<circle cx="17" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17" cy="18.5" r="2.5"/><path d="M8.7 10.8l6.1-3.9M8.7 13.2l6.1 3.9"/>',
        "x": '<path d="M6 6l12 12M18 6L6 18"/>',
        "pin": '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
        "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        "cal": '<rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
        "people": '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14.6c1.8.7 3 2.3 3.5 4.9"/>',
        "heart": '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
        "plusp": '<path d="M12 5v14M5 12h14"/>',
        "spark": '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/>',
        "filter": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
        "run": '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2.5V21M6.5 11.5L9 8.5l4 .5 2 3.5 3 1"/>',
        "coffee": '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5"/>',
        "film": '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4"/>',
        "glass": '<path d="M7 4h10l-1 6a4 4 0 0 1-8 0zM12 14v6M8.5 20.5h7"/>',
        "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    }[name]
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{P}</svg>'

def chrome(fg="#fff"):
    return f'<div class="island"></div><div class="sb" style="color:{fg}"><span>9:41</span><i><svg viewBox="0 0 18 12" style="width:18px"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg viewBox="0 0 16 12" style="width:16px"><path d="M8 11.5l2.2-2.6a3.2 3.2 0 0 0-4.4 0zM3.6 6.6a6.4 6.4 0 0 1 8.8 0l1.4-1.7a8.8 8.8 0 0 0-11.6 0zM.5 3.1a11 11 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><svg viewBox="0 0 27 12" style="width:27px"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="8" rx="2.2" fill="currentColor"/><rect x="24.6" y="4" width="1.8" height="4" rx=".9" fill="currentColor" opacity=".45"/></svg></i></div>'

def nav(on=0, cls="g"):
    items = [("home", "Главная"), ("map", "Карта"), None, ("chat", "Встречи"), ("user", "Профиль")]
    h = f'<div class="nav {cls}">'
    for k, it in enumerate(items):
        if it is None:
            h += '<div class="bl"></div>'; continue
        badge = '<span class="badge">2</span>' if it[0] == "chat" else ""
        h += f'<div class="it {"on" if k==on else ""}">{badge}{icon(it[0])}<span>{it[1]}</span></div>'
    return h + "</div>"

THEMES = {
 "a": dict(name="Лаванда", vars="--bg:linear-gradient(165deg,#6E5BD8 0%,#9A6FDB 38%,#C67FCB 70%,#E59AB9 100%);--fg:#fff;--fg2:rgba(255,255,255,.78);--glass:rgba(255,255,255,.16);--gline:rgba(255,255,255,.34);--on:#fff;--onfg:#3B2366;--navc:rgba(255,255,255,.75);--navon:#fff;--card:rgba(255,255,255,.16);--accent:#fff;--btn:#fff;--btnfg:#2A1747"),
 "b": dict(name="Ночь", vars="--bg:#07060B;--fg:#fff;--fg2:rgba(255,255,255,.62);--glass:rgba(255,255,255,.07);--gline:rgba(255,255,255,.14);--on:#fff;--onfg:#0B0910;--navc:rgba(255,255,255,.55);--navon:#fff;--card:rgba(255,255,255,.06);--accent:#E7A6FF;--btn:#fff;--btnfg:#0B0910"),
 "c": dict(name="Кадр", vars="--bg:#0E0D12;--fg:#fff;--fg2:rgba(255,255,255,.75);--glass:rgba(255,255,255,.14);--gline:rgba(255,255,255,.28);--on:#fff;--onfg:#16121F;--navc:rgba(255,255,255,.7);--navon:#fff;--card:rgba(255,255,255,.1);--accent:#fff;--btn:#fff;--btnfg:#16121F"),
}

def page(theme, extra_css, body):
    t = THEMES[theme]
    return f"<!doctype html><html><head><meta charset='utf-8'><style>:root{{{t['vars']}}}{BASE.replace('@@I@@', INTER)}{extra_css}</style></head><body>{body}<div class='hb'></div></body></html>"

# ---------- shared css ----------
COMMON = """
.h1{font:400 40px/1.02 ID;letter-spacing:-1.4px}
.h1 em{font-size:44px}
.sub{font:400 14px/1.4 ID;color:var(--fg2)}
.sec{display:flex;justify-content:space-between;align-items:baseline;padding:0 20px;margin-top:18px}
.sec h3{font:500 19px ID;letter-spacing:-.4px}.sec h3 em{font-size:21px}
.sec span{font:500 13px ID;color:var(--fg2)}
.row{display:flex;gap:10px;padding:12px 20px 0;overflow:hidden}
.card{flex:none;position:relative;border-radius:26px;overflow:hidden;color:#fff;background-size:cover;background-position:center}
.card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(10,6,20,.72) 100%)}
.card>*{position:absolute;z-index:2}
.card .tg{top:10px;left:10px;height:28px;padding:0 10px;font-size:12px;border-radius:14px}
.card .bt{left:14px;right:14px;bottom:14px}
.card .tt{font:500 17px/1.15 ID;letter-spacing:-.3px}.card .tt em{font-size:19px}
.card .mm{font:400 12px ID;opacity:.82;margin-top:4px;display:flex;gap:6px;align-items:center}
.avs{display:flex}.avs b{width:24px;height:24px;border-radius:12px;border:1.5px solid rgba(255,255,255,.9);margin-left:-7px;background-size:cover;background-position:center}.avs b:first-child{margin-left:0}
"""

PH = lambda f, pos="center": f"background-image:url(img/{f}.webp);background-position:{pos}"

# ---------- 1. splash ----------
def splash(theme):
    css = COMMON + """
.full{inset:0}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,0) 25%,rgba(0,0,0,0) 50%,rgba(0,0,0,.65) 100%)}
.logo{position:absolute;left:0;right:0;top:300px;text-align:center;color:#fff}
.logo .w{font:600 15px ID;letter-spacing:5px;text-transform:uppercase;opacity:.9}
.logo .s{font:400 34px/1.05 ID;letter-spacing:-1px;margin-top:14px;text-shadow:0 2px 20px rgba(0,0,0,.35)}.logo .s em{font-size:38px}
.cta{position:absolute;left:20px;right:20px;bottom:44px;display:flex;flex-direction:column;gap:10px}
.cta div{height:54px;border-radius:27px;display:flex;align-items:center;justify-content:center;gap:8px;font:500 16px ID}
.b1{background:#fff;color:#16121F}
.mini{width:66px;height:66px;margin:0 auto 6px;background:url(img/blob.png) center/112% no-repeat}
"""
    tint = {"a": "rgba(190,140,255,.28)", "b": "rgba(0,0,0,.25)", "c": "rgba(0,0,0,0)"}[theme]
    body = f"""<div class="ph full" style="{PH('party','40% center')};background-size:auto 100%"></div>
<div style="position:absolute;inset:0;background:{tint};mix-blend-mode:{'soft-light' if theme=='a' else 'normal'}"></div><div class="shade"></div>{chrome()}
<div class="logo"><div class="mini"></div><div class="w">Место</div><div class="s">Найди <em>компанию</em><br>на сегодня</div></div>
<div class="cta"><div class="b1">Как это работает</div><div class="gw">Войти через Telegram</div></div>"""
    return page(theme, css, body)

# ---------- 2. home ----------
def home(theme):
    css = COMMON + """
.top{padding:62px 20px 0}
.city{display:flex;justify-content:space-between;align-items:center}
.city .p{height:40px;padding:0 14px 0 12px;border-radius:20px;display:flex;align-items:center;gap:7px;font:500 14px ID}
.city .r{display:flex;gap:8px}
.chips{display:flex;gap:8px;padding:16px 20px 0;overflow:hidden}
.mos{margin:14px 20px 0;height:58px;border-radius:29px;display:flex;align-items:center;gap:12px;padding:0 8px 0 6px}
.mos .o{width:46px;height:46px;background:url(img/blob.png) center/118% no-repeat}
.mos .t{font:400 14px ID;flex:1}.mos .t b{font-weight:500}
.mos .go{height:40px;padding:0 15px;border-radius:20px;background:var(--btn);color:var(--btnfg);font:500 13px ID;display:flex;align-items:center}
"""
    if theme == "b":
        css += ".glow{position:absolute;width:520px;height:520px;left:-120px;top:-180px;border-radius:50%;background:radial-gradient(circle,rgba(255,80,120,.55),rgba(150,40,255,.25) 45%,transparent 70%);filter:blur(30px)}"
    hl = {"a": "Найди <em>компанию</em><br>на сегодня",
          "b": "Найди <em>компанию</em><br>на сегодня",
          "c": "Куда <em>сходим</em><br>сегодня?"}[theme]
    glow = '<div class="glow"></div>' if theme == "b" else ""
    big = theme == "c"
    cw, ch = (350, 330) if big else (176, 220)
    body = f"""{glow}{chrome()}
<div class="top"><div class="city"><div class="p g">{icon('pin')}Тюмень</div><div class="r"><div class="rb g">{icon('search')}</div><div class="rb g">{icon('bell')}</div></div></div>
<div class="h1" style="margin-top:22px">{hl}</div></div>
<div class="chips"><span class="chip on">Все</span><span class="chip g">{icon('coffee')}Кофе</span><span class="chip g">{icon('film')}Кино</span><span class="chip g">{icon('run')}Спорт</span><span class="chip g">{icon('glass')}Бары</span></div>
<div class="mos g"><div class="o"></div><div class="t"><b>3 человека</b> рядом свободны<br>сегодня вечером</div><div class="go">Найти</div></div>
<div class="sec"><h3>Личные <em>встречи</em></h3><span>Все</span></div>
<div class="row">
 <div class="card" style="width:{cw}px;height:{ch}px;{PH('running','45% center')}"><span class="tg gw chip">3 из 10</span><div class="bt"><div class="tt">Пробежка <em>на рассвете</em></div><div class="mm">Сб, 08:00 · Набережная</div></div></div>
 <div class="card" style="width:{cw}px;height:{ch}px;{PH('coffee','60% center')}"><span class="tg gw chip">2 из 4</span><div class="bt"><div class="tt">Кофе и <em>разговоры</em></div><div class="mm">Завтра, 19:00 · Центр</div></div></div>
</div>
<div class="sec"><h3>Люди <em>рядом</em></h3><span>Листать</span></div>
<div class="row">
 <div class="card" style="width:112px;height:150px;{PH('running','52% 4%')};background-size:auto 260%"><div class="bt"><div class="tt" style="font-size:15px">Даша, 27</div><div class="mm">2 общих</div></div></div>
 <div class="card" style="width:112px;height:150px;{PH('running','12% 12%')};background-size:auto 240%"><div class="bt"><div class="tt" style="font-size:15px">Олег, 31</div><div class="mm">Бег</div></div></div>
 <div class="card" style="width:112px;height:150px;{PH('walk','70% 40%')};background-size:auto 200%"><div class="bt"><div class="tt" style="font-size:15px">Аня, 25</div><div class="mm">Кофе</div></div></div>
</div>
<div class="sec"><h3>Афиша <em>заведений</em></h3><span>Все</span></div>
<div class="row"><div class="card" style="width:{cw}px;height:120px;{PH('party')}"></div><div class="card" style="width:{cw}px;height:120px;{PH('dinner')}"></div></div>
{nav(0, 'g')}"""
    return page(theme, css, body)

# ---------- 3. event ----------
def event(theme):
    css = COMMON + """
.hero{position:absolute;left:0;right:0;top:0;height:560px}
.fade{position:absolute;left:0;right:0;top:300px;height:544px;background:linear-gradient(180deg,transparent 0%,var(--evbg) 52%)}
.tbar{position:absolute;top:56px;left:16px;right:16px;display:flex;justify-content:space-between;z-index:5}
.body{position:absolute;left:20px;right:20px;top:400px;z-index:5}
.title{font:400 40px/1.02 ID;letter-spacing:-1.3px;margin-top:14px}.title em{font-size:44px}
.desc{font:400 14px/1.45 ID;color:var(--fg2);margin-top:12px}
.tiles{display:flex;gap:8px;margin-top:18px}
.tl{flex:1;height:68px;border-radius:20px;padding:11px 12px;display:flex;flex-direction:column;justify-content:space-between}
.tl small{font:400 11px ID;color:var(--fg2);display:flex;gap:5px;align-items:center}.tl small svg{width:13px;height:13px}
.tl b{font:500 16px ID}
.go{display:flex;align-items:center;gap:10px;margin-top:16px;font:400 13px ID;color:var(--fg2)}
.bot{position:absolute;left:20px;right:20px;bottom:30px;display:flex;gap:10px;z-index:6}
.bot .main{flex:1;height:56px;border-radius:28px;background:var(--btn);color:var(--btnfg);display:flex;align-items:center;justify-content:center;font:500 16px ID;gap:8px}
.bot .rb{width:56px;height:56px;border-radius:28px}
"""
    evbg = {"a": "#9A6FDB", "b": "#07060B", "c": "#0E0D12"}[theme]
    css += f":root{{--evbg:{evbg}}}"
    if theme == "a":
        css += "body{background:#9A6FDB}.fade{background:linear-gradient(180deg,rgba(154,111,219,0) 0%,rgba(154,111,219,.9) 42%,#9A6FDB 60%,#B57AD0 100%)}"
    av = "".join(f'<b style="{PH(x)}"></b>' for x in ["walk", "yoga", "padel"])
    body = f"""<div class="ph hero" style="{PH('running','42% center')}"></div><div class="fade"></div>{chrome()}
<div class="tbar"><div class="rb gw">{icon('back')}</div><div style="display:flex;gap:8px"><div class="rb gw">{icon('heart')}</div><div class="rb gw">{icon('more')}</div></div></div>
<div class="body"><span class="chip gw" style="height:32px">{icon('run')}Бег · личная встреча</span>
<div class="title">Пробежка<br><em>на рассвете</em></div>
<div class="desc">5 км в спокойном темпе вдоль Туры, потом кофе. Новичкам — welcome.</div>
<div class="tiles"><div class="tl g"><small>{icon('cal')}Когда</small><b>Сб, 08:00</b></div><div class="tl g"><small>{icon('pin')}Где</small><b>Набережная</b></div><div class="tl g"><small>{icon('people')}Мест</small><b>3 из 10</b></div></div>
<div class="go"><div class="avs">{av}</div>Олег, Даша и ещё 1 идут</div></div>
<div class="bot"><div class="rb g">{icon('x')}</div><div class="rb g">{icon('share')}</div><div class="main">Я иду {icon('check')}</div></div>"""
    return page(theme, css, body)

# ---------- 4. profile ----------
def profile(theme):
    css = COMMON + """
.hero{position:absolute;left:0;right:0;top:0;height:520px}
.fade{position:absolute;left:0;right:0;top:250px;height:594px;background:linear-gradient(180deg,transparent 0%,var(--evbg) 46%)}
.tbar{position:absolute;top:56px;left:16px;right:16px;display:flex;justify-content:space-between;z-index:5}
.c{position:absolute;left:20px;right:20px;top:372px;z-index:5;text-align:center}
.mt{font:400 13px ID;color:var(--fg2)}
.nm{font:400 40px/1.05 ID;letter-spacing:-1.3px;margin-top:4px}.nm em{font-size:44px}
.tags{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:14px}
.tags .chip{height:32px;font-size:13px;padding:0 12px}
.acts{display:flex;gap:10px;margin-top:18px}
.acts div{flex:1;height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center;gap:7px;font:500 15px ID}
.acts .m{background:var(--btn);color:var(--btnfg)}
.stats{display:flex;gap:8px;margin-top:14px}
.stats div{flex:1;border-radius:20px;padding:12px;text-align:left}
.stats small{font:400 11px ID;color:var(--fg2)}.stats b{display:block;font:500 17px ID;margin-top:4px}
"""
    evbg = {"a": "#9A6FDB", "b": "#07060B", "c": "#0E0D12"}[theme]
    css += f":root{{--evbg:{evbg}}}"
    if theme == "a":
        css += "body{background:#9A6FDB}"
    body = f"""<div class="ph hero" style="{PH('running','57% 2%')};background-size:auto 215%"></div><div class="fade"></div>{chrome()}
<div class="tbar"><div class="rb gw">{icon('back')}</div><div style="display:flex;gap:8px"><div class="rb gw">{icon('share')}</div><div class="rb gw">{icon('more')}</div></div></div>
<div class="c"><div class="mt">27 лет · 1,2 км от тебя</div><div class="nm">Дарья <em>К.</em></div>
<div class="tags"><span class="chip g">{icon('spark')}2 общих интереса</span><span class="chip g">Йога</span><span class="chip g">Кофе</span><span class="chip g">Кино</span></div>
<div class="acts"><div class="g">{icon('heart')}Сердечко</div><div class="m">Позвать на встречу</div></div>
<div class="stats"><div class="g"><small>Встреч</small><b>14</b></div><div class="g"><small>Рейтинг</small><b>4,9</b></div><div class="g"><small>Ищет</small><b>Компанию</b></div></div></div>"""
    return page(theme, css, body)


def event_b():
    css = COMMON + """
.bgb{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(46px) saturate(1.5) brightness(.7)}
.dim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,11,.2),rgba(7,6,11,.55) 60%,rgba(7,6,11,.9))}
.tbar{position:absolute;top:56px;left:16px;right:16px;display:flex;justify-content:space-between;z-index:5}
.pc{position:absolute;left:20px;right:20px;top:112px;height:280px;border-radius:30px;background-size:cover;background-position:center 40%;box-shadow:0 20px 50px rgba(0,0,0,.45)}
.pc .chip{position:absolute;left:12px;bottom:12px;height:32px}
.pc .avs{position:absolute;right:12px;bottom:14px}
.body{position:absolute;left:20px;right:20px;top:424px;z-index:5}
.title{font:400 38px/1.02 ID;letter-spacing:-1.3px}.title em{font-size:42px}
.ln{display:flex;align-items:center;gap:14px;height:64px;border-radius:32px;padding:0 18px 0 10px;margin-top:10px}
.ln .ic{width:44px;height:44px;border-radius:22px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center}
.ln .ic svg{width:19px;height:19px}
.ln b{display:block;font:500 15px ID}.ln small{font:400 12px ID;color:var(--fg2)}
.bot{position:absolute;left:20px;right:20px;bottom:30px;display:flex;gap:10px;z-index:6}
.bot .main{flex:1;height:56px;border-radius:28px;background:var(--btn);color:var(--btnfg);display:flex;align-items:center;justify-content:center;font:500 16px ID;gap:8px}
.bot .rb{width:56px;height:56px;border-radius:28px}
"""
    av = "".join(f'<b style="{PH(x)}"></b>' for x in ["walk", "yoga", "padel"])
    body = f"""<div class="bgb" style="{PH('running')}"></div><div class="dim"></div>{chrome()}
<div class="tbar"><div class="rb g">{icon('back')}</div><div style="display:flex;gap:8px"><div class="rb g">{icon('heart')}</div><div class="rb g">{icon('more')}</div></div></div>
<div class="pc" style="{PH('running','45% 40%')}"><span class="chip gw">{icon('run')}Бег</span><div class="avs">{av}</div></div>
<div class="body"><div class="title">Пробежка<br><em>на рассвете</em></div>
<div class="ln g"><div class="ic">{icon('cal')}</div><div><b>Суббота, 08:00 – 09:30</b><small>Через 2 дня</small></div></div>
<div class="ln g"><div class="ic">{icon('pin')}</div><div><b>Набережная Туры</b><small>1,4 км · открыть карту</small></div></div>
<div class="ln g"><div class="ic">{icon('people')}</div><div><b>3 из 10 мест</b><small>Олег, Даша и ещё 1</small></div></div></div>
<div class="bot"><div class="rb g">{icon('share')}</div><div class="main">Я иду {icon('check')}</div></div>"""
    return page("b", css, body)

def event_c():
    css = COMMON + """
.full{inset:0;background-size:auto 100%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 45%,rgba(0,0,0,.82) 88%)}
.tbar{position:absolute;top:56px;left:16px;right:16px;display:flex;justify-content:space-between;z-index:5}
.body{position:absolute;left:20px;right:20px;bottom:112px;z-index:5}
.title{font:400 34px/1.05 ID;letter-spacing:-1px}.title em{font-size:38px}
.meta{font:400 13px ID;color:var(--fg2);margin-top:8px;display:flex;gap:10px;align-items:center}
.pills{display:flex;gap:6px;margin-top:14px;flex-wrap:nowrap;overflow:hidden}
.pills .chip{height:30px;font-size:12px;padding:0 11px}
.bot{position:absolute;left:20px;right:20px;bottom:34px;display:flex;gap:8px;z-index:6}
.bot div{height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center;gap:7px;font:500 15px ID;padding:0 18px}
.bot .main{flex:1;background:#fff;color:#16121F}
.side{position:absolute;right:16px;bottom:250px;display:flex;flex-direction:column;gap:14px;z-index:6;align-items:center}
.side div{display:flex;flex-direction:column;align-items:center;gap:4px;font:500 11px ID}
.side .rb{width:48px;height:48px;border-radius:24px}
"""
    av = "".join(f'<b style="{PH(x)}"></b>' for x in ["walk", "yoga", "padel"])
    body = f"""<div class="ph full" style="{PH('running','45% center')}"></div><div class="shade"></div>{chrome()}
<div class="tbar"><div class="rb gw">{icon('back')}</div><div class="rb gw">{icon('more')}</div></div>
<div class="side"><div><div class="rb gw">{icon('heart')}</div>24</div><div><div class="rb gw">{icon('chat')}</div>8</div><div><div class="rb gw">{icon('share')}</div></div></div>
<div class="body"><div class="title">Пробежка<br><em>на рассвете</em></div>
<div class="meta"><div class="avs">{av}</div>Олег, Даша и ещё 1 · 3 из 10</div>
<div class="pills"><span class="chip gw">{icon('cal')}Сб, 08:00</span><span class="chip gw">{icon('pin')}Набережная</span><span class="chip gw">{icon('run')}5 км</span></div></div>
<div class="bot"><div class="main">Я иду {icon('check')}</div><div class="gw">{icon('chat')}Чат</div></div>"""
    return page("c", css, body)

for th in "abc":
    for nm, fn in [("splash", splash), ("home", home), ("event", event), ("profile", profile)]:
        html = event_b() if (th, nm) == ("b", "event") else event_c() if (th, nm) == ("c", "event") else fn(th)
        open(os.path.join(D, f"{th}_{nm}.html"), "w").write(html)
print("ok")

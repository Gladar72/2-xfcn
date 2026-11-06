import os, sys, re, json, io, contextlib
D = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(D, "..", "v2")
sys.path.insert(0, V2)
cwd = os.getcwd(); os.chdir(V2)
with contextlib.redirect_stdout(io.StringIO()):
    from gen import icon as _icon
os.chdir(cwd)

def I(n, sw=1.7): return _icon(n, sw)
ORDER = ["Кофе","Кино","Бег","Йога","Зал","Падел","Футбол","Вело","Прогулка","Вечеринка","Бар","Ужин","Завтрак","Бизнес","Музыка","Книги","Путешествия","Настолки","Природа","Танцы"]
_ic = {f[:-4]: open(os.path.join(V2, "ico_ink", f)).read() for f in os.listdir(os.path.join(V2, "ico_ink"))}
INT_GROUPS = [
 ("Активный отдых", [("Бег","Бег"),("Спортзал","Зал"),("Hyrox","Hyrox"),("Триатлон","Триатлон"),("Плавание","Плавание"),("Йога","Йога"),("Велосипед","Вело"),("Падел","Падел"),("Походы","Походы"),("Кемпинг","Кемпинг"),("Лыжи и сноуборд","Лыжи"),("Футбол","Футбол"),("Теннис","Теннис"),("Единоборства","Единоборства"),("Ролики","Ролики"),("Танцы","Танцы"),("Природа","Природа")]),
 ("Культура и путешествия", [("Путешествия","Путешествия"),("Экскурсии","Прогулка"),("Фотография","Фотография"),("Кино","Кино"),("Театр","Театр"),("Музыка","Музыка"),("Караоке","Караоке"),("Джем‑сейшны","Джем‑сейшны"),("Выставки","Выставки"),("Концерты","Концерты"),("Книжный клуб","Книги")]),
 ("Еда и общение", [("Кофе","Кофе"),("Завтраки","Завтрак"),("Ужины","Ужин"),("Бары","Бар"),("Стритфуд","Стритфуд"),("Вечеринки","Вечеринка"),("Настолки","Настолки"),("Квизы","Квизы"),("Кулинария","Кулинария"),("Прогулки с собакой","Собаки"),("Нетворкинг","Нетворкинг"),("Баня","Баня"),("Языковой обмен","Языки"),("Валяться дома","Валяться дома")])]
ALL_ICONS = [i for _, it in INT_GROUPS for _, i in it]
_cnt = [0]
def C(n):
    """chrome interest icon, ids made unique per use"""
    _cnt[0] += 1; k = f"u{_cnt[0]}"
    s = _ic[n]
    s = re.sub(r'id="([^"]+)"', lambda m: f'id="{m.group(1)}{k}"', s)
    s = re.sub(r'url\(#([^)]+)\)', lambda m: f'url(#{m.group(1)}{k})', s)
    return s.replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg aria-hidden="true" ')

FACES = {"Даша": (620, 250), "Олег": (255, 250), "Аня": (415, 300), "Макс": (755, 280), "Катя": (955, 300), "Игорь": (595, 300)}
def F(name, w, h, cw=None):
    fx, fy = FACES[name]; cw = cw or max(170, min(260, w * 1.25))
    sc = w / cw; W = 1200 * sc
    return f"background-image:url(a/people.webp);background-size:{W:.0f}px auto;background-position:{-(fx*sc-w/2):.0f}px {-(fy*sc-h/2):.0f}px"
def P(img, pos="center"): return f"background-image:url(a/{img}.webp);background-size:cover;background-position:{pos}"
def chip(n, cls="g", on=False, attrs="", ic=None): return f'<button class="chip pr {cls}{" on" if on else ""}" {attrs}>{C(ic or n)}{n}</button>'
def AV(*names, s=30): return '<span class="avs">' + "".join(f'<b style="{F(n, s, s, 120)}"></b>' for n in names) + "</span>"
CHECK = I("check"); BACK = I("back"); MORE = I("more"); SHARE = I("share"); HEART = I("heart")
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
ARROWL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>'
TG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 4.2 2.9 11.4c-1.3.5-1.2 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.7.4.9.9.9.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.3zM9.6 14.2l-.4 4.1-1.5-4.8 10.6-6.7z"/></svg>'
BELL_ON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>'
STK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 10h.01M15 10h.01"/></svg>'

MAPSVG = '''<svg viewBox="0 0 390 600" preserveAspectRatio="xMidYMid slice"><rect width="390" height="600" fill="#ECE9F3"/>
<path d="M-20 420C60 380 120 400 180 360S300 300 410 320V380C320 360 260 400 200 430S80 470-20 480Z" fill="#C9D9F7"/>
<rect x="230" y="70" width="120" height="90" rx="22" fill="#DCEBD8"/><rect x="30" y="200" width="90" height="70" rx="18" fill="#DCEBD8"/>
<g stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"><path d="M-10 120H400M-10 300H400M90-10V610M280-10V610M-10 520L400 480"/></g>
<g stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"><path d="M-10 60H400M-10 200H400M180-10V610M30-10V340M350 160V610M-10 250L200 180"/></g>
<text x="300" y="348" font-family="Inter,sans-serif" font-size="11" fill="#8AA0D0" font-style="italic">р. Тура</text></svg>'''


MAPSVG2 = '''<svg class="mapsvg" viewBox="0 0 390 600" preserveAspectRatio="xMidYMid slice"><rect width="390" height="600" fill="#F2F1EE"/>
<path d="M-20 430C60 395 120 410 180 372S300 312 410 330V372C320 356 262 400 200 432S80 476-20 486Z" fill="#CFE0F5"/>
<path d="M232 70h118v86H232zM28 196h86v70H28zM250 470h120v90H250z" fill="#E1EEDB"/>
<g fill="#E8E6E1"><rect x="110" y="140" width="60" height="44" rx="4"/><rect x="190" y="210" width="70" height="60" rx="4"/><rect x="60" y="300" width="80" height="50" rx="4"/><rect x="300" y="200" width="60" height="70" rx="4"/></g>
<g stroke="#fff" stroke-width="11" fill="none" stroke-linecap="round"><path d="M-10 120H400M-10 300H400M92-10V610M282-10V610M-10 524L400 486"/></g>
<g stroke="#FFF3D6" stroke-width="7" fill="none"><path d="M-10 120H400M282-10V610"/></g>
<g stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"><path d="M-10 60H400M-10 200H400M182-10V610M30-10V340M350 160V610M-10 252L200 182"/></g>
<g font-family="Inter,sans-serif" font-size="9.5" fill="#8C8A93"><text x="120" y="114">ул. Республики</text><text x="300" y="352" font-style="italic" fill="#7E9CC8">р. Тура</text><text x="246" y="64" fill="#7FA07A">Цветной бульвар</text></g></svg>'''
def pin(img, label, x, y, i=None):
    attr = f' data-mk="{i}"' if i is not None else ""
    return (f'<button class="pin pr{" on" if i==0 else ""}"{attr} style="left:{x}%;top:{y}%"><span class="pl">{label}</span>'
            f'<span class="dr"><span class="ph" style="{P(img)}"></span></span></button>')

def sb_(): return ""

# ---------------- screens ----------------
S = {}
S["intro"] = f'''<div class="pbg"></div><img class="wm" src="a/wordmark-dark.svg" alt="место">
<div class="bars" id="bars"><i class="run"><b></b></i><i><b></b></i><i><b></b></i></div>
<canvas class="cr cv" data-v="e" width="480" height="480"></canvas>
<div class="txt swin" id="introTxt"></div>
<div class="slide"><button class="bk pr" id="introBack" aria-label="Назад">{ARROWL}</button>
<div class="tr g" id="slider"><div class="fill" id="sfill"></div><div class="kn" id="knob">{ARROW}</div><span class="lb" id="slbl">Далее</span><span class="ar">›››</span></div></div>'''

S["auth"] = f'''<div class="pbg"></div><canvas class="cr" data-v="e" width="440" height="440" style="position:absolute;left:50%;top:120px;width:220px;height:220px;margin-left:-110px"></canvas>
<div class="authc g"><h1 class="h1">Войти в <em>Место</em></h1>
<p>Через Telegram быстрее всего: имя и фото подтянутся сами, а встречи из мини‑приложения сохранятся.</p>
<button class="btn tg pr" data-go="reg1">{TG}Войти через Telegram</button>
<p class="legal">Продолжая, вы принимаете публичную оферту и политику конфиденциальности</p></div>'''

S["reg1"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:150px">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div class="prog"><i class="on"></i><i></i><i></i></div></div>
<h1 class="h1" style="margin-top:20px">Почти готово, <em>Андрей</em></h1>
<p class="muted" style="font:400 15px/1.5 var(--disp);margin:8px 0 0">Имя и фото взяли из Telegram. Добавь ещё 1–2 фото — с ними чаще зовут на встречи.</p>
<div class="phgrid"><div class="phs" style="{F('Олег',110,147)}"><span class="tag gw">из Telegram</span></div>
<button class="phs g pr" data-addph>+</button><button class="phs g pr" data-addph>+</button></div>
<span class="lbl">Имя</span><label class="field g"><input id="f_name" value="Андрей"></label>
<span class="lbl">Дата рождения</span><label class="field g"><input id="f_bd" value="14.03.1994" inputmode="numeric"></label>
<span class="lbl">Пол</span><div class="seg"><button class="chip g pr on" data-seg>Мужчина</button><button class="chip g pr" data-seg>Женщина</button></div>
<span class="lbl">Город</span><button class="field g pr" data-ov="citySheet"><b id="cityName">Тюмень</b>{I('back').replace('M15 5l-7 7 7 7','M9 5l7 7-7 7')}</button>
<span class="lbl">Пару слов о себе</span><label class="field g" style="height:auto;padding:14px 18px"><input id="f_bio" value="Люблю кофе и утренние пробежки"></label></div>
<div class="foot"><button class="btn d pr" data-go="reg2">Далее</button></div>'''

S["reg2"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:150px">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div class="prog"><i class="on"></i><i class="on"></i><i></i></div></div>
<h1 class="h1" style="margin-top:20px">Что тебе <em>по душе</em>?</h1>
<p class="muted" style="font:400 15px/1.5 var(--disp);margin:8px 0 0">Выбери хотя бы 3 — по ним подберём людей и встречи.</p>
<div class="ints" id="ints">{"".join(chip(n, attrs='data-int') for n in ORDER)}</div></div>
<div class="foot"><div class="hint" id="intHint">Выбрано 0 из 3</div><button class="btn d pr" id="intNext" style="opacity:.4" data-go="reg3">Далее</button></div>'''

S["reg3"] = f'''<div class="pbg"></div><div class="geo">
<div class="top" style="position:absolute;top:58px;left:20px;right:20px"><button class="rb g pr" data-back>{BACK}</button><div class="prog"><i class="on"></i><i class="on"></i><i class="on"></i></div></div>
<canvas class="cr cv" data-v="e" width="400" height="400"></canvas>
<div class="tx"><h1 class="h1">Где ищем <em>компанию</em>?</h1><p class="muted" style="font:400 15px/1.5 var(--disp);margin:10px 0 0">Покажем встречи рядом. Геолокацию используем только чтобы определить город.</p></div></div>
<div class="foot" style="background:none"><button class="btn d pr" id="geoOk">{I('pin')}Определить город</button><button class="btn l pr" data-ov="citySheet">Выбрать вручную</button></div>'''

def hc(img, tag, t1, t2, meta, cta, pos="center", go="event", extra=""):
    return f'<button class="hc pr" style="{P(img,pos)}" data-go="{go}" {extra}><span class="chip gw tg">{tag}</span><span class="bt"><span class="tt">{t1}<br><em>{t2}</em></span><span class="mm" style="display:block">{meta}</span><span class="cta">{cta}</span></span></button>'

S["home"] = f'''<div class="pbg"></div><div class="scroll" id="homeScroll">
<div class="top"><button class="chip g pr" style="height:40px">{I('pin')}Тюмень</button><button class="rb g pr" data-go="notif">{I('bell')}</button></div>
<h1 class="h1" style="margin-top:20px;font-size:38px">Найди <em>компанию</em><br>на сегодня</h1>
<div class="hs" style="margin-top:14px;gap:8px"><button class="chip g pr" style="padding:0 11px" data-toast="Поиск по встречам и людям">{I('search')}</button><button class="chip g pr on" data-cat>Все</button>{chip('Кофе',attrs='data-cat')}{chip('Кино',attrs='data-cat')}{chip('Бег',attrs='data-cat')}{chip('Бар',attrs='data-cat')}<button class="chip g pr" data-toast="Дата, время, направление">{I('filter')}Фильтры</button></div>
<button class="mos g pr" data-go="deck"><canvas class="cr" data-v="e" width="116" height="116"></canvas><span class="t"><b>3 человека</b> рядом свободны<br>сегодня вечером</span><span class="go">Найти</span></button>
<div class="sec"><div><h3>Личные <em>встречи</em></h3><p>Планы людей рядом — присоединяйся</p></div><button class="all g pr" data-go="meet">Все</button></div>
<div class="hs">{hc('running','3 из 10 · бег','Пробежка','на рассвете','Сб, 08:00 · Набережная','Я иду','45% center')}{hc('cinema','1 из 2 · анонимно','Кино','вечером','Сегодня, 21:00 · Киномакс','Я иду')}{hc('coffee','2 из 4 · кофе','Кофе и','разговоры','Завтра, 19:00 · Центр','Я иду','60% center')}</div>
<div class="sec"><div><h3>Люди <em>в твоём городе</em></h3><p>С общими интересами</p></div><button class="all g pr" data-go="deck">Листать</button></div>
<div class="mz">
 <button class="mt pr" style="left:0;top:0;width:206px;height:268px;{F('Даша',206,268,250)}" data-go="person"><span class="cm gw">{C('Бег')}{C('Кофе')}2 общ.</span><span class="mb"><b>Даша, 27</b><small>1,2 км</small></span></button>
 <button class="mt pr" style="left:218px;top:0;width:132px;height:128px;{F('Олег',132,128,230)}" data-go="person"><span class="cm gw">{C('Бар')}1 общ.</span><span class="mb"><b>Олег, 31</b><small>3 км</small></span></button>
 <button class="mt pr" style="left:218px;top:140px;width:132px;height:128px;{F('Макс',132,128,200)}" data-go="person"><span class="cm gw">{C('Падел')}1 общ.</span><span class="mb"><b>Макс, 29</b><small>2 км</small></span></button>
</div>
<div class="biz g"><div class="sec"><div><h3>Афиша <em>заведений</em></h3><p>События кафе, баров и площадок</p></div><button class="all g pr" data-go="venue">Все</button></div>
<div class="hs">{hc('party','↑ В топе','Вечеринка','FORMA','6 нояб, 23:00 · 158 мест','Бесплатно','40% center','venue')}{hc('dinner','Ужин','Гастро‑','вечер','15 нояб, 19:00 · 24 места','2000 ₽','center','venue')}<button class="inv g pr" data-toast="Бизнес‑кабинет: разместить событие"><i>+</i>Здесь может быть ваше бизнес‑событие</button></div></div>
</div>'''

S["event"] = f'''<div class="evbg" style="{P('running')}"></div><div class="evph" style="{P('running','42% center')}"></div>
<div class="tbar"><button class="rb gw pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb gw pr" data-like>{HEART}</button><button class="rb gw pr" data-toast="Пожаловаться · Скопировать ссылку">{MORE}</button></div></div>
<div class="scroll"><div class="spacer"></div><div class="card">
<span class="chip gw" style="height:32px">{C('Бег')}Бег · личная встреча</span>
<h1 class="title">Пробежка<br><em>на рассвете</em></h1>
<p class="desc">5 км в спокойном темпе вдоль Туры, потом кофе. Новичкам — welcome, подождём всех.</p>
<div class="tiles"><div class="tile gd"><small>{I('cal')}Когда</small><b>Сб, 9 нояб</b></div><div class="tile gd"><small>{I('clock')}Время</small><b>08:00 <small>–09:30</small></b></div><div class="tile gd"><small>{I('people')}Мест</small><b>3 из 10</b></div></div>
<button class="going gd pr" data-go="person">{AV('Олег','Даша','Аня')}<span class="t"><b>Олег, Даша и Аня идут</b>Организатор — Олег · 4,9 ★</span>{I('back').replace('M15 5l-7 7 7 7','M9 5l7 7-7 7')}</button>
<button class="mapbox gd pr" data-tab="map" style="display:block;width:100%"><div class="map">{MAPSVG}</div><span class="mk on" style="left:50%;top:52%">{C('Бег')}</span><span class="chip gw" style="position:absolute;left:10px;bottom:10px;height:30px;font-size:12px">{I('pin')}Набережная Туры · 1,4 км</span></button>
<div style="height:120px"></div></div></div>
<div class="cta gd"><button class="rb gw pr" data-toast="Ссылка скопирована">{SHARE}</button><button class="rb gw pr" data-go="chat">{I('chat')}</button><button class="btn pr" id="goBtn" style="background:#fff;color:var(--ink)">Я иду {CHECK}</button></div>'''

S["deck"] = f'''<div class="pbg"></div>
<div class="top" style="position:absolute;top:58px;left:20px;right:20px;z-index:5"><button class="rb g pr" data-back>{BACK}</button><h2 style="font:300 26px var(--disp);letter-spacing:-.03em;margin:0">Люди <em>рядом</em></h2><button class="rb g pr" data-toast="Возраст, пол, интересы, расстояние">{I('filter')}</button></div>
<div id="deckStack"></div>
<div class="act"><button class="rb g pr" id="dNo">{I('x')}</button><button class="main pr" id="dYes">{HEART}Сердечко</button><button class="rb g pr" data-go="chat">{I('chat')}</button></div>'''

S["person"] = f'''<div class="pbg"></div><div class="hero2" style="{F('Даша',390,470,330)}"></div>
<div class="tbar"><button class="rb gw pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb gw pr" data-toast="Ссылка на профиль скопирована">{SHARE}</button><button class="rb gw pr" data-toast="Пожаловаться · Заблокировать">{MORE}</button></div></div>
<div class="scroll"><div class="spacer"></div><h1 class="nm">Даша, <em>27</em></h1><div class="mt3">1,2 км · 14 встреч · 4,9 ★</div>
<div class="tags">{chip('Бег')}{chip('Кофе')}{chip('Йога')}</div>
<div class="acts"><button class="rb g pr" data-follow>{I('bell')}</button><button class="btn l pr" data-heart>{HEART}Сердечко</button><button class="btn d pr" data-go="create">Позвать</button></div>
<div class="sec"><div><h3>Фото</h3></div></div>
<div class="ph3"><i style="{F('Даша',110,147,200)}"></i><i style="{F('Аня',110,147,200)}"></i><i style="{P('yoga','70% 40%')};background-size:cover"></i></div>
<div class="sec"><div><h3>Ближайшие <em>события</em></h3></div></div>
<div class="fevs"><button class="fev g pr" data-go="event"><i style="{P('running','45% center')}"></i><span><b>Пробежка на рассвете</b><small>Сб, 08:00 · идёт</small></span></button><button class="fev g pr" data-go="event"><i style="{P('yoga')}"></i><span><b>Йога в парке</b><small>Вс, 10:00 · организует</small></span></button></div>
<div class="sec"><div><h3>Отзывы</h3></div></div>
<div class="revs"><div class="rev g"><b>Олег · ★★★★★</b>Пунктуальная, с ней легко. Пробежали 7 км и не заметили.</div></div><div style="height:30px"></div></div>'''

S["venue"] = f'''<div class="pbg"></div><div class="hero2" style="{P('party','40% center')};background-size:cover"></div>
<div class="tbar"><button class="rb gw pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb gw pr" data-toast="Ссылка скопирована">{SHARE}</button></div></div>
<div class="scroll"><div class="spacer"></div><h1 class="nm">FORMA <em>lounge</em></h1><div class="mt3">Заведение · ул. Республики, 14 · 1 240 подписчиков</div>
<div class="tags">{chip('Бар')}{chip('Вечеринка')}{chip('Музыка')}</div>
<div class="acts"><button class="btn d pr" data-follow2>{I('bell')}Подписаться</button><button class="btn l pr" data-tab="map">{I('pin')}На карте</button></div>
<div class="sec"><div><h3>Афиша</h3><p>Подписчики узнают о новых событиях первыми</p></div></div>
<div class="fevs"><button class="fev g pr" data-go="event"><i style="{P('party')}"></i><span><b>Вечеринка FORMA</b><small>6 нояб, 23:00 · бесплатно · 158 мест</small></span></button><button class="fev g pr" data-go="event"><i style="{P('dinner')}"></i><span><b>Гастро‑вечер</b><small>15 нояб, 19:00 · 2000 ₽</small></span></button><button class="fev g pr" data-go="event"><i style="{P('bar')}"></i><span><b>Коктейльный мастер‑класс</b><small>20 нояб, 20:00 · 1500 ₽</small></span></button></div><div style="height:30px"></div></div>'''

mk = [("Бег", 30, 38, "Пробежка на рассвете", "Сб, 08:00 · 3 из 10", "running"), ("Кофе", 56, 22, "Кофе и разговоры", "Завтра, 19:00 · 2 из 4", "coffee"), ("Кино", 72, 46, "Кино вечером", "Сегодня, 21:00 · 1 из 2", "cinema"), ("Бар", 22, 60, "Вечеринка FORMA", "6 нояб, 23:00", "party"), ("Падел", 64, 66, "Падел для новичков", "Вс, 12:00 · 2 из 4", "padel")]
S["map"] = f'''<div class="map" style="position:absolute;inset:0">{MAPSVG}{"".join(f'<button class="mk pr{" on" if i==0 else ""}" data-mk="{i}" style="left:{x}%;top:{y}%">{C(n)}</button>' for i,(n,x,y,*_) in enumerate(mk))}</div>
<div class="top" style="position:absolute;top:58px;left:16px;right:16px;z-index:5"><button class="chip g pr" style="height:44px;border-radius:22px;padding:0 16px">{I('search')}Что ищем?</button><button class="rb g pr" data-toast="Ты здесь">{I('pin')}</button></div>
<div class="mapcar" id="mapcar">{"".join(f'<button class="mc g pr" data-go="event"><i style="{P(img)}"></i><span><b>{t}</b><small>{m}</small></span></button>' for (n,x,y,t,m,img) in mk)}</div>'''

def li(img, t, m, pill, cls, go="event"): return f'<button class="li g pr" data-go="{go}"><i style="{P(img)}"></i><span class="x"><b>{t}</b><small>{m}</small><span class="pill {cls}">{pill}</span></span></button>'
S["meet"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><h1 class="h1">Мои <em>встречи</em></h1><button class="rb g pr" data-go="chats" style="position:relative"><span class="ic">{I('chat')}<span class="badge">2</span></span></button></div>
<div class="tabs g" id="mtabs"><button class="on pr" data-mt="0">Я иду</button><button class="pr" data-mt="1">Создал</button><button class="pr" data-mt="2">Прошли</button></div>
<div class="list" data-ml="0">{li('running','Пробежка на рассвете','Сб, 08:00 · Набережная','Тебя приняли','ok')}{li('cinema','Кино вечером','Сегодня, 21:00 · Киномакс','Ждём ответа организатора','wait')}{li('party','Вечеринка FORMA','6 нояб, 23:00 · FORMA lounge','Билет в профиле','ok')}</div>
<div class="list" data-ml="1" hidden>{li('coffee','Кофе и разговоры','Завтра, 19:00 · 2 из 4','2 новые заявки','own')}</div>
<div class="list" data-ml="2" hidden>{li('walk','Прогулка по набережной','12 окт · 6 человек','Оставь отзыв','wait')}{li('bar','Бар‑квиз','5 окт · 4 человека','Отзыв оставлен','ok')}</div></div>'''

S["chats"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Чаты</h1>
<div class="list">
<button class="chi g pr" data-go="chat"><span class="a on" style="{F('Даша',52,52,140)}"></span><span class="x"><b>Даша</b><small>А после — кофе? ☕</small></span><span style="display:grid;justify-items:end;gap:4px"><time>18:07</time><span class="n">2</span></span></button>
<button class="chi g pr" data-go="chat"><span class="a" style="{P('running','45% center')}"></span><span class="x"><b>Пробежка на рассвете</b><small>Олег: Встречаемся у моста</small></span><span style="display:grid;justify-items:end;gap:4px"><time>16:40</time></span></button>
<button class="chi g pr" data-go="chat"><span class="a" style="{F('Макс',52,52,140)}"></span><span class="x"><b>Макс</b><small>Стикер</small></span><span style="display:grid;justify-items:end;gap:4px"><time>Вчера</time></span></button></div></div>'''

S["chat"] = f'''<div class="pbg"></div>
<div class="hd g"><button class="rb pr" data-back>{BACK}</button><span class="a" style="{F('Даша',48,48,140)}"></span><span style="flex:1"><b>Даша</b><small>в сети</small></span><button class="rb g pr" data-go="person">{MORE}</button></div>
<div class="scroll" id="chatScroll"><div class="ms" id="msgs"><span class="day g">Сегодня</span>
<div class="m in g">Привет! Видела, ты тоже бегаешь по набережной 🙂<small>18:02</small></div>
<div class="m out">Да, каждую субботу! Присоединяйся<small>18:04</small></div>
<button class="evc g pr" data-go="event"><div class="p" style="{P('running','45% center')}"></div><b>Пробежка <em>на рассвете</em></b><small>Сб, 08:00 · 3 из 10</small></button>
<img class="stkm out" src="a/stk_go.webp" alt="Иду!">
<div class="m in g">А после — кофе? ☕<small>18:07</small></div></div></div>
<div class="stkpick g" id="stkpick">{"".join(f'<button class="pr" data-stk="{k}"><img src="a/stk_{k}.webp" alt=""></button>' for k in ["privet","love","lol","wow","coffee","go","ok","party"])}</div>
<div class="inp g"><button class="s pr" id="stkBtn" aria-label="Стикеры"><img src="a/stk_privet.webp" alt=""></button><input id="msgIn" placeholder="Сообщение…"><button class="snd pr" id="sendBtn">{ARROW}</button></div>'''

def nt(icon_html, text, time, go): return f'<button class="nt g pr" data-go="{go}" style="width:100%;text-align:left"><span class="ic">{icon_html}</span><p>{text}<time>{time}</time></p></button>'
S["notif"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Уведомления</h1><div class="list">
{nt('<img src="a/stk_love.webp" alt="">','<b>Это взаимно!</b> Даша тоже поставила тебе сердечко','2 мин','person')}
{nt(C('Бег'),'<b>Олег</b> принял твою заявку на «Пробежку на рассвете»','1 ч','event')}
{nt(C('Вечеринка'),'<b>FORMA lounge</b> опубликовали новое событие','3 ч','venue')}
{nt(C('Кофе'),'Завтра в 19:00 — «Кофе и разговоры». Не опаздывай!','Вчера','event')}</div></div>'''

S["create"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:140px">
<div class="top"><button class="rb g pr" data-back>{I('x')}</button><button class="chip g pr" data-toast="Черновик сохранён">Черновик</button></div>
<h1 class="h1" style="margin-top:18px">Новая <em>встреча</em></h1>
<div class="cats" id="cats">{"".join(f'<button class="cat g pr{" on" if n=="Кофе" else ""}" data-ct="{n}">{C(n)}{n}</button>' for n in ["Кофе","Кино","Бег","Бар","Ужин","Вечеринка","Прогулка","Бизнес"])}</div>
<span class="lbl">Название</span><label class="field g"><input id="cTitle" value="Кофе и разговоры"></label>
<div class="row" style="margin-top:8px"><button class="field g pr" data-toast="Выбор даты">{I('cal')}<b>Завтра</b></button><button class="field g pr" data-toast="Выбор времени">{I('clock')}<b>19:00–21:00</b></button></div>
<div class="row" style="margin-top:8px"><button class="field g pr" data-tab="map">{I('pin')}<b>Центр</b></button><button class="field g pr" data-toast="Бесплатно · Пополам · Я угощаю">{I('spark')}<b>Пополам</b></button></div>
<div class="stepper g" style="margin-top:8px"><span>Ищу человек</span><span class="ct"><button class="rb g pr" data-st="-1">–</button><b id="seats">3</b><button class="rb g pr" data-st="1">+</button></span></div>
<button class="tg2 g pr" data-sw><span>Анонимно</span><span class="sw2"></span></button>
<button class="tg2 g pr" data-sw><span>Общий чат для участников</span><span class="sw2 on"></span></button>
<span class="lbl">Фон встречи</span><div class="bgs" id="bgs">{"".join(f'<button class="pr{" on" if i==0 else ""}" data-bg="{b}" style="{P(b)}"></button>' for i,b in enumerate(["coffee","breakfast","dinner","bar","walk","cinema"]))}</div></div>
<div class="foot"><button class="btn d pr" data-go="preview">Далее</button></div>'''

S["preview"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:140px">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Так увидят <em>встречу</em></h1>
<div class="prev" id="prevCard" style="{P('coffee')}"><span class="chip gw" style="top:14px;left:14px;height:30px;font-size:12px">0 из 3 · кофе</span>
<span style="left:18px;right:18px;bottom:18px"><span style="display:block;font:300 34px/1.05 var(--disp);letter-spacing:-.03em" id="prevTitle">Кофе и <em>разговоры</em></span><span style="display:block;font:400 13px var(--disp);opacity:.85;margin-top:6px">Завтра, 19:00 · Центр · Пополам</span></span></div></div>
<div class="foot"><button class="btn d pr" id="pubBtn">Опубликовать</button></div>'''

S["done"] = f'''<div class="pbg"></div><div class="done"><canvas class="cr cv" data-v="e" width="440" height="440"></canvas>
<div class="tx"><h1 class="h1">Встреча <em>опубликована</em></h1><p class="muted" style="font:400 15px/1.5 var(--disp);margin:10px 0 0">Подписчики и люди рядом увидят её первыми. Заявки придут в «Мои встречи».</p></div></div>
<div class="foot" style="background:none"><button class="btn d pr" data-tab="meet">К моим встречам</button><button class="btn l pr" data-tab="home">На главную</button></div>'''

S["me"] = f'''<div class="pbg"></div><div class="hero2" style="{F('Олег',390,470,320)}"></div>
<div class="tbar"><button class="rb gw pr" data-toast="Ссылка на профиль скопирована">{SHARE}</button><button class="rb gw pr" data-toast="Редактировать · Подписка · Поддержка · Выйти">{MORE}</button></div>
<div class="scroll"><div class="spacer"></div><h1 class="nm">Андрей <em>Г.</em></h1><div class="mt3">Тюмень · 12 встреч · 4,9 ★</div>
<div class="tags"><span class="chip g" style="height:32px;font-size:13px">48 подписчиков</span><span class="chip g" style="height:32px;font-size:13px">Подписка Старт</span></div>
<div class="tags">{chip('Бар')}{chip('Бег')}{chip('Бизнес')}{chip('Путешествия')}</div>
<div class="acts"><button class="btn l pr" data-toast="Редактор профиля">Редактировать</button><button class="btn d pr" data-go="create">Создать встречу</button></div>
<div class="sec"><div><h3>Мои <em>фото</em></h3></div><button class="all g pr" data-toast="Фото сохраняются вертикально 3:4 — с редактором">Изменить</button></div>
<div class="ph3"><i style="{F('Олег',110,147,200)}"></i><i style="{P('cycling')};background-size:cover"></i><i class="g">+</i></div>
<div class="sec"><div><h3>Отзывы</h3></div></div><div class="revs"><div class="rev g"><b>Даша · ★★★★★</b>Классная пробежка, всё чётко по времени.</div></div><div style="height:30px"></div></div>'''

exec(open(os.path.join(D, "screens2.py")).read())
exec(open(os.path.join(D, "screens3.py")).read())
exec(open(os.path.join(D, "screens4.py")).read())
exec(open(os.path.join(D, "screens5.py")).read())
exec(open(os.path.join(D, "screens6.py")).read())
exec(open(os.path.join(D, "screens7.py")).read())
exec(open(os.path.join(D, "screens8.py")).read())
exec(open(os.path.join(D, "screens9.py")).read())
exec(open(os.path.join(D, "screens10.py")).read())
exec(open(os.path.join(D, "screens11.py")).read())
exec(open(os.path.join(D, "screens12.py")).read())
exec(open(os.path.join(D, "screens13.py")).read())
DARK = {"event", "myevent", "mybiz", "anon_f", "anon_m", "person", "venue", "me", "deck", "auth"}  # white status bar
TABS = {"home": 0, "map": 1, "meet": 3, "me": 4}
screens_html = "".join(f'<section class="scr {k}{" ev" if k in ("event","myevent","mybiz","anon_f","anon_m") else ""}{" pp" if k in ("person","venue","me") else ""}{" chat" if k=="chat" else ""}{" deck" if k=="deck" else ""}{" intro" if k=="intro" else ""}" data-id="{k}" hidden>{v}</section>' for k, v in S.items())

NAV = f'''<nav class="nav hide" id="nav"><svg class="edge" viewBox="0 0 358 58"><path d="M29 0H134.18A6 6 0 0 1 140.16 6.53A39 39 0 1 0 217.84 6.53A6 6 0 0 1 223.82 0H329A29 29 0 0 1 329 58H29A29 29 0 0 1 29 0Z" fill="none" stroke="#fff" stroke-width="1.2"/></svg>
<button class="bl pr" id="plus" aria-label="Создать встречу"><canvas class="cr" data-v="p" width="132" height="132"></canvas><span class="pl"></span></button>
<button class="it pr" data-tab="home">{I('home')}<span>Главная</span></button><button class="it pr" data-tab="map">{I('map')}<span>Карта</span></button><span class="sp"></span>
<button class="it pr" data-tab="meet"><span class="ic">{I('chat')}<span class="badge">2</span></span><span>Встречи</span></button><button class="it pr" data-tab="me">{I('user')}<span>Профиль</span></button></nav>'''

OVS = f'''<div class="ov" id="citySheet"><div class="dim" data-close></div><div class="sheet" style="max-height:78%;display:flex;flex-direction:column"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Выбери <em>город</em></h2>
<label class="field g csearch">{I('search')}<input id="cityQ" placeholder="Начни вводить — только города России"></label>
<div class="citylist" style="overflow-y:auto;scrollbar-width:none">{"".join(f'<button class="g pr{" on" if c=="Тюмень" else ""}" data-city="{c}">{c}<span>{"✓" if c=="Тюмень" else ""}</span></button>' for c in ['Тюмень', 'Екатеринбург', 'Москва', 'Санкт‑Петербург', 'Казань', 'Новосибирск', 'Челябинск', 'Омск', 'Сургут', 'Тобольск', 'Курган', 'Пермь', 'Уфа', 'Самара', 'Сочи'])}</div></div></div>
<div class="ov" id="quick"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Быстрый <em>доступ</em></h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:8px 0 0">Добавь «Место» на экран «Домой» — открывай в одно касание, как обычное приложение.</p>
<div class="qa g"><img src="a/appicon1.webp" alt=""><span><b>Место</b><small>Найди компанию на сегодня</small></span></div>
<div style="display:grid;gap:10px"><button class="btn d pr" data-close data-toast="Добавлено на экран «Домой»">Добавить</button><button class="btn l pr" data-close>Позже</button></div></div></div>
<div class="ov" id="matchOv"><div class="match"><button class="rb g pr x" data-close>{I('x')}</button>
<div class="ph a" style="{F('Олег',168,224,220)}"></div><div class="ph b" style="{F('Даша',168,224,220)}"></div>
<img class="mid" src="a/stk_love.webp" alt=""><div class="t"><h1>Это <em>взаимно!</em></h1><p>Даша тоже поставила тебе сердечко</p><div class="cs">{chip('Бег')}{chip('Кофе')}</div></div>
<div class="bt"><button class="btn d pr" data-close data-go="create">Позвать на встречу</button><button class="btn l pr" data-close data-go="chat">Написать</button></div></div></div>
<div class="toast g" id="toast"></div>''' + EXTRA_OVS
for _a,_b in OVS_PATCH: OVS = OVS.replace(_a,_b)

PHONE = f'''<div class="phone" id="phone"><div class="scr-wrap" id="wrap">{screens_html}{NAV}{OVS}<div class="island"></div><div class="sbar" id="sbar"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg viewBox="0 0 27 12" width="27" height="12"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="20" height="8" rx="2.2" fill="currentColor"/></svg></span></div><div class="homebar" id="hbar"></div></div></div>'''

FLOW = FLOW2

COLORS = [("Жемчуг","#F4F2F8","фон"),("Жемчуг 2","#ECE8F2","фон, низ"),("Чернила","#17141F","текст, главные кнопки"),("Стекло","rgba(255,255,255,.58)","плашки, кнопки"),("Сирень","#AAA0FF","свечение фона"),("Персик","#FFBEA0","свечение фона"),("Небо","#8CAAFF","свечение фона"),("Хром · синий","#2F56E8","иконки интересов"),("Хром · розовый","#FF6FB0","иконки интересов"),("Хром · оранж","#FF7A3A","иконки, отсвет")]

def sw_html():
    out = ""
    for n, c, r in COLORS:
        dark = n in ("Чернила", "Хром · синий")
        out += f'<div style="background:{c};color:{"#fff" if dark else "var(--ink)"}">{n}<small>{c} · {r}</small></div>'
    return out

STK_LIST = json.load(open(os.path.join(D, "..", "blob", "stk", "list.json")))
BOOK = f'''<div class="hero"><img class="wm" src="a/wordmark-dark.svg" alt="место">
<h1>Новый дизайн <em>Места</em></h1>
<p>Жемчужный светлый фон, стеклянные кнопки, живые фото людей и живое существо вместо Моси. Механика остаётся нашей: меняем только то, как всё выглядит и двигается. Справа — кликабельный прототип, начни с вводных слайдов и пройди до создания встречи.</p>
<div class="toc"><a href="#proto">Прототип</a><a href="#logo">Логотип и иконка</a><a href="#color">Цвета</a><a href="#type">Шрифты</a><a href="#creature">Существо</a><a href="#icons">Иконки</a><a href="#stickers">Стикеры</a><a href="#fx">Нажатия</a><a href="#motion">Анимации</a><a href="#keep">Что сохраняем</a></div></div>

<section class="b" id="proto"><div class="eyebrow">Прототип</div><h2 class="bt">Пройди <em>весь путь</em></h2>
<p class="lead">Всё в телефоне нажимается: свайп «Далее» на слайдах, вход, анкета, интересы, город, главная, событие, листание людей, «Это взаимно», чат со стикерами, создание встречи. Можно прыгнуть на любой экран:</p>
<div class="flow" id="flow">{"".join(f'<button data-jump="{k}">{l}</button>' for k,l in FLOW)}</div></section>

<section class="b" id="logo"><div class="eyebrow">Логотип и иконка</div><h2 class="bt">Текстовый логотип <em>остаётся</em></h2>
<p class="lead">Рукописное «место» не меняем. На светлом фоне — чернильный, на фото — белый. Иконка приложения: наш жемчужный фон и плоская чёрная «м». Вариант ещё выбираем.</p>
<div class="grid2"><div class="panel" style="display:flex;align-items:center;justify-content:center;min-height:150px"><img src="a/wordmark-dark.svg" alt="место" style="height:44px"></div>
<div class="panel" style="display:flex;align-items:center;justify-content:center;min-height:150px;background:linear-gradient(135deg,#2A2438,#17141F)"><img src="a/wordmark-white.svg" alt="место" style="height:44px"></div></div>
<div class="panel appic" style="margin-top:14px">{"".join(f'<div><img src="a/appicon{i}.webp" alt="">{l}</div>' for i,l in enumerate(["1 · Прямо, за края","2 · Повёрнута","3 · На боку","4 · Зеркальная","5 · Крупно в угол","6 · Целиком"],1))}</div></section>

<section class="b" id="color"><div class="eyebrow">Цвета</div><h2 class="bt">Жемчуг, чернила <em>и стекло</em></h2>
<p class="lead">Фон — тёплый жемчуг с тремя мягкими пятнами света (сирень, персик, небо), они медленно переливаются. Главные кнопки — чернильные. Всё остальное — полупрозрачное стекло с белой кромкой. Яркий цвет — только в иконках интересов и в существе.</p>
<div class="sw">{sw_html()}</div></section>

<section class="b" id="type"><div class="eyebrow">Шрифты</div><h2 class="bt">Гротеск + <em>курсив</em> для одного слова</h2>
<p class="lead">Основной шрифт — Inter (тонкий для заголовков, обычный для текста). В каждом заголовке одно ключевое слово набирается курсивом Lora. Это наш почерк — не больше одного курсивного слова в строке.</p>
<div class="panel type">
<div class="row"><span class="k">Заголовок · 38/40</span><div style="font:300 38px/1.05 var(--disp);letter-spacing:-.035em">Найди <em>компанию</em> на сегодня</div></div>
<div class="row"><span class="k">Раздел · 20</span><div style="font:400 20px var(--disp);letter-spacing:-.02em">Люди <em>в твоём городе</em></div></div>
<div class="row"><span class="k">Карточка · 15/500</span><div style="font:500 15px var(--disp)">Пробежка <em>на рассвете</em></div></div>
<div class="row"><span class="k">Текст · 15/400</span><div style="font:400 15px/1.5 var(--disp);color:var(--ink2)">5 км в спокойном темпе вдоль Туры, потом кофе.</div></div>
<div class="row"><span class="k">Подпись · 12–13</span><div style="font:400 13px var(--disp);color:var(--ink2)">Сб, 08:00 · Набережная · 3 из 10</div></div>
<div class="row"><span class="k">Кнопка · 16/500</span><div style="font:500 16px var(--disp)">Я иду</div></div></div></section>

<section class="b" id="creature"><div class="eyebrow">Существо</div><h2 class="bt">Живое, <em>всегда в движении</em></h2>
<p class="lead">Заменяет Мосю везде. Полупрозрачное, переливается и всё время меняет форму. Под ним никогда нет подложки. С глазами — когда говорит с человеком (вход, подсказки, пустые экраны), без глаз и с плюсом — кнопка создания в меню.</p>
<div class="panel creatures">
<div class="c"><canvas class="cr" data-v="e" width="280" height="280"></canvas><b>С глазами</b>Моргает раз в 3 секунды. Вход, главная, подсказки.</div>
<div class="c"><div style="position:relative;width:140px;height:140px"><canvas class="cr" data-v="p" width="280" height="280"></canvas><span style="position:absolute;inset:0;background:linear-gradient(#fff,#fff) center/34px 4px no-repeat,linear-gradient(#fff,#fff) center/4px 34px no-repeat;opacity:.85"></span></div><b>С плюсом</b>Центр меню. Хаотично шевелится в своём вырезе, на меню не заходит.</div>
<div class="c"><button class="pr" id="jellyDemo" style="border-radius:50%"><canvas class="cr" data-v="e" width="280" height="280"></canvas></button><b>Нажми на него</b>Отвечает желейным прыжком — так же в меню.</div></div></section>

<section class="b" id="icons"><div class="eyebrow">Иконки интересов</div><h2 class="bt">Матовые <em>чёрные</em></h2>
<p class="lead">Плоские формы без глянца, оттенки чернил — хорошо читаются даже в маленьких чипах. Все наши интересы плюс новые: Hyrox, триатлон, плавание, падел, квизы, валяться дома.</p>
<div class="panel icons">{"".join(f'<div>{C(i)}{n}</div>' for _,it in INT_GROUPS for n,i in it)}</div></section>

<section class="b" id="stickers"><div class="eyebrow">Стикеры</div><h2 class="bt">Эмоции <em>для чата</em></h2>
<p class="lead">Набор вместо стикеров с Мосей. Нажми — стикер подпрыгнет; в прототипе их можно отправить в чате.</p>
<div class="panel stk">{"".join(f'<button class="pr"><img src="a/stk_{k}.webp" alt="">{l}</button>' for k,l in STK_LIST)}</div></section>

<section class="b" id="fx"><div class="eyebrow">Нажатия</div><h2 class="bt">Каждое касание <em>отвечает</em></h2>
<p class="lead">Потыкай — эти же эффекты работают во всём прототипе.</p>
<div class="fx">
<div class="cell"><button class="btn d pr" style="width:150px">Я иду</button><b>Пружина + свет</b>Кнопка проседает и отпружинивает, из точки касания расходится свечение.</div>
<div class="cell"><button class="chip g pr" data-tog>{C('Кофе')}Кофе</button><b>Переключатель</b>Чип плавно заливается чернилами.</div>
<div class="cell"><button class="rb g pr" data-burst style="width:56px;height:56px">{HEART}</button><b>Сердечки</b>Сердечко взрывается маленькими сердечками.</div>
<div class="cell"><button class="tg2 g pr" data-sw style="width:150px;margin:0"><span>Чат</span><span class="sw2 on"></span></button><b>Тумблер</b>Ползунок переезжает с пружиной.</div></div></section>

<section class="b" id="motion"><div class="eyebrow">Анимации</div><h2 class="bt">Как в <em>iPhone</em></h2>
<div class="panel tbl motion"><table><thead><tr><th>Что</th><th>Как</th><th>Где</th></tr></thead><tbody>
<tr><td>Переход вперёд</td><td>0,5 с · сдвиг справа</td><td>Новый экран выезжает справа, прошлый уходит на 28% и темнеет</td></tr>
<tr><td>Назад</td><td>0,5 с · обратный</td><td>Кнопка «назад»</td></tr>
<tr><td>Шторка</td><td>0,55 с · снизу</td><td>Создание встречи, выбор города, быстрый доступ</td></tr>
<tr><td>Вкладки</td><td>0,45 с · проявление</td><td>Главная, карта, встречи, профиль</td></tr>
<tr><td>Нажатие</td><td>0,12 с вниз · 0,5 с пружина</td><td>Все кнопки и карточки</td></tr>
<tr><td>Существо</td><td>постоянно</td><td>Переливается и меняет форму, моргает раз в 3 с</td></tr>
<tr><td>Фон</td><td>18–22 с · по кругу</td><td>Пятна света медленно плывут</td></tr>
<tr><td>Взаимность</td><td>0,8 с · пружина</td><td>Фото влетают с боков, стикер выпрыгивает, сердечки</td></tr>
</tbody></table></div></section>

<section class="b" id="keep"><div class="eyebrow">Вся механика</div><h2 class="bt">Переносим <em>всё</em></h2><p class="lead">Полный список того, что есть в приложении сейчас. Меняем только дизайн. Отмечено, что уже можно потыкать в прототипе.</p><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Вход и регистрация</b><ul class="mech"><li class="y"><i>✓</i>Вводные слайды «Есть куда пойти», автолистание 4,2 с, «Пропустить»</li><li class="y"><i>✓</i>Вход: в Telegram — сам; в приложении — Telegram, Apple, почта (код на почту)</li><li class="y"><i>✓</i>Анкета: 1–3 фото (первое из Telegram, без фото нельзя), имя, дата рождения, пол, город, «о себе» до 300 символов</li><li class="y"><i>✓</i>Подсказки существа выглядывают с края (вместо Моси)</li><li class="y"><i>✓</i>Интересы по группам, минимум 3</li><li class="y"><i>✓</i>Город: геолокация или поиск только по городам России</li><li class="y"><i>✓</i>Быстрый доступ после регистрации, потом раз в 3 дня, максимум 4 раза; мини‑приложение на весь экран</li><li class="n"><i>·</i>Если пришёл по ссылке на встречу — после анкеты сразу на неё</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Главная</b><ul class="mech"><li class="y"><i>✓</i>Город, уведомления, поиск, категории, «Фильтры» (дата, время, направление)</li><li class="y"><i>✓</i>«N человек рядом свободны сегодня вечером» — живой счётчик → листать людей</li><li class="y"><i>✓</i>Личные встречи, Люди в твоём городе (с расстоянием), Афиша заведений с фильтром</li><li class="y"><i>✓</i>Карточки одного размера, подписи на одной линии; плюс «Здесь может быть ваше бизнес‑событие»</li><li class="y"><i>✓</i>«Все» → все встречи с фильтрами (личные / для бизнеса / дни / направления)</li><li class="n"><i>·</i>Праздник «Это взаимно!» при входе, если взаимность случилась без тебя</li><li class="n"><i>·</i>Окно отзыва о прошедшей встрече при входе</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Событие</b><ul class="mech"><li class="y"><i>✓</i>Вертикальное фото, размытый фон, стеклянные плитки: когда, места «x из N», расходы/билет</li><li class="y"><i>✓</i>Организатор с рейтингом; у анонимной — «Организатор скрыт · Почему?» и «Место откроется после одобрения»</li><li class="y"><i>✓</i>Место на карте, маршрут в Яндекс Картах, копирование адреса</li><li class="y"><i>✓</i>Кто идёт, описание, чат встречи (после одобрения)</li><li class="y"><i>✓</i>«Я иду» → «Отправить заявку?» → «Заявка отправлена» со статусами</li><li class="y"><i>✓</i>Поделиться: чат и сторис Telegram, сторис Instagram, WhatsApp, ВК, ссылка</li><li class="n"><i>·</i>Для организатора: «В популярное» (по тарифу или разово 149 ₽), заявки, участники, убрать участника, редактировать, отменить/завершить</li><li class="n"><i>·</i>Билеты бизнес‑событий: номер билета после одобрения</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Люди</b><ul class="mech"><li class="y"><i>✓</i>Листать: профиль на весь экран, фото тапом, свайп вбок — следующий, вверх — о себе, общие интересы, события</li><li class="y"><i>✓</i>Сердечко (иконкой), чат, колокольчик‑подписка, «Позвать» на встречу</li><li class="y"><i>✓</i>Фильтр людей: возраст, пол, интересы, расстояние</li><li class="n"><i>·</i>«Вам поставили сердечко» — шторка в профиле</li><li class="y"><i>✓</i>Пожаловаться / заблокировать</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Создание встречи</b><ul class="mech"><li class="y"><i>✓</i>«Что создаём?»: открытая, анонимная, для бизнеса</li><li class="y"><i>✓</i>Что планируем: категории, вид тренировки, «Своё предложение»; для бизнеса — «Куда зовёшь?»</li><li class="y"><i>✓</i>Название и обложка: фирменные обложки или своё фото (вертикально, редактор)</li><li class="y"><i>✓</i>Когда и где: колёса дня и времени, календарь, длительность, подсказки адреса, копировать адрес</li><li class="y"><i>✓</i>Кто и сколько: лимит группы по подписке (4/10/30, бизнес до 500), расходы или билет, открыто/анонимно, превью</li><li class="n"><i>·</i>Без подписки — экран подписки перед созданием</li><li class="y"><i>✓</i>«Встреча опубликована»: поделиться, в популярное, к моим встречам; подписчики получают уведомление</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Встречи, чаты, уведомления</b><ul class="mech"><li class="y"><i>✓</i>Мои встречи: иду / создал / прошли, статусы заявок</li><li class="y"><i>✓</i>Чаты: список, непрочитанные, мини‑профиль собеседника</li><li class="y"><i>✓</i>Чат: сообщения, стикеры (будут анимированные), фото отправляются целиком, галочки прочтения</li><li class="y"><i>✓</i>Уведомления: взаимность, заявки, события подписок, напоминания</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Профиль и подписка</b><ul class="mech"><li class="y"><i>✓</i>Фото 3 в ряд вертикально, интересы, подписчики, отзывы, редактирование</li><li class="y"><i>✓</i>Подписка: Старт 299 ₽, Медиум 599 ₽, Премиум 999 ₽; без подписки — 4 отклика; оплата картой или Telegram Stars</li><li class="y"><i>✓</i>Профиль заведения/организатора с подпиской и афишей</li><li class="n"><i>·</i>Поддержка («на связи» с ИИ), приватность, реферальные ссылки</li></ul></div><div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Карта</b><ul class="mech"><li class="y"><i>✓</i>Настоящая карта (OpenFreeMap), метки‑капли с фото события и плашкой времени</li><li class="y"><i>✓</i>Карусель встреч внизу, фильтры, «ты здесь»</li><li class="n"><i>·</i>У анонимной встречи на метке персонаж вместо фото</li></ul></div><div class="status" style="margin-top:16px"><span><i></i>Утверждено: стиль, меню, вход, слайды, быстрый доступ</span><span class="q"><i></i>Выбираем: иконка приложения</span><span class="q"><i></i>Обсудить: механика бизнес‑событий</span><span class="q"><i></i>Позже: настоящие фото людей, анимация стикеров</span></div></section>
<footer>Место · брендбук и прототип · ноябрь 2026</footer>'''

BOOK = BOOK.replace('<footer>', LEGAL_HTML + '<footer>').replace('<a href="#keep">Что сохраняем</a>','<a href="#keep">Механика</a><a href="#legal">Документы</a>')
JS = "window.COVERS=" + COVERS_JS + ";\n" + open(os.path.join(D, "proto.js")).read()
SHADER = open(os.path.join(D, "shader.js")).read()
CSS = open(os.path.join(D, "proto.css")).read()
deck_data = json.dumps([
  {"n": "Даша", "a": 27, "d": "1,2 км", "r": "4,9", "mc": 14, "ab": "Бегаю по субботам, люблю кофе после. Ищу компанию на выходные и новые места в городе.", "i": ["Бег","Кофе","Йога"], "ph": [F('Даша',390,640,300), F('Даша',390,640,190), F('Аня',390,640,260)]},
  {"n": "Олег", "a": 31, "d": "3 км", "r": "4,8", "mc": 23, "ab": "Организую пробежки и бар‑квизы. Зову всех, кто не любит сидеть дома.", "i": ["Бег","Бары"], "ph": [F('Олег',390,640,280), F('Олег',390,640,190)]},
  {"n": "Катя", "a": 27, "d": "4 км", "r": "5,0", "mc": 6, "ab": "Недавно переехала в Тюмень. Кино, кофе и прогулки по набережной.", "i": ["Кофе","Кино"], "ph": [F('Катя',390,640,300), F('Катя',390,640,200)]},
  {"n": "Макс", "a": 29, "d": "2 км", "r": "4,7", "mc": 11, "ab": "Падел по воскресеньям, ищу пару и соперников. Новичков научу.", "i": ["Падел","Бары"], "ph": [F('Макс',390,640,280)]},
], ensure_ascii=False)
deck_icons = json.dumps({"Бег":C("Бег"),"Кофе":C("Кофе"),"Йога":C("Йога"),"Бары":C("Бар"),"Кино":C("Кино"),"Падел":C("Падел")}, ensure_ascii=False)

HTML = f'''<title>Место — новый дизайн</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..600&family=Lora:ital,wght@1,400;1,500&display=swap">
<style>{CSS}</style>
<div class="bgfx"></div>
<div class="wrap"><main class="book">{BOOK}</main><aside class="stage">{PHONE}<div class="flow" style="justify-content:center"><button id="restart">С начала</button><button data-jump="home">Главная</button></div></aside></div>
<script>const DECK={deck_data};const DICO={deck_icons};const TABS={json.dumps(TABS)};const DARK={json.dumps(sorted(DARK))};</script>
<script>{SHADER}</script>
<script>{JS}</script>'''
open(os.path.join(D, "mesto-design.html"), "w").write(HTML)
print(len(HTML)//1024, "KB")

# Round 5 (morning feedback)
import re as _re

# 1) «Что создаём?» — live creature instead of static stickers
def opt3b(k, t, d, on=False, tint=""):
    return (f'<button class="opt3 g pr{" on" if on else ""}" data-kind="{k}"><span class="crw {tint}"><canvas class="cr" data-v="e" width="150" height="150"></canvas></span>'
            f'<span><b>{t}</b><small>{d}</small></span></button>')
S["create"] = _re.sub(r'<div class="opts"><button class="opt3.*?</div>', '<div class="opts">'
  + opt3b('open', 'Открытая встреча', 'Кофе, спорт, кино, прогулка — все видят тебя и место встречи', True)
  + opt3b('anon', 'Анонимная встреча', 'Имя, фото и точный адрес увидят только те, чью заявку ты примешь', tint='t2')
  + opt3b('biz', 'Событие для бизнеса', 'Афиша для заведения или своего дела: концерт, квиз, мастер‑класс. Гостей до 500, можно билеты', tint='t3')
  + '</div>', S["create"], count=1, flags=_re.S)

# 2) «Своё предложение» — input inside the card, no overlap
S["create"] = S["create"].replace('<label class="field g" id="ownIn" hidden style="margin-top:8px"><input placeholder="Например: сапы, вязание, бадминтон" maxlength="30"></label>',
  '<label class="field g" id="ownIn" hidden style="margin-top:8px"><input placeholder="Например: сапы, вязание, бадминтон" maxlength="30"><span class="cnt2">0/30</span></label>')

# 3) date: calendar button; time + duration as iOS wheels
def wh(items, sel, wid, cls=""):
    return f'<div class="wheel g {cls}" id="{wid}"><div class="wsel"></div><div class="wl" data-sel="{sel}">' + "".join(f'<span{" class=on" if i==sel else ""}>{x}</span>' for i, x in enumerate(items)) + '</div></div>'
HRS = [f"{h:02d}" for h in range(6, 24)]; MINS = ["00", "15", "30", "45"]
DUR = ["30 мин", "1 ч", "1,5 ч", "2 ч", "2,5 ч", "3 ч", "4 ч", "Весь день"]
S["create"] = _re.sub(r'<span class="lbl">Начало</span>.*?<span class="lbl">Место</span>',
  '<div class="whrow"><div><span class="lbl">Начало</span><div class="wheels2">' + wh(HRS, 13, "wH") + '<b class="colon">:</b>' + wh(MINS, 0, "wM") + '</div></div>'
  '<div><span class="lbl">Сколько продлится</span>' + wh(DUR, 3, "wDur", "wide") + '</div></div><span class="lbl">Место</span>',
  S["create"], count=1, flags=_re.S)
S["create"] = S["create"].replace(f'<button class="dp g pr" data-ov="dateSheet">{I("cal")}<b style="font-size:11px">Ещё</b></button></div>',
  '</div>' + f'<button class="calb g pr" data-ov="dateSheet">{I("cal")}Выбрать в календаре</button>')

# 4) places: recommended by rating (Яндекс / 2ГИС)
S["create"] = _re.sub(r'<div class="recp">.*?</div><small class="rpn">.*?</small>', '<div class="recp">' + "".join(
  f'<button class="rp g pr" data-place="{n}|{a}"><i style="{P(img)}"></i><span><b>{n}</b><small>{a}</small></span><span class="rt">★ {r}<small>{src}</small></span></button>'
  for n, a, r, src, img in [("Кофемания", "ул. Республики, 14", "4,9", "Яндекс", "coffee"), ("Surf Coffee", "ул. Ленина, 2а", "4,8", "2ГИС", "breakfast"), ("Coffee Like", "ул. Мельникайте, 72", "4,7", "Яндекс", "bar")])
  + '</div><small class="rpn">Лучшие по рейтингу Яндекс Карт и 2ГИС для «Кофе» · или найди своё</small>', S["create"], count=1, flags=_re.S)

# 5) settings: show «chat» only when it makes sense (always for personal ≤20)
# (kept toggles; label fix)

# 6) event: route + my location; organizer view
S["event"] = _re.sub(r'<button class="mapbox pr" data-tab="map"[^>]*>(.*?)</button>',
  lambda m: '<div class="mapbox" style="display:block;width:100%;margin:0;border-radius:0;height:170px;position:relative">' + m.group(1) + '<button class="mapfull pr" data-tab="map" aria-label="Открыть карту"></button>'
  + f'<span class="mapact"><button class="chip gw pr" data-toast="Откроется маршрут в Яндекс Картах">{I("pin")}Маршрут</button><button class="chip gw pr" data-copyaddr>Скопировать адрес</button></span></div>', S["event"], count=1, flags=_re.S)
S["myevent"] = S["event"].replace('<div class="cta gd"><button class="rb gw pr" data-toast="Ссылка скопирована">{}</button><button class="btn pr" id="goBtn" style="background:#fff;color:var(--ink)">Я иду {}</button></div>'.format(SHARE, CHECK),
  f'<div class="cta gd"><button class="rb gw pr" data-ov="shareSheet">{SHARE}</button><button class="rb gw pr" data-ov="boostSheet">{I("spark")}</button><button class="btn pr" data-go="requests" style="background:#fff;color:var(--ink)">Заявки · 2</button></div>')
S["myevent"] = S["myevent"].replace('id="goBtn"', 'id="goBtn2"').replace('<span class="chip gw" style="height:32px">', f'<span class="orgbar"><button class="chip gw pr" data-go="create" data-edit>{I("cal")}Редактировать</button><button class="chip gw pr" data-toast="Отменить или завершить встречу">Отменить</button></span><span class="chip gw" style="height:32px">', 1)
S["myevent"] = S["myevent"].replace('Пробежка<br><em>на рассвете</em>', 'Кофе и<br><em>разговоры</em>').replace(P('running', '42% center'), P('coffee', '60% center')).replace(P('running'), P('coffee'), 1)
S["meet"] = S["meet"].replace("li('coffee','Кофе и разговоры','Завтра, 19:00 · 2 из 4','2 новые заявки','own')", "li('coffee','Кофе и разговоры','Завтра, 19:00 · 2 из 4','2 новые заявки','own','myevent')")
def req(n, a, m):
    return f'<div class="rq g"><span class="a" style="{F(n,52,52,140)}"></span><span class="x"><b>{n}, {a}</b><small>{m}</small></span><button class="rb g pr" data-rq="no">{I("x")}</button><button class="rb pr rbd" data-rq="ok">{CHECK}</button></div>'
S["requests"] = f'''<div class="pbg"></div><div class="scroll"><div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Заявки <em>на встречу</em></h1><p class="sub2">Кофе и разговоры · завтра, 19:00 · 2 из 4</p>
<div class="list" id="rqList">{req('Даша',27,'4,9 ★ · 2 общих интереса · «Можно с подругой?»')}{req('Макс',29,'4,7 ★ · 1 общий интерес')}</div>
<span class="lbl">Участники</span><div class="list">{req('Олег',31,'Принят · 4,8 ★').replace('data-rq="no"','data-toast="Убрать участника?"').replace('<button class="rb pr rbd" data-rq="ok">'+CHECK+'</button>','')}</div></div>'''

# 7) profile: no "Создать встречу"
S["me"] = S["me"].replace('<div class="acts"><button class="btn l pr" data-toast="Редактор профиля">Редактировать</button><button class="btn d pr" data-go="create">Создать встречу</button></div>',
  '<div class="acts"><button class="btn l pr" data-toast="Редактор профиля">Редактировать профиль</button></div>')

# 8) home afisha: no date chip/map icon; tap → afisha screen
S["home"] = _re.sub(r'<div class="hs fch".*?</div>', '', S["home"], count=1, flags=_re.S)
S["home"] = S["home"].replace(f'<span style="display:flex;gap:6px"><button class="rb g pr" style="width:32px;height:32px" data-tab="map" data-bizmap aria-label="На карте">{MAPI}</button><button class="all g pr" data-go="allev" data-biz>Все</button></span>',
  '<button class="all g pr" data-go="afisha">Все</button>')
S["home"] = S["home"].replace("data-go=\"venue\"><span class=\"chip gw tg\">↑ В топе</span>", "data-go=\"event\"><span class=\"chip gw tg\">↑ В топе</span>")
S["home"] = S["home"].replace('<button class="chip g pr" style="height:40px">' + I('pin') + 'Тюмень</button>', '<button class="chip g pr" style="height:40px" data-ov="citySheet">' + I('pin') + 'Тюмень' + DOWN + '</button>')

AF_CATS = [("Все", None), ("Кафе и рестораны","Ужин"),("Бары","Бар"),("Вечеринки","Вечеринка"),("Концерты","Концерты"),("Театр и стендап","Театр"),("Мастер‑классы","Кулинария"),("Выставки","Выставки"),("Спорт","Hyrox")]
def afrow(img, t, m, price, venue): return f'<button class="afr g pr" data-go="event"><i style="{P(img)}"><span class="chip gw">{price}</span></i><span class="x"><b>{t}</b><small>{m}</small><small class="vn">{venue}</small></span></button>'
S["afisha"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb g pr" data-tab="map" data-bizmap aria-label="На карте">{MAPI}</button><button class="rb g pr" data-ov="dateSheet" aria-label="Календарь">{I('cal')}</button></div></div>
<h1 class="h1" style="margin-top:18px">Афиша <em>заведений</em></h1><p class="sub2">Все события для бизнеса в Тюмени</p>
<div class="dates">{"".join(f'<button class="dp g pr{" on" if i==0 else ""}" data-af><small>{a}</small><b>{b}</b></button>' for i,(a,b) in enumerate([("Сегодня","6"),("Сб","7"),("Вс","8"),("Пн","9"),("Вт","10"),("Ср","11"),("Чт","12")]))}</div>
<button class="catsel g pr" data-catopen><span>{C('Ужин')}<b id="afCat">Все разделы</b></span>{DOWN}</button>
<div class="catgrid" id="afCats" hidden>{"".join(f'<button class="cat g pr{" on" if n=="Все" else ""}" data-afc="{n}">{C(i) if i else C("Другое")}{n}</button>' for n,i in AF_CATS)}</div>
<div class="list">{afrow('party','Вечеринка FORMA','Сегодня, 23:00 · 158 мест','Бесплатно','FORMA lounge')}{afrow('dinner','Гастро‑вечер','Сб, 19:00 · 24 места','2000 ₽','Ресторан «Улица»')}{afrow('bar','Коктейльный мастер‑класс','Вс, 20:00 · 12 мест','1500 ₽','Бар «Кислород»')}{afrow('cinema','Стендап: открытый микрофон','Вт, 20:00 · 60 мест','500 ₽','Клуб «Подвал»')}</div></div>'''

FLOW2[:] = [x for x in FLOW2]
for k, l in [("afisha", "Афиша"), ("myevent", "Моя встреча"), ("requests", "Заявки")]:
    if (k, l) not in FLOW2: FLOW2.insert(7, (k, l))

# 9) share: new design with story preview
EXTRA_OVS = _re.sub(r'<div class="ov" id="shareSheet">.*?</div></div></div>', '', EXTRA_OVS, count=1, flags=_re.S)
SHARE_T = [("tg", "Telegram", "#2AABEE"), ("st", "Сторис TG", "linear-gradient(135deg,#2AABEE,#7A5CFF)"), ("ig", "Instagram", "linear-gradient(135deg,#FEDA75,#FA7E1E,#D62976,#962FBF)"), ("wa", "WhatsApp", "#25D366"), ("vk", "ВКонтакте", "#0077FF"), ("ln", "Ссылка", "#17141F")]
EXTRA_OVS += f'''<div class="ov" id="shareSheet"><div class="dim" data-close></div><div class="sheet shs"><div class="grab"></div>
<div class="story" id="storyCard" style="{P('coffee')}"><img class="swm" src="a/wordmark-white.svg" alt=""><span class="schip">Кофе · завтра, 19:00</span>
<span class="stt">Кофе и <em>разговоры</em></span><span class="sme">Кофемания · 2 из 4 · каждый за себя</span><span class="scta">Я иду → mesto-go.ru</span></div>
<div class="shr2">{"".join(f'<button class="pr" data-close data-toast="{l}: открываем…"><span style="background:{c}">{l[:2] if k!="ln" else "🔗"}</span>{l}</button>' for k,l,c in SHARE_T)}</div></div></div>'''
OVS_PATCH.append(('Даша тоже поставила тебе сердечко', 'Даша тоже поставила тебе сердечко'))

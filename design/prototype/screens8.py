# Round 8: city switch, search, multi-day dates, creator filter + age, boost to top,
# business organizer screen, plans in profile, paired icon pills, wider nav
import re as _re8
UPI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
SRCH = I('search')

def pair(a, b):
    return f'<div class="pair g">{a}<i></i>{b}</div>'

# ---------- paired icon pill (allev + afisha) ----------
S["allev"] = S["allev"].replace(f'<div style="display:flex;gap:8px"><button class="rb g pr" data-tab="map">{MAPI}</button><button class="rb g pr" data-ov="filterSheet">{I("filter")}</button></div>',
  pair(f'<button class="pr" data-tab="map" aria-label="На карте">{MAPI}</button>', f'<button class="pr" data-ov="filterSheet" aria-label="Фильтры">{I("filter")}</button>'))
S["afisha"] = S["afisha"].replace(f'<div style="display:flex;gap:8px"><button class="rb g pr" data-tab="map" data-bizmap aria-label="На карте">{MAPI}</button><button class="rb g pr" data-ov="dateSheet" aria-label="Календарь">{I("cal")}</button></div>',
  pair(f'<button class="pr" data-tab="map" data-bizmap aria-label="На карте">{MAPI}</button>', f'<button class="pr" data-ov="dateSheet" aria-label="Календарь">{I("cal")}</button>'))
S["afisha"] = S["afisha"].replace('Все события для бизнеса в Тюмени', 'Кафе, бары и площадки <span class="cityIn">в Тюмени</span>')

# ---------- dates: real days, multi-select ----------
DAYS = [("Пт", "6"), ("Сб", "7"), ("Вс", "8"), ("Пн", "9"), ("Вт", "10"), ("Ср", "11"), ("Чт", "12")]
def dates_row(scope):
    return ('<div class="dates" data-days="%s"><button class="dp g pr on dall" data-dall><small>Все</small><b>дни</b></button>' % scope
            + "".join(f'<button class="dp g pr" data-day="{b}"><small>{"Сегодня" if i==0 else ("Завтра" if i==1 else a)}</small><b>{b}</b></button>' for i, (a, b) in enumerate(DAYS))
            + f'<button class="dp g pr" data-ov="dateSheet" aria-label="Календарь">{I("cal")}<b style="font-size:11px">Месяц</b></button></div>'
            + '<p class="dsum" id="dsum_%s">Все дни · можно выбрать несколько</p>' % scope)
S["allev"] = _re8.sub(r'<div class="dates">.*?</div>', dates_row('allev'), S["allev"], count=1, flags=_re8.S)
S["afisha"] = _re8.sub(r'<div class="dates">.*?</div>', dates_row('afisha'), S["afisha"], count=1, flags=_re8.S)

# ---------- event rows with creator + age, day, gender ----------
def evrow2(img, t, when, who, day, g, age, go="event", seats=""):
    return (f'<button class="li g pr evx" data-go="{go}" data-d="{day}" data-g="{g}" data-age="{age}"><i style="{P(img)}"></i>'
            f'<span class="x"><b>{t}</b><small>{when}{(" · "+seats) if seats else ""}</small><span class="wh">{who}</span></span></button>')
ROWS = (evrow2('running', 'Пробежка на рассвете', 'Сб, 08:00', 'Олег, 31', '7', 'm', 31, seats='3 из 10')
      + evrow2('cinema', 'Кино вечером', 'Сегодня, 21:00', 'Девушка, 25–30 · анонимно', '6', 'f', 27, 'anon_f', '1 из 2')
      + evrow2('coffee', 'Кофе и разговоры', 'Завтра, 19:00', 'Аня, 26', '7', 'f', 26, seats='2 из 4')
      + evrow2('bar', 'Бар‑квиз в пятницу', 'Сегодня, 20:00', 'Парень, 30–35 · анонимно', '6', 'm', 32, 'anon_m', '2 из 6')
      + evrow2('padel', 'Падел для новичков', 'Вс, 12:00', 'Макс, 29', '8', 'm', 29, seats='2 из 4')
      + evrow2('walk', 'Прогулка по набережной', 'Сб, 17:00', 'Даша, 27', '7', 'f', 27, seats='4 из 8'))
S["allev"] = _re8.sub(r'<div class="list">.*?</div></div>$', f'<div class="list evl" data-evl>{ROWS}</div>'
  '<div class="cempty g" data-empty hidden><canvas class="cr" data-v="e" width="150" height="150"></canvas><b>Ничего не нашли</b><span>Попробуй другие дни или сбрось фильтры</span><button class="btn d pr" data-go="create">Создать свою встречу</button></div></div>', S["allev"], count=1, flags=_re8.S)

# home cards: creator + age in the meta line
for a, b in [('Сб, 08:00 · Набережная', 'Сб, 08:00 · Олег, 31'), ('Сегодня, 21:00 · ищет парня', '21:00 · девушка 25–30'),
             ('Завтра, 19:00 · Центр', 'Завтра, 19:00 · Аня, 26'), ('Пт, 20:00 · ищет команду', '20:00 · парень 30–35')]:
    S["home"] = S["home"].replace(a, b, 1)

# ---------- filter sheet: who created + age ----------
EXTRA_OVS = EXTRA_OVS.replace('<span class="lbl">Когда</span><div class="hs" style="gap:6px;margin:0;padding:0"><button class="chip g pr on" data-af>Любое время</button><button class="chip g pr" data-af>Сегодня</button><button class="chip g pr" data-af>Выходные</button></div>',
  '<span class="lbl">Кто создал</span><div class="seg3 g" data-fg><button class="pr on" data-fgv="">Все</button><button class="pr" data-fgv="m">Парень</button><button class="pr" data-fgv="f">Девушка</button></div>'
  '<span class="lbl">Возраст · <b id="ageL">18–45</b></span><div class="arange"><span class="atr"><i id="ageFill"></i></span><input type="range" min="18" max="60" value="18" id="ageA"><input type="range" min="18" max="60" value="45" id="ageB"></div>')
EXTRA_OVS = EXTRA_OVS.replace('<button class="btn d pr" data-close style="margin-top:16px">Показать</button></div></div>',
  '<div class="row" style="margin-top:16px"><button class="btn l pr" data-freset>Сбросить</button><button class="btn d pr" data-close data-fapply>Показать</button></div></div></div>', 1)

# ---------- search ----------
SROWS = ROWS.replace('class="li g pr evx"', 'class="li g pr evx" data-k="Личные"') + \
  "".join(f'<button class="li g pr evx" data-k="Афиша" data-go="event" data-d="{d}"><i style="{P(img)}"></i><span class="x"><b>{t}</b><small>{m}</small><span class="wh">{v}</span></span></button>'
          for img, t, m, v, d in [('party', 'Вечеринка FORMA', 'Сегодня, 23:00 · бесплатно', 'FORMA lounge', '6'), ('dinner', 'Гастро‑вечер', 'Сб, 19:00 · 2000 ₽', 'Ресторан «Улица»', '7'),
                                  ('bar', 'Коктейльный мастер‑класс', 'Вс, 20:00 · 1500 ₽', 'Бар «Кислород»', '8')])
S["search"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><label class="sfield g">{SRCH}<input id="sq" placeholder="Встречи, места, интересы" autocomplete="off"><button class="sx pr" data-sx aria-label="Очистить" hidden>×</button></label></div>
<div class="seg3 g" style="margin-top:16px" data-sk><button class="pr on" data-skv="">Все</button><button class="pr" data-skv="Личные">Встречи</button><button class="pr" data-skv="Афиша">Афиша</button></div>
<div id="sHints"><span class="lbl">Часто ищут</span><div class="ints" style="margin-top:0">{chip('Кофе',attrs='data-sq="Кофе"')}{chip('Кино',attrs='data-sq="Кино"')}{chip('Бег',attrs='data-sq="Пробежка"')}{chip('Бары',ic='Бар',attrs='data-sq="Бар"')}{chip('Падел',attrs='data-sq="Падел"')}</div></div>
<span class="lbl" id="sCnt">Все встречи и события</span>
<div class="list evl" id="sList">{SROWS}</div>
<div class="cempty g" id="sEmpty" hidden><canvas class="cr" data-v="e" width="150" height="150"></canvas><b>Ничего не нашли</b><span>Создай встречу сам — люди с похожими интересами откликнутся</span><button class="btn d pr" data-go="create">Создать встречу</button></div></div>'''
S["home"] = S["home"].replace('data-toast="Поиск по встречам и людям"', 'data-go="search" aria-label="Поиск"', 1)

# ---------- city switch: empty states on home/map/afisha ----------
CE = lambda t, s, b='Создать первую встречу', go='create': f'<div class="cempty g" data-cityempty hidden><canvas class="cr" data-v="e" width="150" height="150"></canvas><b>{t}</b><span>{s}</span><button class="btn d pr" data-go="{go}">{b}</button></div>'
S["home"] = S["home"].replace('<div class="sec"><div><h3>Люди <em>в твоём городе</em></h3>', CE('В <span class="cityIn2">этом городе</span> пока нет встреч', 'Стань первым — создай встречу, и люди рядом её увидят') + '<div class="sec"><div><h3>Люди <em>в твоём городе</em></h3>', 1)
S["afisha"] = S["afisha"].replace('<div class="list">', CE('Заведения <span class="cityIn">в этом городе</span> пока не публиковали события', 'Как только появятся — покажем здесь и на карте', 'Посмотреть личные встречи', 'allev') + '<div class="list" data-afl>', 1)
S["map"] = S["map"].replace('<div class="mapcar" id="mapcar">', f'<div class="mapempty g" data-mapempty hidden><b>В <span class="cityIn2">этом городе</span> пока нет встреч</b><span>Создай первую — она появится на карте</span><button class="btn d pr" data-go="create">Создать</button></div><div class="mapcar" id="mapcar">', 1)

# ---------- boost to top ----------
TOPB = lambda where, ov: f'<button class="topb gd pr" data-ov="{ov}" data-topb><span class="ti">{UPI}</span><span class="x"><b>Поднять в топ</b><small>{where}</small></span><span class="tp">от 149 ₽</span></button>'
fix = [('Бег · личная встреча', 'Кофе · личная встреча'), ('<b>Сб, 08:00 <small>–09:30</small></b>', '<b>Завтра, 19:00 <small>–21:00</small></b>'), ('<b>3 из 10</b>', '<b>2 из 4</b>'),
       ('5 км в спокойном темпе вдоль Туры, потом кофе в «Кофемании». Новичкам — welcome, подождём всех.', 'Неспешный кофе и разговоры обо всём — путешествия, работа, книги. Без телефонов на столе 🙂'),
       ('Набережная Туры, у Моста влюблённых · 1,4 км', 'Кофемания · ул. Республики, 59 · 1,1 км'), ('<span>3 из 10</span>', '<span>2 из 4</span>')]
for a, b in fix: S["myevent"] = S["myevent"].replace(a, b)
S["myevent"] = _re8.sub(r'<button class="wp pr" data-go="person"><span style="[^"]*"></span>Аня</button>', '', S["myevent"], count=1)
S["myevent"] = S["myevent"].replace('data-toast="Свободно ещё 7 мест"><span class="free">+7</span>', 'data-toast="Свободно ещё 2 места"><span class="free">+2</span>')
S["myevent"] = S["myevent"].replace('<button class="orgc gd pr"', TOPB('На 24 часа первой в ленте', 'boostSheet') + '<button class="orgc gd pr"', 1)
S["myevent"] = _re8.sub(r'<button class="rb gw pr" data-ov="boostSheet">.*?</button>', '', S["myevent"], count=1, flags=_re8.S)

# business organizer screen
S["mybiz"] = S["myevent"]
for a, b in [('Кофе · личная встреча', 'Вечеринка · событие заведения'), ('Кофе и<br><em>разговоры</em>', 'Вечеринка<br><em>FORMA</em>'),
             ('<b>Завтра, 19:00 <small>–21:00</small></b>', '<b>Сегодня, 23:00 <small>–04:00</small></b>'), 
              ('На 24 часа первой в ленте', 'На 24 часа первой в афише'), ('data-ov="boostSheet" data-topb', 'data-ov="boostBiz" data-topb'),
             ('Неспешный кофе и разговоры обо всём — путешествия, работа, книги. Без телефонов на столе 🙂', 'Диджеи до утра, коктейльная карта и welcome‑шот. Вход по билету — номер появится у гостя после одобрения.'),
             ('Кофемания · ул. Республики, 59 · 1,1 км', 'FORMA lounge · ул. Республики, 14'), ('>Заявки · 2<', '>Вход гостей · 87 из 200<'), ('data-go="requests"', 'data-go="doorcheck"')]:
    S["mybiz"] = S["mybiz"].replace(a, b)
S["mybiz"] = _re8.sub(r"Мест</small><b>2 из 4</b>", "Гостей</small><b>200</b>", S["mybiz"]); S["mybiz"] = _re8.sub(r"Расходы</small><b>Каждый сам</b>", "Вход</small><b>1 500 ₽</b>", S["mybiz"])
S["mybiz"] = S["mybiz"].replace(P('coffee', '60% center'), P('party')).replace(P('coffee'), P('party'))
S["mybiz"] = _re8.sub(r'<button class="orgc gd pr".*?</button>', f'<button class="orgc gd pr" data-go="venue"><span class="a" style="{P("party")}"></span><span class="x"><b>FORMA lounge · организатор</b><small>Бизнес‑аккаунт · 4,8 ★</small></span>{I("chev") if False else ""}</button>', S["mybiz"], count=1, flags=_re8.S)
S["mybiz"] = _re8.sub(r'<div class="blk gd"><div class="bh2"><b class="bh">Кто идёт</b>.*?</div></div>', '<div class="blk gd"><div class="bh2"><b class="bh">Гости</b><span>200 билетов</span></div><p>Пришли 87 · ждём 113. Отмечать вход — в «Вход гостей».</p></div>', S["mybiz"], count=1, flags=_re8.S)
S["meet"] = S["meet"].replace("data-go=\"doorcheck\"><i style=\"" + P('party'), "data-go=\"mybiz\"><i style=\"" + P('party'), 1)
S["meet"] = S["meet"].replace('Вход гостей · 87 из 200', '87 из 200 пришли')

BOOST = lambda id_, t, where: f'''<div class="ov" id="{id_}"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Поднять <em>в топ</em></h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:8px 0 12px">{where}. Покажем, сколько людей посмотрели.</p>
<div class="bprev g"><i style="{P('party' if id_=='boostBiz' else 'coffee')}"><span class="chip gw tg">{UPI}В топе</span></i><span class="x"><b>{t}</b><small>Будет первой 24 часа</small></span></div>
<div class="bopts" data-bopt><button class="bo g pr on"><span class="x"><b>По тарифу</b><small>Старт · осталось 1 поднятие</small></span><span class="bp">0 ₽</span></button><button class="bo g pr"><span class="x"><b>Разово</b><small>24 часа наверху</small></span><span class="bp">149 ₽</span></button></div>
<button class="btn d pr" data-close data-boost="{id_}" style="margin-top:12px;width:100%">{UPI}Поднять</button></div></div>'''
EXTRA_OVS = _re8.sub(r'<div class="ov" id="boostSheet">.*?</div></div></div>', '', EXTRA_OVS, count=1, flags=_re8.S)
EXTRA_OVS += BOOST('boostSheet', 'Кофе и разговоры', 'Встреча будет первой в «Личных встречах» и на карте') + BOOST('boostBiz', 'Вечеринка FORMA', 'Событие будет первым в «Афише заведений» и на карте')

# ---------- plans: profile card + screen ----------
S["me"] = S["me"].replace('<span class="chip g" style="height:30px">Подписка Старт</span>', '') if 'Подписка Старт</span>' in S["me"] else S["me"]
S["me"] = _re8.sub(r'<span class="chip g"[^>]*>Подписка Старт</span>', '', S["me"])
S["me"] = S["me"].replace('<div class="acts">', f'''<button class="plan g pr" data-go="plans"><span class="pt"><small>Твой тариф</small><b>Старт <span>299 ₽/мес</span></b></span><span class="pu">
<span><i style="width:33%"></i></span><small>Встречи 1 из 3 · отклики 6 из 15 · топ 1</small></span><span class="pc">Сменить</span></button><div class="acts">''', 1)
PLANS = [("free", "Бесплатно", "0 ₽", ["4 отклика на чужие встречи", "Свои встречи — нет", "Без поднятий в топ"]),
         ("start", "Старт", "299 ₽/мес", ["3 своих встречи в месяц", "15 откликов", "Группа до 4 человек", "1 поднятие в топ"]),
         ("med", "Медиум", "599 ₽/мес", ["15 встреч", "30 откликов", "Группа до 10", "5 поднятий · выше в ленте"]),
         ("prem", "Премиум", "999 ₽/мес", ["Без лимитов на встречи и отклики", "Группа до 30", "10 поднятий · на самом верху"])]
S["plans"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Выбери <em>тариф</em></h1><p class="sub2">Сейчас — Старт до 6 декабря. Сменить можно в любой момент</p>
<div class="plist" data-plans>{"".join(f'<button class="pcard g pr{" on cur" if k=="start" else ""}" data-plan="{k}"><span class="ph"><b>{n}{"<i class=pbadge>Текущий</i>" if k=="start" else ""}</b><span>{p}</span></span><ul>{"".join(f"<li>{CHK}{x}</li>" for x in L)}</ul></button>' for k, n, p, L in PLANS)}</div>
<p class="sub2" style="text-align:center;margin-top:12px">Оплата картой или Telegram Stars · отмена в настройках</p>
<div style="height:96px"></div></div>
<div class="pcta"><button class="btn d pr" id="planGo" data-toast="Тариф уже подключён">Текущий тариф</button></div>'''
for k, l in [("search", "Поиск"), ("plans", "Тариф"), ("mybiz", "Событие заведения")]:
    if (k, l) not in FLOW2: FLOW2.insert(9, (k, l))

S["home"] = S["home"].replace('рядом свободны<br>сегодня вечером', 'рядом свободны сегодня вечером')

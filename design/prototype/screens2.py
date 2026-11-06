# Overrides for screens after feedback round 2. Executed inside gen_bb.py namespace.
APPLE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1-3.2-1 .1-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>'
MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5"/></svg>'
COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>'
CHEV = I('back').replace('M15 5l-7 7 7 7', 'M9 5l7 7-7 7')

def peek(text, top=420, side="r"):
    return (f'<div class="peek {side}" style="top:{top}px"><canvas class="cr" data-v="e" width="180" height="180"></canvas>'
            f'<div class="say g">{text}</div></div>')

S["auth"] = f'''<div class="pbg"></div><canvas class="cr" data-v="e" width="440" height="440" style="position:absolute;left:50%;top:110px;width:220px;height:220px;margin-left:-110px"></canvas>
<div class="authc g"><h1 class="h1">Войти в <em>Место</em></h1>
<p>Через Telegram быстрее всего: имя и фото подтянутся сами, а встречи из мини‑приложения сохранятся.</p>
<div style="display:grid;gap:10px"><button class="btn tg pr" data-go="reg1">{TG}Войти через Telegram</button>
<button class="btn d pr" data-go="reg1">{APPLE}Войти с Apple</button>
<button class="btn l pr" data-toast="Код придёт на почту">{MAIL}Войти по почте</button></div>
<p class="legal">В мини‑приложении Telegram вход происходит сам. Apple и почта — в приложении для iPhone и Android.</p></div>'''

S["reg1"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:150px">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div class="prog"><i class="on"></i><i></i><i></i></div></div>
<h1 class="h1" style="margin-top:20px">Почти готово, <em>Андрей</em></h1>
<p class="muted" style="font:400 15px/1.5 var(--disp);margin:8px 0 0">Имя и фото взяли из Telegram. Добавь ещё 1–2 фото — с ними чаще зовут на встречи.</p>
<div class="phgrid"><div class="phs" style="{F('Олег',110,147)}"><span class="tag gw">из Telegram</span></div>
<button class="phs g pr" data-addph>+</button><button class="phs g pr" data-addph>+</button></div>
<span class="lbl">Имя</span><label class="field g"><input id="f_name" value="Андрей"></label>
<span class="lbl">Дата рождения</span><label class="field g"><input id="f_bd" value="14.03.1994" inputmode="numeric"></label>
<span class="lbl">Пол</span><div class="seg"><button class="chip g pr on" data-seg>Мужчина</button><button class="chip g pr" data-seg>Женщина</button></div>
<span class="lbl">Город</span><button class="field g pr" data-ov="citySheet"><b id="cityName">Тюмень</b>{CHEV}</button>
<span class="lbl">Пару слов о себе <small style="font-weight:400;color:var(--ink3)">до 300 символов</small></span>
<label class="field g ta"><textarea id="f_bio" rows="3" maxlength="300" placeholder="Например: люблю кофе и утренние пробежки"></textarea></label>
<div class="cnt" id="bioCnt">0 / 300</div></div>
{peek("Добавь ещё фото — так чаще зовут на встречи 💜", 300)}
<div class="foot"><button class="btn d pr" data-go="reg2">Далее</button></div>'''

ints_html = "".join(f'<div class="igr"><span class="lbl" style="margin-left:2px">{t}</span><div class="ints">' + "".join(chip(n, attrs="data-int", ic=i) for n, i in it) + "</div></div>" for t, it in INT_GROUPS)
S["reg2"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:150px">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div class="prog"><i class="on"></i><i class="on"></i><i></i></div></div>
<h1 class="h1" style="margin-top:20px">Что тебе <em>по душе</em>?</h1>
<p class="muted" style="font:400 15px/1.5 var(--disp);margin:8px 0 0">Выбери хотя бы 3 — по ним подберём людей и встречи.</p>
{ints_html}</div>
<div class="foot"><div class="hint" id="intHint">Выбрано 0 из 3</div><button class="btn d pr" id="intNext" style="opacity:.4" data-go="reg3">Далее</button></div>'''

# home: dynamic count, filters for afisha / all meetings
S["home"] = S["home"].replace('<span class="t"><b>3 человека</b> рядом свободны<br>сегодня вечером</span>',
  '<span class="t"><b id="nearN">3 человека</b> рядом свободны<br>сегодня вечером</span>')
S["home"] = S["home"].replace('<div class="sec"><div><h3>Афиша <em>заведений</em></h3><p>События кафе, баров и площадок</p></div><button class="all g pr" data-go="venue">Все</button></div>',
  '<div class="sec"><div><h3>Афиша <em>заведений</em></h3><p>События кафе, баров и площадок</p></div><button class="all g pr" data-go="allev" data-biz>Все</button></div>'
  '<div class="hs fch" style="gap:6px;margin-top:10px"><button class="chip g pr on" data-af>Все</button><button class="chip g pr" data-af>Сегодня</button><button class="chip g pr" data-af>Выходные</button><button class="chip g pr" data-af>Бесплатно</button><button class="chip g pr" data-af>По билетам</button></div>')
S["home"] = S["home"].replace('<div class="sec"><div><h3>Личные <em>встречи</em></h3><p>Планы людей рядом — присоединяйся</p></div><button class="all g pr" data-go="meet">Все</button></div>',
  '<div class="sec"><div><h3>Личные <em>встречи</em></h3><p>Планы людей рядом — присоединяйся</p></div><button class="all g pr" data-go="allev">Все</button></div>')
S["home"] = S["home"].replace('<button class="inv g pr" data-toast="Бизнес‑кабинет: разместить событие">', '<button class="inv g pr" data-go="create" data-bizcreate>')

def evrow(img, t, m, go="event"): return f'<button class="li g pr" data-go="{go}"><i style="{P(img)}"></i><span class="x"><b>{t}</b><small>{m}</small></span></button>'
S["allev"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><button class="rb g pr" data-ov="filterSheet">{I('filter')}</button></div>
<h1 class="h1" style="margin-top:18px">Все <em>встречи</em></h1>
<div class="hs" style="gap:6px;margin-top:14px"><button class="chip g pr on" data-af>Все</button><button class="chip g pr" data-af>Личные</button><button class="chip g pr" data-af>Для бизнеса</button><button class="chip g pr" data-af>Сегодня</button><button class="chip g pr" data-af>Завтра</button><button class="chip g pr" data-af>Выходные</button></div>
<div class="hs" style="gap:6px;margin-top:8px">{chip('Кофе')}{chip('Кино')}{chip('Бег')}{chip('Бары',ic='Бар')}{chip('Падел')}{chip('Hyrox')}</div>
<div class="list">{evrow('running','Пробежка на рассвете','Сб, 08:00 · Набережная · 3 из 10')}{evrow('cinema','Кино вечером','Сегодня, 21:00 · Киномакс · 1 из 2 · анонимно')}{evrow('coffee','Кофе и разговоры','Завтра, 19:00 · Центр · 2 из 4')}{evrow('party','Вечеринка FORMA','6 нояб, 23:00 · бесплатно · 158 мест')}{evrow('padel','Падел для новичков','Вс, 12:00 · 2 из 4')}{evrow('dinner','Гастро‑вечер','15 нояб, 19:00 · 2000 ₽')}</div></div>'''

# event — full current structure
S["event"] = f'''<div class="evbg" style="{P('running')}"></div><div class="evph" style="{P('running','42% center')}"></div>
<div class="tbar"><button class="rb gw pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb gw pr" data-like>{HEART}</button><button class="rb gw pr" data-toast="Пожаловаться · Скопировать ссылку">{MORE}</button></div></div>
<div class="scroll"><div class="spacer"></div><div class="card">
<span class="chip gw" style="height:32px">{C('Бег')}Бег · личная встреча</span>
<h1 class="title">Пробежка<br><em>на рассвете</em></h1>
<div class="tiles"><div class="tile gd"><small>{I('cal')}Когда</small><b>Сб, 08:00 <small>–09:30</small></b></div><div class="tile gd"><small>{I('people')}Мест</small><b>3 из 10</b></div><div class="tile gd"><small>{I('spark')}Расходы</small><b>Каждый сам</b></div></div>
<button class="orgc gd pr" data-go="person"><span class="a" style="{F('Олег',46,46,140)}"></span><span class="x"><b>Олег, 31 · организатор</b><small>4,9 ★ · 23 встречи · подтверждён</small></span>{CHEV}</button>
<div class="blk gd"><b class="bh">О встрече</b><p>5 км в спокойном темпе вдоль Туры, потом кофе в «Кофемании». Новичкам — welcome, подождём всех.</p></div>
<div class="blk gd" style="padding:0;overflow:hidden"><div style="padding:14px 16px 10px"><b class="bh">Место</b><p style="margin:2px 0 0">Набережная Туры, у Моста влюблённых · 1,4 км</p></div>
<button class="mapbox pr" data-tab="map" style="display:block;width:100%;margin:0;border-radius:0;height:170px">{MAPSVG2}{pin('running','Сб 08:00',50,52)}</button></div>
<div class="blk gd"><div class="bh2"><b class="bh">Кто идёт</b><span>3 из 10</span></div>
<div class="who">{"".join(f'<button class="wp pr" data-go="person"><span style="{F(n,52,52,140)}"></span>{n}</button>' for n in ['Олег','Даша','Аня'])}<button class="wp pr" data-toast="Свободно ещё 7 мест"><span class="free">+7</span>свободно</button></div></div>
<button class="blk gd pr" data-go="chat" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left"><span class="rb gw" style="width:46px;height:46px">{I('chat')}</span><span style="flex:1"><b class="bh">Чат встречи</b><small style="display:block;font:400 12px var(--disp);opacity:.75">Откроется после одобрения заявки</small></span>{CHEV}</button>
<div style="height:120px"></div></div></div>
<div class="cta gd"><button class="rb gw pr" data-toast="Ссылка скопирована">{SHARE}</button><button class="btn pr" id="goBtn" style="background:#fff;color:var(--ink)">Я иду {CHECK}</button></div>'''

# deck — like the current app: full-screen profile, swipe sideways, up for more
S["deck"] = f'''<div class="dkwrap" id="dkwrap"></div>
<div class="tbar2"><button class="rb gw pr" data-back>{BACK}</button><button class="rb gw pr" data-ov="filterSheet">{I('filter')}</button></div>
<div class="dcta gd"><button class="rb gw pr" data-go="chat">{I('chat')}</button><button class="rb gw pr" id="dYes" aria-label="Сердечко">{HEART}</button><button class="rb gw pr" data-follow>{I('bell')}</button><button class="btn pr" data-go="create" style="background:#fff;color:var(--ink);flex:1;height:52px">{I('cal')}Позвать</button></div>
<div class="upk" aria-hidden="true">{I('back').replace('M15 5l-7 7 7 7','M5 15l7-7 7 7')}</div>'''

S["person"] = S["person"].replace(f'<button class="btn l pr" data-heart>{HEART}Сердечко</button>', f'<button class="rb g pr" data-heart aria-label="Сердечко">{HEART}</button><button class="rb g pr" data-go="chat">{I("chat")}</button>')

# map — like ours: light map, photo pins with label pill
mk2 = [("running", 30, 40, "Сб 08:00", "Пробежка на рассвете", "Сб, 08:00 · 3 из 10"), ("coffee", 58, 24, "Завтра", "Кофе и разговоры", "Завтра, 19:00 · 2 из 4"), ("cinema", 74, 48, "21:00", "Кино вечером", "Сегодня, 21:00 · анонимно"), ("party", 22, 62, "В топе", "Вечеринка FORMA", "6 нояб, 23:00 · бесплатно"), ("padel", 64, 68, "Вс 12:00", "Падел для новичков", "Вс, 12:00 · 2 из 4")]
S["map"] = f'''<div class="map" style="position:absolute;inset:0">{MAPSVG2}{"".join(pin(img, lab, x, y, i) for i, (img, x, y, lab, *_) in enumerate(mk2))}<span class="medot" style="left:46%;top:50%"></span></div>
<div class="top" style="position:absolute;top:58px;left:16px;right:16px;z-index:5"><button class="chip g pr" style="height:44px;border-radius:22px;padding:0 16px;flex:1" data-ov="filterSheet">{I('search')}Что ищем?</button><button class="rb g pr" data-toast="Ты здесь">{I('pin')}</button></div>
<div class="hs" style="position:absolute;top:112px;left:20px;right:0;margin:0;padding:0 20px 0 0;gap:6px;z-index:5"><button class="chip g pr on" data-af>Все</button><button class="chip g pr" data-af>Сегодня</button><button class="chip g pr" data-af>Личные</button><button class="chip g pr" data-af>Для бизнеса</button></div>
<div class="mapcar" id="mapcar">{"".join(f'<button class="mc g pr" data-go="event"><i style="{P(img)}"></i><span><b>{t}</b><small>{m}</small></span></button>' for (img,x,y,lab,t,m) in mk2)}</div>'''

# create — like current CreateMeetingFlow: step 0 + 4 steps
def opt3(k, img, t, d, on=False): return f'<button class="opt3 g pr{" on" if on else ""}" data-kind="{k}"><img src="a/stk_{img}.webp" alt=""><span><b>{t}</b><small>{d}</small></span></button>'
CATS8 = [("Кофе","Кофе"),("Завтрак","Завтрак"),("Ужин","Ужин"),("Кино","Кино"),("Прогулка","Прогулка"),("Вечеринка","Вечеринка"),("Тренировка","Зал"),("Настолки","Настолки")]
TRAIN = [("Бег","Бег"),("Зал","Зал"),("Йога","Йога"),("Велосипед","Вело"),("Падел","Падел"),("Hyrox","Hyrox"),("Футбол","Футбол"),("Плавание","Плавание")]
BIZ = [("Кафе и рестораны","Ужин"),("Бары","Бар"),("Вечеринки и клубы","Вечеринка"),("Концерты","Концерты"),("Театр и стендап","Театр"),("Мастер‑классы","Кулинария"),("Выставки","Выставки"),("Спорт","Hyrox")]
def wheel(items, sel, wid):
    return f'<div class="wheel g" id="{wid}"><div class="wsel"></div><div class="wl">' + "".join(f'<span{" class=on" if i==sel else ""}>{x}</span>' for i, x in enumerate(items)) + '</div></div>'
PLACES = [("Кофемания","ул. Республики, 14"),("Coffee Like","ул. Мельникайте, 72"),("Surf Coffee","ул. Ленина, 2а")]
STEP0 = ('Что <em>создаём</em>?', '<p class="sub2">Выбери формат — дальше всё подскажу по шагам.</p><div class="opts">'
  + opt3('open','privet','Открытая встреча','Кофе, спорт, кино, прогулка — все видят тебя и место встречи', True)
  + opt3('anon','shy','Анонимная встреча','Имя, фото и точный адрес увидят только те, чью заявку ты примешь')
  + opt3('biz','cool','Событие для бизнеса','Афиша для заведения или своего дела: концерт, квиз, мастер‑класс. Гостей до 500, можно билеты') + '</div>')
STEP1P = ('Что <em>планируем</em>?', '<p class="sub2">Выбери, во что будет встреча. Так её найдут люди с похожими интересами.</p><div class="cats" id="cats">'
  + "".join(f'<button class="cat g pr{" on" if n=="Кофе" else ""}" data-ct="{n}">{C(i)}{n}</button>' for n, i in CATS8) + '</div>'
  + '<div id="trainBox" hidden><span class="lbl">Какая тренировка?</span><div class="cats">' + "".join(f'<button class="cat g pr" data-tt>{C(i)}{n}</button>' for n, i in TRAIN) + '</div></div>'
  + f'<button class="own g pr" data-own><b>Своё предложение</b><small>Не нашёл подходящего? Придумай сам — от сапов до вязания</small></button>'
  + '<label class="field g" id="ownIn" hidden style="margin-top:8px"><input placeholder="Например: сапы, вязание, бадминтон" maxlength="30"></label>')
STEP1B = ('Куда <em>зовёшь</em>?', '<p class="sub2">Выбери раздел — в нём гости найдут событие в «Для бизнеса». Название напишешь на следующем шаге.</p><div class="cats">'
  + "".join(f'<button class="cat g pr{" on" if i==1 else ""}" data-ct="{n}">{C(ic)}{n}</button>' for i, (n, ic) in enumerate(BIZ)) + '</div>')
STEP2 = ('Название <em>и обложка</em>', '<p class="sub2">Короткое название и картинка решают, придут ли люди.</p><span class="lbl">Название</span><label class="field g"><input id="cTitle" value="Кофе и разговоры" maxlength="100"></label>'
  + '<span class="lbl">Описание</span><label class="field g ta"><textarea rows="3" maxlength="500" placeholder="Что будем делать, как узнать друг друга">Обсудим книги, кино и планы на выходные. Можно прийти одному.</textarea></label>'
  + '<span class="lbl">Обложка · фирменная или своё фото</span><div class="bgg" id="bgs">' + "".join(f'<button class="pr{" on" if i==0 else ""}" data-bg="{b}" style="{P(b)}"></button>' for i, b in enumerate(["coffee","breakfast","dinner","bar","walk","cinema"])) + '</div>'
  + '<button class="btn l pr" style="margin-top:10px" data-toast="Фото сохраняется вертикально 3:4 — откроется редактор">Загрузить своё фото</button>')
STEP3 = ('Когда <em>и где</em>?', '<p class="sub2">Покрути день и время, как будильник на айфоне, или открой календарь.</p><div class="wheels">'
  + wheel(["Сегодня","Завтра","Сб, 7 нояб","Вс, 8 нояб","Пн, 9 нояб","Вт, 10 нояб"], 1, "wD") + wheel(["17","18","19","20","21","22"], 2, "wH") + wheel(["00","15","30","45"], 0, "wM") + '</div>'
  + f'<button class="chip g pr" data-toast="Календарь на месяц" style="margin-top:8px">{I("cal")}Календарь</button>'
  + '<span class="lbl">Сколько продлится</span><div class="hs" style="gap:6px;margin:0;padding:0">' + "".join(f'<button class="chip g pr{" on" if d=="2 ч" else ""}" data-dur>{d}</button>' for d in ["1 ч","1,5 ч","2 ч","3 ч","Свободно"]) + '</div>'
  + f'<span class="lbl">Место</span><label class="field g">{I("search")}<input id="placeIn" placeholder="Название места или адрес" autocomplete="off"></label>'
  + '<div class="sugg g" id="sugg" hidden>' + "".join(f'<button class="pr" data-place="{n}|{a}"><b>{n}</b><span>{a}</span></button>' for n, a in PLACES) + '</div>'
  + f'<div class="mapbox g" style="height:200px;margin-top:10px">{MAPSVG2}<span class="cpin">{I("pin")}</span></div>'
  + f'<div class="addr g"><span><b id="addrN">Отметь точку на карте</b><small id="addrA">или выбери из подсказок</small></span><button class="rb g pr" data-copy aria-label="Скопировать адрес">{COPY}</button></div>')
STEP4 = ('Кто <em>и сколько</em>?', '<p class="sub2">Все приходят по заявке — ты сам решаешь, кого принять.</p><span class="lbl">Сколько человек ищешь</span>'
  + '<div class="bigst g"><button class="rb g pr" data-st="-1">–</button><b id="seats">3</b><button class="rb g pr" data-st="1">+</button></div><p class="sub2" id="seatsSub" style="margin-top:6px;text-align:center">Не считая тебя · на встрече будет 4 чел.</p>'
  + '<button class="plan g pr" data-ov="subSheet"><span><b>Подписка Старт · группа до 4</b><small>Медиум — до 10, Премиум — до 30 человек</small></span><span class="chip g" style="height:30px;font-size:12px">Тарифы</span></button>'
  + '<span class="lbl" id="costLbl">Как насчёт расходов?</span><div class="hs" style="gap:6px;margin:0;padding:0" id="costP">' + "".join(f'<button class="chip g pr{" on" if i==0 else ""}" data-cost>{t}</button>' for i, t in enumerate(["Каждый за себя","Автор угощает","Без расходов","По договорённости"])) + '</div>'
  + '<div class="hs" style="gap:6px;margin:0;padding:0" id="costB" hidden>' + "".join(f'<button class="chip g pr{" on" if i==0 else ""}" data-cost>{t}</button>' for i, t in enumerate(["Билет","Бесплатно","Другие условия"])) + '</div>'
  + '<div id="pubBox"><span class="lbl">Как публикуем?</span><div class="opts"><button class="opt g pr on" data-opt="anon"><b>Открыто</b><small>Все видят твой профиль и место встречи</small></button><button class="opt g pr" data-opt="anon"><b>Анонимно</b><small>Имя, фото и точный адрес увидят только те, чью заявку ты одобришь</small></button></div></div>'
  + f'<span class="lbl">Так увидят другие</span><div class="prev" id="prevCard" style="{P("coffee")};height:300px"><span class="chip gw" style="top:14px;left:14px;height:30px;font-size:12px">0 из 3 · кофе</span>'
  + '<span style="left:18px;right:18px;bottom:18px"><span style="display:block;font:300 30px/1.05 var(--disp);letter-spacing:-.03em" id="prevTitle">Кофе и <em>разговоры</em></span><span style="display:block;font:400 13px var(--disp);opacity:.85;margin-top:6px" id="prevMeta">Завтра, 19:00 · Кофемания · Каждый за себя</span></span></div>'
  + '<p class="sub2" style="margin-top:8px" id="mapNote">На карте — твоё фото на метке</p>')
def wst(key, t, b, hidden=True): return f'<div class="wst" data-w="{key}"{" hidden" if hidden else ""}><h1 class="h1">{t}</h1>{b}</div>'
S["create"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:140px" id="cScroll">
<div class="top"><button class="rb g pr" id="cBack">{I('x')}</button><div class="wprog" id="wprog"><i></i><i></i><i></i><i></i></div></div>
{wst("s0",*STEP0,hidden=False)}{wst("s1p",*STEP1P)}{wst("s1b",*STEP1B)}{wst("s2",*STEP2)}{wst("s3",*STEP3)}{wst("s4",*STEP4)}</div>
<div class="foot"><button class="btn d pr" id="cNext">Далее</button></div>'''
S.pop("preview", None)

S["done"] = f'''<div class="pbg"></div><div class="done"><canvas class="cr cv" data-v="e" width="440" height="440"></canvas>
<div class="tx"><h1 class="h1">Встреча <em>опубликована</em></h1><p class="muted" style="font:400 15px/1.5 var(--disp);margin:10px 0 0">Подписчики и люди рядом увидят её первыми. Заявки придут в «Мои встречи».</p></div></div>
<div class="foot" style="background:none"><button class="btn d pr" data-ov="shareSheet">{SHARE}Поделиться</button><div class="row"><button class="btn l pr" data-ov="boostSheet">{I('spark')}В популярное</button><button class="btn l pr" data-tab="meet">Мои встречи</button></div></div>'''

FLOW2 = [("intro","Вводные слайды"),("auth","Вход"),("reg1","Анкета"),("reg2","Интересы"),("reg3","Город"),("home","Главная"),("allev","Все встречи"),("event","Событие"),("deck","Листать людей"),("person","Профиль человека"),("venue","Заведение"),("map","Карта"),("meet","Мои встречи"),("chats","Чаты"),("chat","Чат"),("notif","Уведомления"),("create","Новая встреча"),("me","Мой профиль")]

EXTRA_OVS = f'''<div class="ov" id="subSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Подписка</h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:6px 0 12px">Без подписки — 4 отклика на чужие встречи.</p>
<div class="plans">{"".join(f'<button class="planc g pr{" on" if n=="Старт" else ""}"><span class="pn"><b>{n}</b><span>{p} ₽/мес</span></span><small>{a}</small></button>' for n,p,a in [("Старт",299,"3 своих встречи · 15 откликов · группа до 4 · 1 подъём в топ"),("Медиум",599,"15 встреч · 30 откликов · группа до 10 · 5 подъёмов · выше в ленте"),("Премиум",999,"Без лимитов · группа до 30 · 10 подъёмов · на самом верху")])}</div>
<button class="btn d pr" data-close data-toast="Оплата через Telegram Stars или картой" style="margin-top:12px">Оформить</button></div></div>
<div class="ov" id="boostSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">В популярное <em>сегодня</em></h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:8px 0 14px">Встреча будет первой в ленте и на карте. Сколько ещё первым и сколько посмотрели — покажем после.</p>
<div style="display:grid;gap:10px"><button class="btn d pr" data-close data-toast="Ты в популярном">По тарифу · осталось 1</button><button class="btn l pr" data-close data-toast="Оплата 149 ₽">Разово — 149 ₽</button></div></div></div>
<div class="ov" id="shareSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Поделиться</h2>
<div class="shr">{"".join(f'<button class="pr" data-close data-toast="{t}"><span class="g">{l}</span>{t}</button>' for l,t in [("TG","Чат Telegram"),("ST","Сторис Telegram"),("IG","Сторис Instagram"),("WA","WhatsApp"),("VK","ВКонтакте"),("🔗","Скопировать ссылку")])}</div></div></div>
<div class="ov" id="filterSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Фильтры</h2>
<span class="lbl">Когда</span><div class="hs" style="gap:6px;margin:0;padding:0"><button class="chip g pr on" data-af>Любое время</button><button class="chip g pr" data-af>Сегодня</button><button class="chip g pr" data-af>Выходные</button></div>
<span class="lbl">Время</span><div class="hs" style="gap:6px;margin:0;padding:0"><button class="chip g pr" data-tog>Утро</button><button class="chip g pr" data-tog>День</button><button class="chip g pr on" data-tog>Вечер</button></div>
<span class="lbl">Направление</span><div class="ints" style="margin-top:0">{chip('Кофе',attrs='data-tog')}{chip('Бег',attrs='data-tog')}{chip('Кино',attrs='data-tog')}{chip('Бары',ic='Бар',attrs='data-tog')}{chip('Hyrox',attrs='data-tog')}</div>
<span class="lbl">Расстояние · до 5 км</span><input type="range" min="1" max="30" value="5" style="width:100%">
<button class="btn d pr" data-close style="margin-top:16px">Показать</button></div></div>'''

# Round 10: edit own meeting / business event; full afisha by day and category
import re as _r10
CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
def frow(lbl, val, attrs='data-toast="Откроется выбор"'):
    return f'<button class="frow g pr" {attrs}><span class="fl">{lbl}</span><span class="fv">{val}</span>{CHEV}</button>'
def fstep(lbl, v, mn, mx, step=1):
    return f'<div class="frow g fst"><span class="fl">{lbl}</span><span class="stp" data-stp data-min="{mn}" data-max="{mx}" data-step="{step}"><button class="pr" data-sd="-1" aria-label="Меньше">−</button><b>{v}</b><button class="pr" data-sd="1" aria-label="Больше">+</button></span></div>'
def ftog(lbl, sub, on):
    return f'<button class="tg2 g pr" data-sw><span class="tgt"><b>{lbl}</b><small>{sub}</small></span><span class="sw2{" on" if on else ""}"></span></button>'
def edit_screen(kind):
    biz = kind == "biz"
    img = 'party' if biz else 'coffee'
    title = 'Вечеринка FORMA' if biz else 'Кофе и разговоры'
    desc = ('Диджеи до утра, коктейльная карта и welcome‑шот. Вход по билету — номер появится у гостя после одобрения.' if biz
            else 'Неспешный кофе и разговоры обо всём — путешествия, работа, книги. Без телефонов на столе 🙂')
    rows = (frow('Раздел афиши' if biz else 'Направление', 'Вечеринки' if biz else 'Кофе')
            + frow('Когда', 'Сегодня, 23:00 – 04:00' if biz else 'Завтра, 19:00 – 21:00', 'data-ov="daysSheet"')
            + frow('Место', 'FORMA lounge' if biz else 'Кофемания')
            + (fstep('Гостей', 200, 10, 500, 10) + frow('Билет', '1 500 ₽ · на входе') if biz else fstep('Мест', 4, 2, 4) + frow('Расходы', 'Каждый сам')))
    togs = (ftog('Принимать заявки', 'Билет придёт гостю после одобрения', True) + ftog('Показывать в афише', 'И на карте города', True) if biz
            else ftog('Одобрять заявки вручную', 'Сам решаешь, кто идёт', True) + ftog('Анонимно', 'Имя и фото откроются после одобрения', False) + ftog('Чат встречи', 'Для участников', True))
    note = 'Гости с билетами получат уведомление об изменениях' if biz else 'Участники получат уведомление об изменениях'
    return f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><button class="chip g pr" data-toast="Предпросмотр" style="height:44px;padding:0 16px">Предпросмотр</button></div>
<h1 class="h1" style="margin-top:18px">Редактировать</h1><p class="sub2">{note}</p>
<div class="ecov" style="{P(img)}"><button class="chip gw pr" data-toast="Выбери фото из галереи">{I('cal') if False else ''}Сменить обложку</button></div>
<label class="ftit g"><span class="fl">Название</span><input value="{title}" maxlength="40"></label>
<div class="fgrp">{rows}</div>
<label class="fdesc g"><span class="fl">Описание</span><textarea rows="3" maxlength="300">{desc}</textarea></label>
<span class="lbl">Настройки</span><div class="fgrp">{togs}</div>
<button class="btn l pr" style="margin-top:14px;width:100%;color:#C2335A" data-ov="cancelEv">{'Отменить событие' if biz else 'Отменить встречу'}</button>
<div style="height:96px"></div></div>
<div class="pcta"><button class="btn d pr" data-back data-toast="Изменения сохранены">Сохранить изменения</button></div>'''
S["editev"] = edit_screen("ev"); S["editbiz"] = edit_screen("biz")
for k in ("myevent", "mybiz"):
    S[k] = S[k].replace('data-go="create" data-edit', f'data-go="{"editbiz" if k=="mybiz" else "editev"}"')
EXTRA_OVS += '''<div class="ov" id="cancelEv"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Отменить <em>встречу</em>?</h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:8px 0 14px">Всем участникам придёт уведомление, чат закроется.</p>
<div style="display:grid;gap:10px"><button class="btn d pr" data-close data-toast="Встреча отменена" style="background:#C2335A">Отменить встречу</button><button class="btn l pr" data-close>Оставить</button></div></div></div>'''

# ---------- afisha: categories row + list grouped by day ----------
AFC = [("Все", None), ("Бары", "Бар"), ("Вечеринки", "Вечеринка"), ("Рестораны", "Ужин"), ("Концерты", "Концерты"), ("Стендап и театр", "Театр"),
       ("Квизы", "Квизы"), ("Караоке", "Караоке"), ("Кино", "Кино"), ("Мастер‑классы", "Кулинария"), ("Завтраки", "Завтрак"), ("Выставки", "Выставки"),
       ("Спорт", "Hyrox"), ("Нетворкинг", "Нетворкинг"), ("Танцы", "Танцы")]
EV = [("6", "party", "Вечеринка FORMA", "23:00", "Бесплатно", "FORMA lounge", "Вечеринки|Бары"),
      ("6", "bar", "Квиз «Мозгобойня»", "19:30", "400 ₽", "Бар «Кислород»", "Квизы|Бары"),
      ("6", "party", "Караоке‑ночь", "22:00", "Свободно", "Караоке‑бар «Голос»", "Караоке|Бары"),
      ("7", "dinner", "Гастро‑вечер от шефа", "19:00", "2000 ₽", "Ресторан «Улица»", "Рестораны"),
      ("7", "breakfast", "Бранч с диджеем", "12:00", "900 ₽", "Кафе «Утро»", "Завтраки"),
      ("7", "bar", "Джаз в баре", "21:00", "800 ₽", "Бар «Крыша»", "Концерты|Бары"),
      ("8", "bar", "Коктейльный мастер‑класс", "20:00", "1500 ₽", "Бар «Кислород»", "Мастер‑классы|Бары"),
      ("8", "cinema", "Кино в лаунже", "19:00", "300 ₽", "FORMA lounge", "Кино"),
      ("10", "cinema", "Стендап: открытый микрофон", "20:00", "500 ₽", "Клуб «Подвал»", "Стендап и театр"),
      ("12", "coffee", "Нетворкинг предпринимателей", "19:00", "Бесплатно", "Коворкинг «Точка»", "Нетворкинг"),
      ("12", "running", "Hyrox‑тренировка", "10:00", "600 ₽", "Зал «72»", "Спорт")]
DH = {"6": "Сегодня, 6 ноября", "7": "Завтра, суббота 7", "8": "Воскресенье, 8", "10": "Вторник, 10", "12": "Четверг, 12"}
def afr2(d, img, t, tm, price, venue, cat):
    return (f'<button class="afr g pr" data-go="event" data-d="{d}" data-cat="{cat}"><i style="{P(img)}"><span class="chip gw">{price}</span></i>'
            f'<span class="x"><b>{t}</b><small>{tm} · {cat.split('|')[0]}</small><small class="vn">{venue}</small></span></button>')
groups = ""
for d in ["6", "7", "8", "10", "12"]:
    groups += f'<div class="dgrp" data-dg="{d}"><h4 class="dayh">{DH[d]}</h4>' + "".join(afr2(*e) for e in EV if e[0] == d) + '</div>'
S["afisha"] = _r10.sub(r'<button class="catsel g pr" data-catopen>.*?</div>(?=<div class="cempty)', '', S["afisha"], count=1, flags=_r10.S)
S["afisha"] = _r10.sub(r'<div class="list" data-afl>.*?</div></div>$',
  f'<div class="list afl" data-afl>{groups}</div><div class="cempty g" data-afempty hidden><canvas class="cr" data-v="e" width="150" height="150"></canvas><b>В эти дни ничего нет</b><span>Выбери другой день или раздел</span><button class="btn l pr" data-afreset>Показать все события</button></div></div>',
  S["afisha"], count=1, flags=_r10.S)
S["afisha"] = S["afisha"].replace('<div class="qd" data-qd="afisha">',
  '<div class="hs afcs" data-afcs>' + "".join(f'<button class="chip g pr{" on" if n=="Все" else ""}" data-afcv="{n}">{C(i) if i else ""}{n}</button>' for n, i in AFC) + '</div><div class="qd" data-qd="afisha">', 1)
# order: categories first, then dates
for k, l in [("editev", "Редактировать встречу"), ("editbiz", "Редактировать событие")]:
    if (k, l) not in FLOW2: FLOW2.insert(9, (k, l))
S["afisha"] = _r10.sub(r'<button class="catsel g pr" data-catopen>.*?</button>\s*<div class="catgrid" id="afCats" hidden>.*?</div>', '', S["afisha"], count=1, flags=_r10.S)
S["afisha"] = S["afisha"].replace(f'<button class="pr" data-ov="dateSheet" aria-label="Календарь">{I("cal")}</button>', f'<button class="pr" data-go="search" aria-label="Поиск">{I("search")}</button>', 1)

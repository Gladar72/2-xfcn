# Round 3 overrides (executed after screens2.py inside gen_bb.py)
import re as _re
CHK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
MAPI = I('map')
DOWN = I('back').replace('M15 5l-7 7 7 7', 'M6 9l6 6 6-6')

def peek2(text, cls="", top=None, bottom=None):
    pos = f"top:{top}px" if top is not None else f"bottom:{bottom}px"
    return f'<button class="peek pk2 {cls}" style="{pos}" data-peek><canvas class="cr" data-v="e" width="180" height="180"></canvas><span class="say g">{text}</span></button>'

# ---- interests: accordion sections with icon tiles; AI pre-pick from bio
AI_PICK = {"Бег", "Кофе"}
def igroup(title, items, open_=False):
    tiles = "".join(f'<button class="itile g pr{" on" if n in AI_PICK else ""}" data-int><span class="ck">{CHK}</span>{C(i)}<span class="nm">{n}</span></button>' for n, i in items)
    k = sum(1 for n, _ in items if n in AI_PICK)
    return (f'<div class="acc{" open" if open_ else ""}"><button class="acch pr" data-acc><b>{title}</b><span class="k">{k or ""}</span><span class="cv2">{DOWN}</span></button>'
            f'<div class="accb"><div class="igrid">{tiles}</div></div></div>')
GROUPS3 = [("Спорт", INT_GROUPS[0][1][:12]), ("Отдых и природа", INT_GROUPS[0][1][12:] + [("Путешествия","Путешествия"),("Экскурсии","Прогулка")]),
           ("Увлечения и культура", INT_GROUPS[1][1][2:]), ("Еда и общение", INT_GROUPS[2][1])]
S["reg2"] = f'''<div class="pbg"></div><div class="scroll" style="padding-bottom:150px">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div class="prog"><i class="on"></i><i class="on"></i><i></i></div></div>
<h1 class="h1" style="margin-top:20px">Что тебе <em>по душе</em>?</h1>
<p class="muted" style="font:400 15px/1.5 var(--disp);margin:8px 0 0">Выбери хотя бы три. По ним подберём встречи и людей с похожими интересами.</p>
<div class="aib g"><span class="sp2">{I('spark')}</span><span><b>Подобрали по «о себе»</b><small>Бег и кофе — уже отмечены. Можно снять.</small></span></div>
{"".join(igroup(t, it, i == 0) for i, (t, it) in enumerate(GROUPS3))}</div>
<div class="foot"><div class="hint" id="intHint">Выбрано 2 из 3</div><button class="btn d pr" id="intNext" style="opacity:.4" data-go="reg3">Продолжить</button></div>'''

# ---- home: hint peek, afisha filter = date + sections, map icon
BIZ_SECS = [("Кафе и рестораны","Ужин"),("Бары","Бар"),("Вечеринки","Вечеринка"),("Концерты","Концерты"),("Театр и стендап","Театр"),("Мастер‑классы","Кулинария"),("Выставки","Выставки")]
S["home"] = _re.sub(r'<div class="hs fch".*?</div>', '<div class="hs fch" style="gap:6px;margin-top:10px">'
   f'<button class="chip g pr on" data-ov="dateSheet">{I("cal")}Сегодня{DOWN}</button>'
   + "".join(f'<button class="chip g pr" data-af>{C(i)}{n}</button>' for n, i in BIZ_SECS) + '</div>', S["home"], count=1, flags=_re.S)
S["home"] = S["home"].replace('<button class="all g pr" data-go="allev" data-biz>Все</button>',
   f'<span style="display:flex;gap:6px"><button class="rb g pr" style="width:32px;height:32px" data-tab="map" data-bizmap aria-label="На карте">{MAPI}</button><button class="all g pr" data-go="allev" data-biz>Все</button></span>')


# ---- all events: tidy filter (segment + date + sections + map)
S["allev"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb g pr" data-tab="map">{MAPI}</button><button class="rb g pr" data-ov="filterSheet">{I('filter')}</button></div></div>
<h1 class="h1" style="margin-top:18px">Все <em>встречи</em></h1>
<div class="seg2 g" style="margin-top:14px"><button class="pr on" data-af>Личные</button><button class="pr" data-af>Для бизнеса</button></div>
<div class="dates">{"".join(f'<button class="dp g pr{" on" if i==0 else ""}" data-af><small>{a}</small><b>{b}</b></button>' for i,(a,b) in enumerate([("Сегодня","5"),("Пт","6"),("Сб","7"),("Вс","8"),("Пн","9"),("Вт","10"),("Ср","11")]))}</div>
<div class="hs" style="gap:6px;margin-top:8px">{chip('Кофе')}{chip('Кино')}{chip('Бег')}{chip('Бары',ic='Бар')}{chip('Падел')}{chip('Hyrox')}</div>
<div class="list">{evrow('running','Пробежка на рассвете','Сб, 08:00 · Набережная · 3 из 10')}{evrow('cinema','Кино вечером','Сегодня, 21:00 · Киномакс · анонимно')}{evrow('coffee','Кофе и разговоры','Завтра, 19:00 · Центр · 2 из 4')}{evrow('padel','Падел для новичков','Вс, 12:00 · 2 из 4')}{evrow('walk','Прогулка по набережной','Сб, 17:00 · 4 из 8')}</div></div>'''

# ---- event: chat as icon tile next to когда/мест/расходы; no empty space
S["event"] = S["event"].replace('<div class="tiles"><div class="tile gd">', '<div class="tiles t4"><div class="tile gd">')
S["event"] = S["event"].replace('<small>{I(\'spark\')}Расходы</small><b>Каждый сам</b></div></div>'.replace("{I('spark')}", I('spark')),
   I('spark').join(['<small>', 'Расходы</small><b>Каждый сам</b></div>']) + f'<button class="tile gd pr tchat" data-go="chat" aria-label="Чат встречи">{I("chat")}<small>Чат</small></button></div>')
S["event"] = _re.sub(r'<button class="blk gd pr" data-go="chat".*?</button>\s*<div style="height:120px"></div>', '<div style="height:96px"></div>', S["event"], count=1, flags=_re.S)

# ---- deck: no chat before mutual like
S["deck"] = S["deck"].replace(f'<button class="rb gw pr" data-go="chat">{I("chat")}</button>', '')
S["person"] = S["person"].replace(f'<button class="rb g pr" data-go="chat">{I("chat")}</button>', '')

# ---- chat: read ticks
T1 = '<i class="tk s">✓</i>'; T2 = '<i class="tk d">✓✓</i>'; T3 = '<i class="tk r">✓✓</i>'
S["chat"] = S["chat"].replace('<div class="m out">Да, каждую субботу! Присоединяйся<small>18:04</small></div>', f'<div class="m out">Да, каждую субботу! Присоединяйся<small>18:04 {T3}</small></div>')

# ---- meetings: tidy rows
S["meet"] = S["meet"].replace("'2 новые заявки','own'", "'2 новые заявки','own'")

# ---- create: animated stickers, own + plus, Well-like dates, recommended places, settings, no repeated publish question
cr = S["create"]
cr = cr.replace('<button class="own g pr" data-own><b>Своё предложение</b>', f'<button class="own g pr" data-own><span class="op">{PLUS}</span><span><b>Своё предложение</b>')
cr = cr.replace('<small>Не нашёл подходящего? Придумай сам — от сапов до вязания</small></button>', '<small>Не нашёл подходящего? Придумай сам — от сапов до вязания</small></span></button>')
# step 3 replace wheels by compact date pills + time chips + recommended places
cr = _re.sub(r'<p class="sub2">Покрути день и время.*?<span class="lbl">Место</span>',
  '<p class="sub2">Выбери день и время — дальше место.</p><div class="dates">' + "".join(f'<button class="dp g pr{" on" if i==1 else ""}" data-dp><small>{a}</small><b>{b}</b></button>' for i,(a,b) in enumerate([("Сегодня","5"),("Пт","6"),("Сб","7"),("Вс","8"),("Пн","9"),("Вт","10"),("Ср","11")]))
  + f'<button class="dp g pr" data-ov="dateSheet">{I("cal")}<b style="font-size:11px">Ещё</b></button></div>'
  + '<span class="lbl">Начало</span><div class="hs" style="gap:6px;margin-top:0">' + "".join(f'<button class="chip g pr{" on" if t=="19:00" else ""}" data-tm>{t}</button>' for t in ["17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"]) + '</div>'
  + '<span class="lbl">Сколько продлится</span><div class="hs" style="gap:6px;margin-top:0">' + "".join(f'<button class="chip g pr{" on" if d=="2 ч" else ""}" data-dur>{d}</button>' for d in ["1 ч","1,5 ч","2 ч","3 ч","Свободно"]) + '</div>'
  + '<span class="lbl">Место</span><div class="recp">' + "".join(f'<button class="rp g pr" data-place="{n}|{a}"><i style="{P(img)}"></i><span><b>{n}</b><small>{a} · {d}</small></span></button>' for n,a,d,img in [("Кофемания","ул. Республики, 14","600 м","coffee"),("Surf Coffee","ул. Ленина, 2а","1,1 км","breakfast"),("Coffee Like","ул. Мельникайте, 72","1,8 км","bar")]) + '</div><small class="rpn">Рекомендуем места рядом · или найди своё</small>',
  cr, count=1, flags=_re.S)
cr = cr.replace('<label class="field g">' + I("search") + '<input id="placeIn"', '<label class="field g" style="margin-top:8px">' + I("search") + '<input id="placeIn"')
# step 4: drop repeated publish question, cost scrollable, settings
cr = _re.sub(r'<div id="pubBox">.*?</div></div>', '<div id="pubBox"></div>', cr, count=1, flags=_re.S)
cr = cr.replace('<div class="hs" style="gap:6px;margin:0;padding:0" id="costP">', '<div class="hs" style="gap:6px;margin-top:0" id="costP">')
cr = cr.replace('<div class="hs" style="gap:6px;margin:0;padding:0" id="costB" hidden>', '<div class="hs" style="gap:6px;margin-top:0" id="costB" hidden>')
cr = cr.replace('<span class="lbl">Так увидят другие</span>', '<span class="lbl">Настройки встречи</span>'
  '<button class="tg2 g pr" data-sw><span>Чат встречи для участников</span><span class="sw2 on"></span></button>'
  '<button class="tg2 g pr" data-sw><span>Показать подписчикам первыми</span><span class="sw2 on"></span></button>'
  '<button class="tg2 g pr" data-sw><span>Напомнить участникам за 2 часа</span><span class="sw2 on"></span></button>'
  '<span class="lbl">Так увидят другие</span>')

S["create"] = cr

# ---- match: only invite
OVS_PATCH = [('<div class="bt"><button class="btn d pr" data-close data-go="create">Позвать на встречу</button><button class="btn l pr" data-close data-go="chat">Написать</button></div>',
              '<div class="bt"><button class="btn d pr" data-close data-go="create">Позвать на встречу</button><p class="mnote">Переписка откроется, когда человек примет приглашение</p></div>')]

# ---- date sheet
EXTRA_OVS += f'''<div class="ov" id="dateSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Выбери <em>дату</em></h2>
<div class="cal">{"".join(f'<span class="w">{d}</span>' for d in ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"])}{"<span></span>"*6}{"".join(f'<button class="pr{" on" if d==6 else ""}{" past" if d<5 else ""}" data-cd>{d}</button>' for d in range(1,31))}</div>
<button class="btn d pr" data-close style="margin-top:14px">Готово</button></div></div>'''

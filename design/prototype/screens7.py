# Round 7: tickets (guest + door check) and removing a participant
TKT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3.5 8.5a2 2 0 0 0 0 4v4h17v-4a2 2 0 0 1 0-4v-4h-17z"/><path d="M14 4.5v12" stroke-dasharray="2 2"/></svg>'
S["ticket"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><button class="rb g pr" data-toast="Билет сохранён в галерею">{SHARE}</button></div>
<h1 class="h1" style="margin-top:18px">Мой <em>билет</em></h1>
<div class="tkt"><div class="tph" style="{P('party')}"><span class="chip gw">{C('Вечеринка')}Вечеринка</span></div>
<div class="tb"><b class="tt2">Вечеринка FORMA</b><span class="tm">Сегодня, 6 нояб · 23:00 – 04:00</span><span class="tm">FORMA lounge · ул. Республики, 14</span><span class="tm">Организатор: FORMA lounge</span></div>
<div class="tcut"><i></i><span></span><i></i></div>
<div class="tnum"><small>Номер билета</small><b>FRM‑007</b><span>Назови номер организатору на входе</span></div></div>
<div class="row" style="margin-top:12px"><button class="btn l pr" data-toast="Откроется маршрут в Яндекс Картах">{I('pin')}Маршрут</button><button class="btn l pr" data-toast="Добавлено в календарь">{I('cal')}В календарь</button></div>
<button class="btn l pr" style="margin-top:8px;color:#C2335A" data-ov="cancelSheet">Отменить участие</button></div>'''

def guest(code, n, came):
    return f'<div class="gst g"><b class="gc">{code}</b><span class="a" style="{F(n,40,40,140)}"></span><span class="x"><b>{n}</b><small>{"Пришёл" if came else "Ещё не пришёл"}</small></span><button class="gchk pr{" on" if came else ""}" data-came>{CHK}</button></div>'
S["doorcheck"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Билеты <em>гостей</em></h1><p class="sub2">Вечеринка FORMA · пришли 2 из 4</p>
<label class="field g">{I('search')}<input placeholder="Номер билета или имя" id="gq"></label>
<div class="hs" style="gap:6px;margin-top:10px"><button class="chip g pr on" data-af>Все · 4</button><button class="chip g pr" data-af>Пришли · 2</button><button class="chip g pr" data-af>Ждём · 2</button></div>
<div class="list" id="gList">{guest('FRM‑004','Олег',True)}{guest('FRM‑005','Аня',True)}{guest('FRM‑006','Макс',False)}{guest('FRM‑007','Даша',False)}</div>
<p class="sub2" style="text-align:center;margin-top:12px">Проверь номер — например, 7 или FRM‑007</p></div>'''

# participants in requests: real «Убрать» with confirm
S["requests"] = S["requests"].replace('data-toast="Убрать участника?"', 'data-ov="kickSheet"')
# my event (organizer) — door check entry for business

# meetings list: ticket pill opens the ticket
S["meet"] = S["meet"].replace(li('party','Вечеринка FORMA','6 нояб, 23:00 · FORMA lounge','Билет в профиле','ok'), li('party','Вечеринка FORMA','Сегодня, 23:00 · FORMA lounge','Билет FRM‑007','ok','ticket'))
# notifications: approval with ticket
S["notif"] = S["notif"].replace('<div class="list">', '<div class="list">' + nt(C('Вечеринка'), '<b>FORMA lounge</b> приняли заявку — твой билет <b>FRM‑007</b>', 'сейчас', 'ticket'), 1)

EXTRA_OVS += f'''<div class="ov" id="kickSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Убрать <em>Олега</em>?</h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:8px 0 14px">Он выйдет из встречи и чата, место освободится. Убрать можно только до начала встречи.</p>
<div style="display:grid;gap:10px"><button class="btn d pr" data-close data-kick style="background:#C2335A">Убрать из встречи</button><button class="btn l pr" data-close>Оставить</button></div></div></div>
<div class="ov" id="cancelSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Отменить <em>участие</em>?</h2>
<p class="muted" style="font:400 14px/1.5 var(--disp);margin:8px 0 14px">Билет FRM‑007 перестанет действовать, место вернётся организатору.</p>
<div style="display:grid;gap:10px"><button class="btn d pr" data-close data-toast="Участие отменено" style="background:#C2335A">Отменить участие</button><button class="btn l pr" data-close>Остаться</button></div></div></div>'''
for k, l in [("ticket", "Мой билет"), ("doorcheck", "Билеты гостей")]:
    if (k, l) not in FLOW2: FLOW2.insert(10, (k, l))

# ---- ticket v2: price, QR, payment note ----
import random as _r
def _qr(n=25, seed=7):
    _r.seed(seed); M=[[0]*n for _ in range(n)]; R=[[False]*n for _ in range(n)]
    def fp(x,y):
        for i in range(-1,8):
            for j in range(-1,8):
                X,Y=x+i,y+j
                if 0<=X<n and 0<=Y<n:
                    R[Y][X]=True
                    M[Y][X]=1 if (0<=i<=6 and 0<=j<=6 and (i in(0,6) or j in(0,6) or (2<=i<=4 and 2<=j<=4))) else 0
    fp(0,0);fp(n-7,0);fp(0,n-7)
    for k in range(8,n-8): M[6][k]=M[k][6]=1-(k%2); R[6][k]=R[k][6]=True
    for i in range(-2,3):
        for j in range(-2,3):
            X,Y=n-7+i,n-7+j;R[Y][X]=True;M[Y][X]=1 if max(abs(i),abs(j))!=1 else 0
    for y in range(n):
        for x in range(n):
            if not R[y][x]: M[y][x]=1 if _r.random()<.5 else 0
    d=''.join(f'M{x} {y}h1v1h-1z' for y in range(n) for x in range(n) if M[y][x])
    return f'<svg class="qr" viewBox="-2 -2 {n+4} {n+4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="{n+4}" height="{n+4}" fill="#fff"/><path d="{d}" fill="#17141F"/></svg>'
QR = _qr()
QRI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 12h10"/></svg>'
S["ticket"] = S["ticket"].replace('<div class="tnum"><small>Номер билета</small><b>FRM‑007</b><span>Назови номер организатору на входе</span></div>',
 f'<div class="tprice"><span><small>Стоимость</small><b>1 500 ₽</b></span><span class="tpay">Оплата на входе</span></div>'
 f'<div class="tcut"><i></i><span></span><i></i></div>'
 f'<div class="tnum">{QR}<small>Номер билета</small><b>FRM‑007</b><span>Покажи QR или назови номер на входе</span></div>')
S["ticket"] = S["ticket"].replace('<button class="btn l pr" style="margin-top:8px;color:#C2335A" data-ov="cancelSheet">Отменить участие</button>',
 '<p class="sub2 tnote">Скоро — оплата прямо в приложении: билет сразу будет оплачен</p><button class="btn l pr" style="margin-top:8px;color:#C2335A" data-ov="cancelSheet">Отменить участие</button>')
S["doorcheck"] = S["doorcheck"].replace('<label class="field g">', '<button class="btn d pr" style="margin-top:14px;width:100%" data-toast="Наведи камеру на QR гостя">'+QRI+'Сканировать QR</button><label class="field g" style="margin-top:10px">',1)

# ---- door check v2: fast entry for big events ----
def guest2(code, n, came, t=''):
    return f'<div class="gst g" data-code="{code[-3:].lstrip("0")}" data-name="{n}"{" data-in=\"%s\""%t if came else ""}><b class="gc">{code}</b><span class="a" style="{F(n,40,40,140)}"></span><span class="x"><b>{n}</b><small>{"Прошёл в "+t if came else "Ещё не пришёл"}</small></span><button class="gchk pr{" on" if came else ""}" data-came>{CHK}</button></div>'
S["doorcheck"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Вход <em>гостей</em></h1><p class="sub2">Вечеринка FORMA · сегодня, 23:00</p>
<div class="dprog g"><div class="dpt"><span>Пришли</span><b id="dIn">87</b><span>из 200</span></div><div class="dbar"><i id="dBar" style="width:43.5%"></i></div></div>
<button class="btn d pr dscan" data-ov="scanOv">{QRI}Сканировать QR</button>
<div class="dnum g"><span class="dpre">FRM‑</span><input id="gq" inputmode="numeric" placeholder="номер билета или имя" autocomplete="off"></div>
<div id="dRes"></div>
<div class="hs" style="gap:6px;margin-top:14px"><button class="chip g pr on">Все · 200</button><button class="chip g pr"><span>Пришли · <span class="dInC">87</span></span></button><button class="chip g pr"><span>Ждём · <span class="dWC">113</span></span></button></div>
<div class="list" id="gList">{guest2('FRM‑004','Олег',True,'23:04')}{guest2('FRM‑005','Аня',True,'23:06')}{guest2('FRM‑006','Макс',False)}{guest2('FRM‑007','Даша',False)}{guest2('FRM‑008','Игорь',False)}</div>
<p class="sub2" style="text-align:center;margin-top:12px">Отмечать могут несколько человек одновременно — повторно один билет не пройдёт</p></div>'''
EXTRA_OVS += f'''<div class="ov" id="scanOv"><div class="dim" data-close style="background:rgba(10,8,16,.9)"></div><div class="scan">
<div class="scam"><div class="sfr"><i></i><i></i><i></i><i></i><span class="sline"></span></div></div>
<p class="sct">Наведи камеру на QR гостя</p>
<div class="sres" id="sRes"><span class="sok">{CHK}</span><span class="x"><b>Макс · FRM‑006</b><small>Вход отмечен · 88 из 200</small></span></div>
<button class="btn l pr" data-close style="margin-top:14px">Готово</button></div></div>'''

# door check lives only in business / big events: entry from «Создал» tab
S["meet"] = S["meet"].replace(li('coffee','Кофе и разговоры','Завтра, 19:00 · 2 из 4','2 новые заявки','own')+'</div>',
  li('coffee','Кофе и разговоры','Завтра, 19:00 · 2 из 4','2 новые заявки','own')+li('party','Вечеринка FORMA','Бизнес · сегодня, 23:00 · 200 гостей','Вход гостей · 87 из 200','ok','doorcheck')+'</div>')

# ---- v3: no scanner yet; compact ticket that fits one screen ----
S["doorcheck"] = S["doorcheck"].replace(f'<button class="btn d pr dscan" data-ov="scanOv">{QRI}Сканировать QR</button>\n','')
S["doorcheck"] = S["doorcheck"].replace('<div class="dnum g">','<p class="dhint">Гость называет номер — введи цифры, карточка появится сразу</p><div class="dnum g">')
EXTRA_OVS = EXTRA_OVS[:EXTRA_OVS.index('<div class="ov" id="scanOv">')]
S["ticket"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><button class="rb g pr" data-toast="Билет сохранён в галерею">{SHARE}</button></div>
<h1 class="h1" style="margin-top:18px">Мой <em>билет</em></h1>
<div class="tkt"><div class="thd"><span class="tth" style="{P('party')}"></span><span class="x"><b class="tt2">Вечеринка FORMA</b><span class="tm">Сегодня, 6 нояб · 23:00 – 04:00</span><span class="tm">FORMA lounge · ул. Республики, 14</span></span></div>
<div class="tcut"><i></i><span></span><i></i></div>
<div class="tnum"><small>Номер билета</small><b>FRM‑007</b><span>Назови номер организатору на входе</span></div>
<div class="tcut"><i></i><span></span><i></i></div>
<div class="tprice"><span><small>Стоимость</small><b>1 500 ₽</b></span><span class="tpay">Оплата на входе</span></div></div>
<p class="sub2 tnote">Скоро — оплата прямо в приложении</p>
<div class="row" style="margin-top:12px"><button class="btn l pr" data-toast="Откроется маршрут в Яндекс Картах">{I('pin')}Маршрут</button><button class="btn l pr" data-toast="Добавлено в календарь">{I('cal')}В календарь</button></div>
<button class="btn l pr" style="margin-top:8px;color:#C2335A" data-ov="cancelSheet">Отменить участие</button></div>'''

# Round 6: anonymous meetings (by a guy / by a girl)
def anon_screen(img, pos, cat_icon, cat, t1, t2, who, look, when, seats, cost, desc):
    return f'''<div class="evbg" style="{P(img)}"></div><div class="evph" style="{P(img,pos)}"></div>
<div class="tbar"><button class="rb gw pr" data-back>{BACK}</button><div style="display:flex;gap:8px"><button class="rb gw pr" data-like>{HEART}</button><button class="rb gw pr" data-toast="Пожаловаться · Скопировать ссылку">{MORE}</button></div></div>
<div class="scroll"><div class="spacer"></div><div class="card">
<div class="anrow"><span class="chip gw">{C(cat_icon)}{cat}</span><span class="chip gw anb">{STKSVG}Анонимно · {who}</span></div>
<h1 class="title">{t1}<br><em>{t2}</em></h1>
<div class="tiles t4"><div class="tile gd"><small>{I('cal')}Когда</small><b>{when}</b></div><div class="tile gd"><small>{I('people')}Ищу</small><b>{look}</b></div><div class="tile gd"><small>{I('spark')}Расходы</small><b>{cost}</b></div><button class="tile gd pr tchat" data-toast="Чат откроется после одобрения" aria-label="Чат встречи">{I('chat')}<small>Чат</small></button></div>
<div class="orgc gd"><span class="anav"><canvas class="cr" data-v="e" width="96" height="96"></canvas></span><span class="x"><b>Организатор скрыт</b><small>{who.capitalize()} · 4,9 ★ · 8 встреч</small></span><button class="chip gw pr why" data-ov="whySheet">Почему?</button></div>
<div class="blk gd"><b class="bh">О встрече</b><p>{desc}</p></div>
<div class="blk gd lockb"><span class="lk">{LOCK}</span><span><b class="bh">Место откроется после одобрения</b><small>Сейчас видно только район · {seats}</small></span></div>
<div style="height:96px"></div></div></div>
<div class="cta gd"><button class="rb gw pr" data-ov="shareSheet">{SHARE}</button><button class="btn pr goAnon" style="background:#fff;color:var(--ink)">Отправить заявку {CHECK}</button></div>'''
LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>'
STKSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 10h.01M15 10h.01"/></svg>'
S["anon_f"] = anon_screen('cinema', 'center', 'Кино', 'Кино', 'Кино', 'вечером', 'девушка, 25–30', 'Парня', 'Сегодня, 21:00', '1 из 2 · Центр', 'Каждый сам',
  'Хочу на новый фильм в «Киномаксе», но не одна. Потом можно прогуляться и обсудить. Без лишнего — просто хорошая компания.')
S["anon_m"] = anon_screen('bar', 'center', 'Бар', 'Бары', 'Бар‑квиз', 'в пятницу', 'парень, 30–35', 'Команду', 'Пт, 20:00', '2 из 5 · Центр', 'Каждый сам',
  'Собираю команду на квиз в «Кислороде». Не важно, сколько знаешь, важно, что весело. Возьму на себя первую пиццу.')
# home: anonymous cards clearly labelled
S["home"] = S["home"].replace("hc('cinema','1 из 2 · анонимно','Кино','вечером','Сегодня, 21:00 · Киномакс','Я иду')".replace("hc(","hc("), "")
import re as _re
S["home"] = S["home"].replace('data-go="event"><span class="chip gw tg">1 из 2 · анонимно</span>', 'data-go="anon_f"><span class="chip gw tg">Анонимно · девушка</span>')
S["home"] = S["home"].replace("<span class=\"mm\" style=\"display:block\">Сегодня, 21:00 · Киномакс</span>", "<span class=\"mm\" style=\"display:block\">Сегодня, 21:00 · ищет парня</span>")
S["home"] = S["home"].replace(f'{hc("coffee","2 из 4 · кофе","Кофе и","разговоры","Завтра, 19:00 · Центр","Я иду","60% center")}',
  hc("coffee","2 из 4 · кофе","Кофе и","разговоры","Завтра, 19:00 · Центр","Я иду","60% center") + hc("bar","Анонимно · парень","Бар‑квиз","в пятницу","Пт, 20:00 · ищет команду","Я иду","center","anon_m"))
S["allev"] = S["allev"].replace("evrow('cinema','Кино вечером','Сегодня, 21:00 · Киномакс · анонимно')", "evrow('cinema','Кино вечером','Сегодня, 21:00 · анонимно · девушка ищет парня','anon_f')")
EXTRA_OVS += f'''<div class="ov" id="whySheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Почему <em>скрыт</em>?</h2>
<p class="muted" style="font:400 14px/1.55 var(--disp);margin:10px 0 14px">Это анонимная встреча. Имя, фото и точное место организатор покажет только тем, чью заявку примет. «Место» знает, кто создал встречу, и проверяет профиль — рейтинг и число встреч настоящие.</p>
<button class="btn d pr" data-close>Понятно</button></div></div>'''
for k, l in [("anon_f", "Анонимно · девушка"), ("anon_m", "Анонимно · парень")]:
    if (k, l) not in FLOW2: FLOW2.insert(8, (k, l))

# Round 9: quick dates + calendar multi-select; clean glass sliders
import re as _re9
def qdates(scope):
    q = [("", "Любые дни"), ("6", "Сегодня"), ("7", "Завтра"), ("7,8", "Выходные")]
    return (f'<div class="qd" data-qd="{scope}">' + "".join(f'<button class="chip g pr{" on" if i==0 else ""}" data-qdv="{v}">{t}</button>' for i, (v, t) in enumerate(q))
            + f'<button class="chip g pr qcal" data-ov="daysSheet" data-qcal="{scope}">{I("cal")}<span>Даты</span></button></div>')
for k in ("allev", "afisha"):
    S[k] = _re9.sub(r'<div class="dates" data-days="%s">.*?</div><p class="dsum" id="dsum_%s">.*?</p>' % (k, k), qdates(k), S[k], count=1, flags=_re9.S)
# Nov 2026 starts on Sunday -> 6 blanks
CAL = ("".join(f'<span class="w">{d}</span>' for d in ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]) + "<span></span>"*6
       + "".join(f'<button class="pr{" past" if d<6 else ""}{" today" if d==6 else ""}" data-md="{d}"{" disabled" if d<6 else ""}>{d}</button>' for d in range(1, 31)))
EXTRA_OVS += f'''<div class="ov" id="daysSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div>
<div class="calh"><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Выбери <em>даты</em></h2></div>
<div class="calm"><button class="pr" data-toast="Октябрь уже прошёл" aria-label="Назад">{BACK}</button><b>Ноябрь 2026</b><button class="pr" data-toast="Декабрь" aria-label="Вперёд" style="transform:scaleX(-1)">{BACK}</button></div>
<div class="cal mcal">{CAL}</div>
<p class="dsum" id="mdSum">Можно выбрать несколько дней</p>
<div class="row" style="margin-top:12px"><button class="btn l pr" data-mdreset>Сбросить</button><button class="btn d pr" data-close data-mdok>Готово</button></div></div></div>'''

# ---- v2: calendar on the left, then Сегодня / Завтра / Выходные (tap again = any day)
def qdates2(scope):
    q = [("6", "Сегодня"), ("7", "Завтра"), ("7,8", "Выходные")]
    return (f'<div class="qd" data-qd="{scope}"><button class="chip g pr qcal" data-ov="daysSheet" data-qcal="{scope}" aria-label="Календарь">{I("cal")}<span></span></button>'
            + "".join(f'<button class="chip g pr" data-qdv="{v}">{t}</button>' for v, t in q) + '</div>')
for k in ("allev", "afisha"):
    S[k] = _re9.sub(r'<div class="qd" data-qd="%s">.*?</div>' % k, qdates2(k), S[k], count=1, flags=_re9.S)
# distance: same slider component as age
EXTRA_OVS = EXTRA_OVS.replace('<span class="lbl">Расстояние · до 5 км</span><input type="range" min="1" max="30" value="5" style="width:100%">',
  '<span class="lbl">Расстояние · <b id="distL">до 5 км</b></span><div class="arange one"><span class="atr"><i id="distFill"></i></span><input type="range" min="1" max="30" value="5" id="distA"></div>')

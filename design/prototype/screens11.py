# Round 11: new running photos (10 covers to choose from), cover picker per category
RUN = [f"run{i:02d}" for i in (5, 1, 2, 3, 6, 7, 8, 9, 10, 11)]  # run04 left out: too low-res
COVERS = {"Бег": RUN, "Hyrox": [f"hyr{i:02d}" for i in range(1,11)], "Кофе": [], "Кино": [f"cin{i:02d}" for i in (1,8,4,6,2,3,5,7)], "Бары": [], "Ужин": [], "Прогулка": [], "Йога": [], "Падел": [], "Вело": []}
def _sw(s):
    return s.replace("url(a/running.webp);background-size:cover", "url(a/run05.webp);background-size:cover").replace("url(a/cinema.webp)", "url(a/cin01.webp)")
for k in list(S): S[k] = _sw(S[k])
EXTRA_OVS = _sw(EXTRA_OVS)
import json as _j
def cover_picker(id_, prev):
    cats = "".join(f'<button class="chip g pr{" on" if c=="Бег" else ""}" data-cvc="{c}">{C(c if c not in ("Бары",) else "Бар")}{c}</button>' for c in COVERS)
    grid = "".join(f'<button class="pr{" on" if i==0 else ""}" data-cv="{b}" style="{P(b)}"></button>' for i, b in enumerate(RUN))
    return (f'<div class="hs cvcats" data-cvcats>{cats}</div><p class="cvn" data-cvn>10 фирменных обложек · выбери одну</p>'
            f'<div class="cvg" data-cvg data-prev="{prev}">{grid}<button class="pr cvown" data-toast="Выбери фото из галереи — обрежем в 3:4">{I("plus") if False else "+"}<small>Своё фото</small></button></div>')
# create flow step 2: replace the 6 generic covers
import re as _r11
for k in list(S):
    S[k] = _r11.sub(r'<span class="lbl">Обложка · фирменная или своё фото</span><div class="bgg" id="bgs">.*?</div>(<button class="btn l pr" style="margin-top:10px" data-toast="Фо[^"]*">.*?</button>)?',
                    '<span class="lbl">Обложка</span>' + cover_picker("create", "prevCard"), S[k], count=1, flags=_r11.S)
# edit screens: «Сменить обложку» opens the same picker in a sheet
for k in ("editev", "editbiz"):
    S[k] = S[k].replace('data-toast="Выбери фото из галереи">Сменить обложку', 'data-ov="coverSheet" data-cvfor="' + k + '">Сменить обложку')
EXTRA_OVS += f'''<div class="ov" id="coverSheet"><div class="dim" data-close></div><div class="sheet"><div class="grab"></div><h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0">Обложка <em>встречи</em></h2>
{cover_picker("sheet", "ecov")}<button class="btn d pr" data-close style="margin-top:14px;width:100%">Готово</button></div></div>'''
COVERS_JS = _j.dumps(COVERS, ensure_ascii=False)

# ---- vertical covers + crop editor ----
CROPI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/></svg>'
for k in ("editev", "editbiz"):
    img = 'party' if k == 'editbiz' else 'coffee'
    S[k] = _r11.sub(r'<div class="ecov" style="[^"]*"><button class="chip gw pr" data-ov="coverSheet" data-cvfor="%s">Сменить обложку</button></div>' % k,
        f'<div class="ecw"><div class="ecov" data-cover="{img}" style="{P(img)}"></div><div class="ecb"><span class="fl">Обложка · вертикальная 3:4</span>'
        f'<button class="btn l pr" data-ov="coverSheet" data-cvfor="{k}">{I("cal") if False else ""}Сменить</button><button class="btn l pr" data-crop="section[data-id={k}] .ecov">{CROPI}Обрезать</button></div></div>', S[k], count=1)
# create flow: crop under the cover grid
for k in list(S):
    if 'data-prev="prevCard"' in S[k]:
        S[k] = S[k].replace('<small>Своё фото</small></button></div>', '<small>Своё фото</small></button></div><button class="btn l pr cropb" data-crop="#prevCard">' + CROPI + 'Обрезать обложку</button>', 1)
EXTRA_OVS = EXTRA_OVS.replace('<small>Своё фото</small></button></div><button class="btn d pr" data-close style="margin-top:14px;width:100%">Готово</button>',
  '<small>Своё фото</small></button></div><div class="row" style="margin-top:14px"><button class="btn l pr" data-crop="@cvtarget">' + CROPI + 'Обрезать</button><button class="btn d pr" data-close>Готово</button></div>')
EXTRA_OVS += '''<div class="ov crop" id="cropOv"><div class="cropbg"></div><div class="croptop"><button class="pr" data-cropx>Отмена</button><b>Обложка 3:4</b><button class="pr ok" data-cropok>Готово</button></div>
<div class="cropst" id="cropSt"><img id="cropImg" alt="" draggable="false"><div class="cropfr" id="cropFr"><i></i><i></i><i></i><i></i></div></div>
<p class="crophint">Двигай фото пальцем · увеличивай ползунком</p>
<div class="cropz"><span>−</span><div class="arange one"><span class="atr"><i id="czFill"></i></span><input type="range" min="100" max="300" value="100" id="cropZ"></div><span>+</span></div>
<button class="pr cropreset" data-cropreset>Сбросить</button></div>'''

# Business events keep the photos venues uploaded themselves — only our stock covers are replaced
def _venue(s):
    for n in ("party", "dinner", "bar", "breakfast", "coffee"):
        s = s.replace(f"url(a/{n}.webp)", f"url(a/v_{n}.webp)")
    return s.replace("url(a/cin01.webp)", "url(a/v_cinema.webp)")
for k in ("afisha", "mybiz", "editbiz", "ticket", "venue", "doorcheck"):
    if k in S: S[k] = _venue(S[k])
# home: only the «Афиша заведений» block
if '<div class="biz g">' in S["home"]:
    a, b = S["home"].split('<div class="biz g">', 1); S["home"] = a + '<div class="biz g">' + _venue(b)
# search: only the afisha rows
S["search"] = _r11.sub(r'<button class="li g pr evx" data-k="Афиша".*?</button>', lambda m: _venue(m.group(0)), S["search"], flags=_r11.S)
# my meetings + notifications: FORMA rows
for k in ("meet", "notif"):
    S[k] = _r11.sub(r'<button[^>]*>(?:(?!</button>).)*FORMA(?:(?!</button>).)*</button>', lambda m: _venue(m.group(0)), S[k], flags=_r11.S)
S["map"] = _r11.sub(r'<button class="mc g pr"(?:(?!</button>).)*FORMA(?:(?!</button>).)*</button>', lambda m: _venue(m.group(0)), S["map"], flags=_r11.S)
S["map"] = S["map"].replace('data-mk="3" ', 'data-mk="3" ', 1)
_m = _r11.search(r'<button class="pin pr" data-mk="3".*?</button>', S["map"], flags=_r11.S)
if _m: S["map"] = S["map"].replace(_m.group(0), _venue(_m.group(0)))

# afisha Hyrox training (venue photo)
S["afisha"] = S["afisha"].replace('data-cat="Спорт"><i style="background-image:url(a/run05.webp)', 'data-cat="Спорт"><i style="background-image:url(a/hyr08.webp)')
S["search"] = S["search"]

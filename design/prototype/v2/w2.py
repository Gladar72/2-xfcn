import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    from w import *

CW = 167; CH = 250
def ec(img, tag, t1, t2, meta, cta, pos="center", size="cover", dark=False, br=True):
    sep = '<br>' if br else ' '
    return (f'<div class="hc" style="{PH(img,pos)};background-size:{size}"><span class="chip gw tg">{tag}</span>'
            f'<div class="hb2"><div class="tt">{t1}{sep}<em>{t2}</em></div><div class="mm">{meta}</div><span class="cta{" d" if dark else ""}">{cta}</span></div></div>')
HOME_CSS = f"""
body{{height:auto;min-height:844px;padding-bottom:120px}}
.top{{padding:62px 20px 0}}.city{{display:flex;justify-content:space-between;align-items:center}}
.city .p{{height:40px;padding:0 14px 0 12px;border-radius:20px;display:flex;align-items:center;gap:7px;font:500 14px ID}}.city .r{{display:flex;gap:8px}}
.chips{{display:flex;gap:8px;padding:14px 20px 0;overflow:hidden}}
.mos{{margin:14px 20px 0;height:62px;border-radius:31px;display:flex;align-items:center;gap:10px;padding:0 8px 0 4px}}
.mos .o{{width:58px;height:58px;background:url(img/blobe.png) center/150% no-repeat}}
.mos .t{{font:400 14px/1.3 ID;flex:1}}.mos .t b{{font-weight:600}}
.mos .go{{height:42px;padding:0 16px;border-radius:21px;background:#17141F;color:#fff;font:500 13px ID;display:flex;align-items:center}}
.sh{{padding:0 20px;margin-top:26px;display:flex;justify-content:space-between;align-items:center;gap:12px}}.sh>div{{min-width:0}}
.sh h3{{font:400 20px ID;letter-spacing:-.4px}}.sh h3 em{{font-size:22px}}
.sh p{{font:400 13px ID;color:var(--fg2);margin-top:2px}}
.sh .all{{font:500 13px ID;height:32px;padding:0 13px;border-radius:16px;display:flex;align-items:center}}
.rail{{display:flex;gap:16px;padding:12px 20px 0;overflow:hidden}}
.hc{{flex:none;width:{CW}px;height:{CH}px;border-radius:26px;position:relative;overflow:hidden;color:#fff;background-position:center}}
.hc::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 38%,rgba(12,8,24,.78) 100%)}}
.hc>*{{position:absolute;z-index:2}}
.hc .tg{{top:10px;left:10px;height:28px;padding:0 10px;font-size:12px;border-radius:14px}}
.hb2{{left:12px;right:12px;bottom:12px}}
.hb2 .tt{{font:500 15px/1.15 ID;letter-spacing:-.2px}}.hb2 .tt em{{font-size:17px}}
.hb2 .mm{{font:400 11.5px ID;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.cta{{display:inline-flex;margin-top:8px;height:28px;padding:0 12px;border-radius:14px;align-items:center;font:600 12px ID;background:rgba(255,255,255,.92);color:#17141F}}
.inv{{flex:none;width:{CW}px;height:{CH}px;border-radius:26px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;font:500 14px/1.3 ID;padding:0 18px}}
.inv i{{width:52px;height:52px;border-radius:26px;background:#17141F;color:#fff;display:flex;align-items:center;justify-content:center;font:300 32px ID;font-style:normal}}
.biz{{margin:26px 6px 0;padding:2px 0 14px;border-radius:32px}}
.biz .sh{{padding:16px 14px 0 14px;margin-top:0}}.biz .rail{{padding:12px 14px 0;gap:16px}}
.nav{{position:fixed;bottom:44px}}
@font-face{{font-family:MO;src:url(file:///usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf)}}
.sh h3{{white-space:nowrap}}.sh .all{{white-space:nowrap}}.tagp{{font:600 9px ID;letter-spacing:.6px;text-transform:uppercase;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.7);border:1px solid #fff;vertical-align:4px;font-style:normal}}
.mz{{position:relative;margin:14px 20px 0;height:268px}}.cm{{position:absolute;top:9px;left:9px;z-index:2;display:flex;align-items:center;gap:3px;height:28px;padding:0 9px 0 5px;border-radius:14px;font:500 11.5px ID}}.cm .ii svg{{width:18px;height:18px}}.cm .ii{{display:flex}}
.mt{{position:absolute;border-radius:26px;overflow:hidden;box-shadow:0 10px 24px rgba(60,40,110,.14);color:#fff}}.mt::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 50%,rgba(12,8,24,.72) 100%)}}.mb{{position:absolute;left:12px;right:12px;bottom:11px;z-index:2}}.mb b{{display:block;font:500 15px ID}}.mb small{{display:block;font:400 11.5px ID;opacity:.85;margin-top:2px}}
.hb{{position:fixed}}
"""
HOME_BODY = f"""{chrome()}
<div class="top"><div class="city"><div class="p g">{icon('pin')}Тюмень</div><div class="r"><div class="rb g">{icon('bell')}</div></div></div>
<div class="h1" style="margin-top:20px">Найди <em>компанию</em><br>на сегодня</div></div>
<div class="chips"><span class="chip g" style="padding:0 11px">{icon('search')}</span><span class="chip on">Все</span>{chip('Кофе')}{chip('Кино')}{chip('Бег')}<span class="chip g">{icon('filter')}Фильтры</span></div>
<div class="mos g"><div class="o"></div><div class="t"><b>3 человека</b> рядом свободны<br>сегодня вечером</div><div class="go">Найти</div></div>
<div class="sh"><div><h3>Личные <em>встречи</em></h3><p>Планы людей рядом — присоединяйся</p></div><span class="all g">Все</span></div>
<div class="rail">{ec('running','3 из 10 · бег','Пробежка','на рассвете','Сб, 08:00 · Набережная','Я иду','45% center')}{ec('cinema','1 из 2 · анонимно','Кино','вечером','Сегодня, 21:00 · Киномакс','Я иду','50% center')}</div>
<div class="sh"><div><h3>Люди <em>в твоём городе</em></h3><p>С общими интересами</p></div><span class="all g">Листать</span></div><div class="mz"><div class="mt" style="left:0px;top:0px;width:206px;height:268px;background-image:url(img/running.webp);background-size:989px auto;background-position:-408px -72px"><span class="cm gw"><span class="ii">{ico('Бег')}</span><span class="ii">{ico('Кофе')}</span>2 общ.</span><div class="mb"><b>Даша, 27</b><small>1,2 км</small></div></div><div class="mt" style="left:218px;top:0px;width:132px;height:128px;background-image:url(img/running.webp);background-size:689px auto;background-position:-80px -85px"><span class="cm gw"><span class="ii">{ico('Бар')}</span>1 общ.</span><div class="mb"><b>Олег, 31</b><small>3 км</small></div></div><div class="mt" style="left:218px;top:140px;width:132px;height:128px;background-image:url(img/running.webp);background-size:792px auto;background-position:-432px -121px"><span class="cm gw"><span class="ii">{ico('Падел')}</span>1 общ.</span><div class="mb"><b>Макс, 29</b><small>2 км</small></div></div></div>
<div class="biz g"><div class="sh"><div><h3>Афиша <em>заведений</em></h3><p>События кафе, баров и площадок</p></div><span class="all g">Все</span></div>
<div class="rail">{ec('party','↑ В топе','Вечеринка','FORMA','6 нояб, 23:00 · 158 мест','Бесплатно','40% center')}{ec('dinner','Ужин','Гастро-','вечер','15 нояб, 19:00 · 24 места','2000 ₽','50% center')}<div class="inv g"><i>+</i>Здесь может быть ваше бизнес‑событие</div></div></div>
{nav(0)}"""
open(os.path.join(D, "w_home_full.html"), "w").write(page(HOME_CSS, HOME_BODY))

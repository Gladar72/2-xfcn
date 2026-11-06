# Round 12: share — visible button on every event, story preview, messenger link preview
import re as _r12
SHI = SHARE
for k in list(S):
    S[k] = S[k].replace('data-toast="Ссылка скопирована">' + SHI, 'data-ov="shareSheet" aria-label="Поделиться">' + SHI)
# event-like screens: share also in the top bar, next to the heart
for k in ("event", "anon_f", "anon_m", "myevent", "mybiz", "venue"):
    if k in S and 'data-ov="shareSheet" aria-label="Поделиться" data-top' not in S[k]:
        S[k] = S[k].replace('<button class="rb gw pr" data-like>', f'<button class="rb gw pr" data-ov="shareSheet" aria-label="Поделиться" data-top>{SHI}</button><button class="rb gw pr" data-like>', 1)
# share sheet: story preview is filled from the event that is open; targets open real previews
EXTRA_OVS = _r12.sub(r'<div class="ov" id="shareSheet">.*?</div></div></div>', '', EXTRA_OVS, count=1, flags=_r12.S)
TG_I = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M20.7 4.3 2.9 11.2c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.7 5.4c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14c.3-1.2-.4-1.7-1.5-1.3zM9.6 14.4l8.5-7.7-6.8 8.6-.3 3.2z"/></svg>'
SH_T = [("tg", "Telegram", "#2AABEE", TG_I, "linkOv"), ("st", "Сторис", "linear-gradient(135deg,#2AABEE,#7A5CFF)", "ST", "storyOv"),
        ("ig", "Instagram", "linear-gradient(135deg,#FEDA75,#FA7E1E,#D62976,#962FBF)", "IG", "storyOv"), ("wa", "WhatsApp", "#25D366", "WA", "linkOv"),
        ("vk", "VK", "#0077FF", "VK", "linkOv"), ("ln", "Ссылка", "#17141F", "🔗", "")]
EXTRA_OVS += f'''<div class="ov" id="shareSheet"><div class="dim" data-close></div><div class="sheet shs"><div class="grab"></div>
<h2 style="font:300 28px var(--disp);letter-spacing:-.03em;margin:0 0 10px">Поделиться <em>встречей</em></h2>
<div class="story" id="storyCard"><img class="swm" src="a/wordmark-white.svg" alt=""><span class="schip" data-sh="chip">Бег · Сб, 08:00</span>
<span class="stt" data-sh="title">Пробежка<br><em>на рассвете</em></span><span class="sme" data-sh="meta">Набережная · 3 из 10 · каждый сам</span><span class="scta">Пойти со мной →</span></div>
<div class="shr2">{"".join(f'<button class="pr" data-shto="{o}" data-shnet="{k}"><span style="background:{c}">{ic}</span>{l}</button>' for k,l,c,ic,o in SH_T)}</div></div></div>
<div class="ov story9" id="storyOv"><div class="s9" id="s9"><div class="s9bar"><i></i><i></i></div><div class="s9top"><span class="s9av"></span><b>andrey.g</b><small>сейчас</small><button class="pr" data-close aria-label="Закрыть">×</button></div>
<img class="s9wm" src="a/wordmark-white.svg" alt=""><div class="s9b"><span class="s9chip" data-sh="chip">Бег · Сб, 08:00</span>
<span class="s9tt" data-sh="title">Пробежка<br><em>на рассвете</em></span><span class="s9me" data-sh="meta">Набережная · 3 из 10 · каждый сам</span></div>
<span class="s9link"><span>🔗</span>Пойти со мной · mesto-go.ru</span>
<div class="s9foot"><span>Отправить сообщение</span><span>♡</span><span>➤</span></div></div>
<button class="btn d pr s9pub" data-close data-toast="Сторис опубликована">Опубликовать в сторис</button></div>
<div class="ov" id="linkOv"><div class="dim" data-close></div><div class="sheet lks"><div class="grab"></div><span class="lbl" style="margin-top:0" data-lnet>Так увидят в Telegram</span>
<div class="chatm"><div class="bub"><p>Пойдёшь со мной? 🙌</p><div class="og"><span class="ogsrc">Место · mesto-go.ru</span><b data-sh="titleplain">Пробежка на рассвете</b>
<span data-sh="meta">Набережная · 3 из 10 · каждый сам</span><i class="ogimg" data-sh="cover"><img src="a/wordmark-white.svg" alt=""><span data-sh="chip">Бег · Сб, 08:00</span></i></div><small>11:39 ✓✓</small></div></div>
<p class="muted" style="font:400 13px/1.45 var(--disp);margin:10px 2px 0">Ссылка откроет встречу прямо в приложении «Место». Если его нет — откроется бот в Telegram.</p>
<button class="btn d pr" data-close data-toast="Отправлено" style="margin-top:12px;width:100%">Отправить</button></div></div>'''

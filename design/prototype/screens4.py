# Round 4: legal docs, settings, consent checkboxes, map clusters, no peek on form
import re as _re
REQ = '<div class="req g"><b>Индивидуальный предприниматель Гладаренко Андрей Александрович</b><span>ИНН 720415868727 · ОГРНИП 323723200088752</span><span>support@mesto-go.ru</span></div>'
DOCS = {
 "offer": ("Публичная оферта", [
   ("1. Предмет оферты", "Сервис даёт функциональность для создания и поиска встреч по интересам и общения между пользователями. Отдельные функции — по тарифным планам раздела «Подписка»."),
   ("2. Порядок заключения договора", "Договор заключён с момента регистрации и подтверждения согласия. Сервисом могут пользоваться только лица старше 18 лет."),
   ("3. Права и обязанности сторон", "Пользователь даёт достоверные данные и не нарушает права других. Сервис — техническая платформа и не организует встречи."),
   ("4. Стоимость услуг и порядок оплаты", "Оплата картой или СБП (ЮKassa), через App Store в приложении для iPhone или Telegram Stars в мини‑приложении."),
   ("5. Ограничение ответственности", "Сервис предоставляется «как есть»."),
   ("6. Срок действия и расторжение", "Договор бессрочный до удаления аккаунта: «Настройки» → «Удалить аккаунт»."),
   ("7. Реквизиты оператора Сервиса", "")]),
 "privacy": ("Политика конфиденциальности", [
   ("1. Оператор", ""), ("2. Какие данные обрабатываются", "Профиль, фото, интересы, контакты, примерное местоположение — с точностью до района. Данные банковских карт не хранятся."),
   ("3. Цели обработки", "Работа сервиса, подписка и чеки, модерация и безопасность, поддержка."), ("4. Правовые основания", "Договор (оферта) и отдельное согласие пользователя."),
   ("5. Где хранятся данные", "На серверах Yandex Cloud в Российской Федерации."), ("6. Кому передаются данные", "Обработчикам по поручению: платёжные сервисы, хостинг, уведомления."),
   ("7. Что видят другие пользователи", "Имя, возраст, фото, город, описание, интересы, рейтинг и встречи. Почта, телефон, дата рождения и точное место — нет."),
   ("8. Сроки хранения и удаление", "Пока есть аккаунт. Удаление — в настройках."), ("9. Права Пользователя", "Доступ, исправление, удаление, отзыв согласия."), ("10. Меры защиты", "HTTPS, разграничение доступа, резервные копии, проверка фото и жалоб.")]),
 "consent": ("Согласие на обработку персональных данных", [
   ("1. Персональные данные", "Имя, дата рождения, пол, город, фото, «о себе», интересы, почта, телефон, данные Telegram, примерное местоположение, сведения о подписке, технические данные."),
   ("2. Цели", "Регистрация и вход, встречи, заявки, чаты, отзывы, уведомления, подписка, модерация, поддержка."),
   ("3. Действия с данными", "Сбор, запись, хранение, использование, передача, обезличивание, удаление — с автоматизацией и без."),
   ("4. Передача третьим лицам", "Обработчикам, указанным в Политике конфиденциальности."), ("5. Срок и отзыв согласия", "До удаления аккаунта или отзыва согласия."), ("6. Оператор", "")]),
}
for key, (title, secs) in DOCS.items():
    body = "".join(f'<details class="dsec g"{" open" if i==0 else ""}><summary>{h}<span>{DOWN}</span></summary>{f"<p>{t}</p>" if t else ""}{REQ if not t else ""}</details>' for i, (h, t) in enumerate(secs))
    S["doc_" + key] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button><button class="rb g pr" data-toast="Ссылка на документ скопирована">{SHARE}</button></div>
<h1 class="h1" style="margin-top:18px;font-size:32px">{title}</h1><p class="sub2">Редакция от 20 октября 2026 г. · mesto-go.ru/legal/{key}</p>{body}</div>'''

def row(i, t, s="", go=None, tog=None, tst=None):
    attr = f'data-go="{go}"' if go else (f'data-toast="{tst}"' if tst else "")
    right = f'<span class="sw2{" on" if tog else ""}"></span>' if tog is not None else CHEV
    return f'<button class="srow pr" {attr} {"data-sw" if tog is not None else ""}><span class="si">{I(i)}</span><span class="st"><b>{t}</b>{f"<small>{s}</small>" if s else ""}</span>{right}</button>'
DOC_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/></svg>'
S["settings"] = f'''<div class="pbg"></div><div class="scroll">
<div class="top"><button class="rb g pr" data-back>{BACK}</button></div>
<h1 class="h1" style="margin-top:18px">Настройки</h1>
<span class="lbl">Аккаунт</span><div class="sgrp g">{row('user','Профиль','Андрей',tst='Редактор профиля')}{row('spark','Мой тариф','Старт · до 12 декабря',tst='Тарифы')}{row('bell','Уведомления',go='notif')}{row('cal','Идея на день','Раз в неделю, в пятницу утром',tog=True)}{row('pin','Город','Тюмень',tst='Выбор города')}{row('user','Приватность и анонимность','Расстояние, кто видит профиль',tst='Приватность')}</div>
<span class="lbl">Помощь</span><div class="sgrp g">{row('chat','Задать вопрос','ИИ‑помощник отвечает сразу',tst='Помощник на связи')}{row('share','Написать в поддержку','@Mesto_people_bot',tst='Откроется Telegram')}</div>
<span class="lbl">Документы</span><div class="sgrp g">{"".join(row('more',t,go='doc_'+k) for k,(t,_) in DOCS.items())}</div>
<button class="btn l pr" style="margin-top:16px;color:#C2335A" data-toast="Подтверждение удаления аккаунта">Удалить аккаунт</button>
<p class="sub2" style="text-align:center;margin-top:16px">Место — когда есть куда пойти, но не с кем.<br>Версия 2.0 · Тюмень</p></div>'''
S["settings"] = S["settings"].replace(f'<span class="si">{I("more")}</span>', f'<span class="si">{DOC_I}</span>')
S["me"] = S["me"].replace('data-toast="Редактировать · Подписка · Поддержка · Выйти"', 'data-go="settings"')

# consent checkboxes in the form; remove peek there
S["reg1"] = _re.sub(r'<div class="peek r".*?</div></div>\n', '', S["reg1"], count=1, flags=_re.S)
S["reg1"] = S["reg1"].replace('<div class="cnt" id="bioCnt">0 / 300</div></div>',
  '<div class="cnt" id="bioCnt">0 / 300</div>'
  f'<button class="agree pr" data-agree><span class="cb">{CHK}</span><span>Принимаю условия <a data-go="doc_offer">оферты</a> и <a data-go="doc_privacy">политики конфиденциальности</a>, мне есть 18 лет</span></button>'
  f'<button class="agree pr" data-agree><span class="cb">{CHK}</span><span>Даю <a data-go="doc_consent">согласие на обработку персональных данных</a></span></button></div>')
S["auth"] = S["auth"].replace('<p class="legal">В мини‑приложении Telegram вход происходит сам. Apple и почта — в приложении для iPhone и Android.</p>',
  '<p class="legal">В мини‑приложении Telegram вход происходит сам. Условия — в <a data-go="doc_offer">оферте</a> и <a data-go="doc_privacy">политике</a>.</p>')

# map: clusters when zoomed out, pins when zoomed in (like the app)
CL = [(36, 34, 3, [0, 1]), (52, 66, 4, [3, 4])]
S["map"] = S["map"].replace('<span class="medot" style="left:46%;top:50%"></span></div>',
  '<span class="medot" style="left:46%;top:50%"></span>' + "".join(f'<button class="clu pr" data-clu style="left:{x}%;top:{y}%">{n}</button>' for x, y, n, _ in CL) + '</div>'
  f'<div class="zoom g"><button class="pr" data-zoom="1" aria-label="Приблизить">+</button><button class="pr" data-zoom="-1" aria-label="Отдалить">–</button></div>')
S["map"] = S["map"].replace('<div class="map" style="position:absolute;inset:0">', '<div class="map far" id="mapL" style="position:absolute;inset:0">', 1)

FLOW2.extend([("settings", "Настройки"), ("doc_offer", "Оферта"), ("doc_privacy", "Политика"), ("doc_consent", "Согласие")])

LEGAL_HTML = '''<section class="b" id="legal"><div class="eyebrow">Документы</div><h2 class="bt">Юридический <em>пакет</em></h2>
<p class="lead">Документы переносим как есть: те же тексты и редакция от 20 октября 2026 г. Меняется только оформление. В прототипе они открываются из анкеты (две галочки), со страницы входа и из «Настроек → Документы».</p>
<div class="panel"><ul class="mech">
<li class="y"><i>✓</i>Публичная оферта · 7 разделов · реквизиты ИП</li><li class="y"><i>✓</i>Политика конфиденциальности · 10 разделов · хранение в Yandex Cloud (РФ)</li><li class="y"><i>✓</i>Согласие на обработку персональных данных · 6 разделов</li><li class="y"><i>✓</i>Удаление аккаунта в настройках — как обещано в документах</li></ul></div>
<div class="panel" style="margin-top:12px"><b style="font:500 16px var(--disp)">Что стоит показать юристу</b>
<p class="lead" style="margin:6px 0 10px">Я не юрист. Это места, где тексты, на мой взгляд, расходятся с тем, как сервис работает сейчас.</p><ul class="mech">
<li class="n"><i>1</i>Согласие на обработку данных сейчас идёт одной галочкой вместе с офертой. С 1 сентября 2025 года закон требует, чтобы согласие было отдельным документом. В прототипе я сделал вторую галочку.</li>
<li class="n"><i>2</i>Оферта начинается словами «мини‑приложение «МЕСТО»», а в п. 3.3 говорится только о данных из Telegram. Сейчас есть ещё приложение для iPhone и Android и вход через Apple и почту.</li>
<li class="n"><i>3</i>П. 4.2: «подписка не продлевается автоматически». Если в App Store подписка продлевается сама, это нужно отразить.</li>
<li class="n"><i>4</i>Бизнес‑события, билеты (оплата организатору напрямую) и разовое «В популярное» за 149 ₽ в оферте почти не описаны. Не прописано, кто отвечает за событие и как работают возвраты по билетам.</li>
<li class="n"><i>5</i>Отдельных «Правил сообщества» нет: что запрещено, как работают жалобы и блокировки. App Store и Google Play обычно их ждут у сервисов знакомств и встреч.</li>
<li class="n"><i>6</i>ИИ‑подбор интересов по «о себе» и ИИ‑помощник лучше упомянуть в политике в целях обработки.</li></ul></div></section>'''

# "Другое": interests and filters
S["reg2"] = S["reg2"].replace('<div class="foot">', '', 0)
_other = f'<div class="acc"><button class="acch pr" data-acc><b>Ещё</b><span class="k"></span><span class="cv2">{DOWN}</span></button><div class="accb"><div class="igrid"><button class="itile g pr" data-int><span class="ck">{CHK}</span>{C("Другое")}<span class="nm">Другое</span></button></div></div></div>'
S["reg2"] = S["reg2"].replace('</div>\n<div class="foot">', _other + '</div>\n<div class="foot">', 1)
EXTRA_OVS = EXTRA_OVS.replace('Hyrox</button></div>', 'Hyrox</button>'+chip('Другое',attrs='data-tog')+'</div>', 1)
S["allev"] = S["allev"].replace('Hyrox</button></div>', 'Hyrox</button>'+chip('Другое')+'</div>', 1)

# auth: full-bleed blurred photo, centered logo, glass buttons (iPhone style)
S["auth"] = f'''<div class="abg" style="background-image:url(a/auth_bg.webp)"></div><div class="ashade"></div>
<div class="alogo"><img src="a/wordmark-white.svg" alt="место"><p>Найди <em>компанию</em><br>на сегодня</p></div>
<div class="abtns"><small>Через Telegram быстрее всего — имя и фото подтянутся сами</small>
<button class="btn aw pr" data-go="reg1">{TG}Войти через Telegram</button>
<button class="btn agl pr" data-go="reg1">{APPLE}Войти с Apple</button>
<button class="btn agl pr" data-toast="Код придёт на почту">{MAIL}Войти по почте</button>
<p class="alegal">Продолжая, вы принимаете <a data-go="doc_offer">оферту</a> и <a data-go="doc_privacy">политику конфиденциальности</a></p></div>'''

S["map"] = S["map"].replace('class="pin pr" data-mk="2"', 'class="pin pr solo" data-mk="2"')

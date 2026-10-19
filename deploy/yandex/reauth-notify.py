#!/usr/bin/env python3
"""Письмо от бота тем, кто зарегистрировался в старой базе уже после переезда.

Вход: в stdin строки «telegram_id<TAB>имя» (из старой базы), в argv[1] — файл с telegram_id,
которые уже есть в базе сервера (им не пишем). Токен и адрес Telegram — из переменных окружения.
Печатает только имена и результат — без ID.
"""
import json, os, sys, time, urllib.request

TOKEN = os.environ["TG_TOKEN"]
ROOT = os.environ.get("TG_ROOT", "https://api.telegram.org").rstrip("/")
existing = {l.strip() for l in open(sys.argv[1]) if l.strip()}
TEXT = (
    "Привет! Это «Место» 💜\n\n"
    "Мы переехали на новый сервер в России — теперь приложение открывается быстрее у всех.\n\n"
    "Твоя регистрация попала на старый сервер, поэтому, пожалуйста, зайди ещё раз по кнопке ниже — "
    "это займёт минуту. После этого увидишь все встречи в своём городе, и тебя будут видеть другие.\n\n"
    "Извини за неудобство 🙏"
)
KB = {"inline_keyboard": [[{"text": "Открыть Место", "web_app": {"url": "https://mesto-go.ru"}}]]}

for line in sys.stdin:
    parts = line.rstrip("\n").split("\t")
    if len(parts) < 2 or not parts[0].strip():
        continue
    tg, name = parts[0].strip(), parts[1].strip()
    if tg in existing:
        print(f"{name}: уже есть на сервере — не пишем")
        continue
    body = json.dumps({"chat_id": int(tg), "text": TEXT, "reply_markup": KB}).encode()
    req = urllib.request.Request(f"{ROOT}/bot{TOKEN}/sendMessage", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            ok = json.load(r).get("ok")
        print(f"{name}: {'отправлено' if ok else 'не отправлено'}")
    except Exception as e:  # noqa: BLE001
        msg = getattr(e, "read", lambda: b"")().decode(errors="ignore")[:120]
        print(f"{name}: ошибка {getattr(e, 'code', '')} {msg}")
    time.sleep(0.3)

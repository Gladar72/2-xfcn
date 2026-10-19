#!/usr/bin/env python3
"""Сколько людей заблокировали бота. Telegram не даёт такого списка, поэтому проверяем
каждого «тихим» запросом sendChatAction (статус «печатает» на пару секунд, без сообщения):
заблокировавшим он возвращает 403. Печатает только числа — без ID и имён."""
import json, os, sys, time, urllib.request, urllib.error

TOKEN = os.environ["TG_TOKEN"]
ROOT = os.environ.get("TG_ROOT", "https://api.telegram.org").rstrip("/")
ids = [l.strip() for l in sys.stdin if l.strip()]
ok = blocked = other = 0
for tg in ids:
    body = json.dumps({"chat_id": int(tg), "action": "typing"}).encode()
    req = urllib.request.Request(f"{ROOT}/bot{TOKEN}/sendChatAction", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            ok += 1 if json.load(r).get("ok") else 0
    except urllib.error.HTTPError as e:
        d = e.read().decode(errors="ignore")
        if e.code == 403:
            blocked += 1
        elif e.code == 429:
            time.sleep(5); other += 1
        else:
            other += 1
    except Exception:
        other += 1
    time.sleep(0.06)
print(f"всего с Telegram: {len(ids)}")
print(f"бот доступен: {ok}")
print(f"заблокировали бота (или удалили аккаунт): {blocked}")
print(f"не удалось проверить: {other}")

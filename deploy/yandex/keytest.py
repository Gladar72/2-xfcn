#!/usr/bin/env python3
"""Живая проверка внешних ключей «Места»: делает по одному безвредному запросу
в каждый сервис и печатает только «работает / ошибка». Значения ключей не выводятся.

Запуск на сервере: python3 keytest.py /opt/mesto/.env /opt/mesto/app
"""
import base64, datetime, hashlib, hmac, json, sys, urllib.error, urllib.request, uuid

ENV_PATH = sys.argv[1] if len(sys.argv) > 1 else "/opt/mesto/.env"
APP_DIR = sys.argv[2] if len(sys.argv) > 2 else "/opt/mesto/app"


def load_env(path):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


E = load_env(ENV_PATH)
SECRETS = [v for v in E.values() if len(v) >= 8]


def clean(text):
    """Обрезаем ответ и на всякий случай вырезаем любые значения из .env."""
    text = (text or "").replace("\n", " ")[:200]
    for s in SECRETS:
        text = text.replace(s, "***")
    return text


def req(url, data=None, headers=None, method=None, timeout=20):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # сеть, таймаут
        return 0, type(e).__name__ + ": " + str(e)


results = []


def report(name, ok, note=""):
    mark = "РАБОТАЕТ" if ok else ("ПРОПУЩЕН" if ok is None else "ОШИБКА")
    line = f"{name}: {mark}" + (f" — {clean(note)}" if note else "")
    results.append((name, ok))
    print(line, flush=True)


# 1. YandexGPT — один короткий вопрос.
def test_gpt():
    key, folder = E.get("YANDEX_GPT_API_KEY"), E.get("YANDEX_FOLDER_ID")
    if not key or not folder:
        return report("YandexGPT", None, "ключ или каталог не заданы")
    model = E.get("YANDEX_GPT_MODEL") or "yandexgpt-lite/latest"
    body = json.dumps({
        "modelUri": f"gpt://{folder}/{model}",
        "completionOptions": {"stream": False, "temperature": 0, "maxTokens": "10"},
        "messages": [{"role": "user", "text": "Ответь одним словом: работает"}],
    }).encode()
    code, text = req("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", body,
                     {"Content-Type": "application/json", "Authorization": f"Api-Key {key}", "x-folder-id": folder})
    if code == 200:
        try:
            answer = json.loads(text)["result"]["alternatives"][0]["message"]["text"].strip()
        except Exception:
            answer = ""
        report("YandexGPT", True, f"ответ модели: «{answer[:40]}»")
    else:
        report("YandexGPT", False, f"HTTP {code}: {text}")


# 2. Postbox — подписанный запрос «список доменов» (письма не отправляются).
def test_postbox():
    kid, sec = E.get("POSTBOX_ACCESS_KEY_ID"), E.get("POSTBOX_SECRET_KEY")
    if not kid or not sec:
        return report("Postbox (почта)", None, "ключи не заданы")
    host, region, service, path = "postbox.cloud.yandex.net", "ru-central1", "ses", "/v2/email/identities"
    now = datetime.datetime.now(datetime.timezone.utc)
    amz = now.strftime("%Y%m%dT%H%M%SZ")
    day = amz[:8]
    payload_hash = hashlib.sha256(b"").hexdigest()
    canon_headers = f"host:{host}\nx-amz-date:{amz}\n"
    signed = "host;x-amz-date"
    canon = "\n".join(["GET", path, "", canon_headers, signed, payload_hash])
    scope = f"{day}/{region}/{service}/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canon.encode()).hexdigest()])
    k = hmac.new(f"AWS4{sec}".encode(), day.encode(), hashlib.sha256).digest()
    for part in (region, service, "aws4_request"):
        k = hmac.new(k, part.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    auth = f"AWS4-HMAC-SHA256 Credential={kid}/{scope}, SignedHeaders={signed}, Signature={sig}"
    code, text = req(f"https://{host}{path}", headers={"Host": host, "X-Amz-Date": amz, "Authorization": auth})
    if code == 200:
        try:
            names = [i.get("IdentityName") for i in json.loads(text).get("EmailIdentities", [])]
        except Exception:
            names = []
        report("Postbox (почта)", True, "домены: " + (", ".join(n for n in names if n) or "—"))
    elif code == 403 and "Signature" not in text and "InvalidClientTokenId" not in text:
        # Ключ принят, просто у роли postbox.sender нет права смотреть список — отправка разрешена.
        report("Postbox (почта)", True, "ключ принят (прав на просмотр списка нет — для отправки не нужно)")
    else:
        report("Postbox (почта)", False, f"HTTP {code}: {text}")


# 3. Модерация фото на своём сервере (NudeNet): логотип «Места» должен пройти.
def test_moderation():
    try:
        with open(f"{APP_DIR}/public/brand/logo/app-icon.png", "rb") as f:
            img = f.read()
    except OSError as e:
        return report("Модерация фото (свой сервер)", False, f"нет тестовой картинки: {e}")
    code, text = req("http://127.0.0.1:8090/check", img, {"Content-Type": "image/png"})
    try:
        d = json.loads(text)
    except Exception:
        d = {}
    if code == 200 and d.get("safe") is True:
        report("Модерация фото (свой сервер)", True, "логотип прошёл проверку")
    else:
        report("Модерация фото (свой сервер)", False, f"HTTP {code}: {str(text)[:200]}")


# 4. ЮKassa — данные магазина (GET /v3/me, ничего не создаёт).
def test_yookassa():
    shop, sec = E.get("YOOKASSA_SHOP_ID"), E.get("YOOKASSA_SECRET_KEY")
    if not shop or not sec:
        return report("ЮKassa", None, "ключи не заданы")
    token = base64.b64encode(f"{shop}:{sec}".encode()).decode()
    code, text = req("https://api.yookassa.ru/v3/me", headers={"Authorization": f"Basic {token}"})
    if code == 200:
        try:
            d = json.loads(text)
            note = f"магазин {d.get('account_id')}, статус {d.get('status')}, тестовый: {d.get('test')}"
        except Exception:
            note = ""
        report("ЮKassa", True, note)
    else:
        report("ЮKassa", False, f"HTTP {code}: {text}")


# 5. Геокодер OpenStreetMap (ключ не нужен) — доступен ли он с сервера.
def test_geocoder():
    from urllib.parse import quote
    ua = {"User-Agent": "MestoApp/1.0 (https://mesto-go.ru; t.me/Mesto_people_bot)"}
    code, text = req(f"https://photon.komoot.io/api/?q={quote('Тюмень, улица Республики 65')}&limit=1&lang=default", headers=ua)
    ok1 = code == 200 and '"features":[{' in text.replace(" ", "")
    report("Геокодер OSM: поиск адреса (Photon)", ok1, "" if ok1 else f"HTTP {code}: {text}")
    code, text = req("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=ru&lat=57.153&lon=65.534", headers=ua)
    ok2 = code == 200 and '"address"' in text
    report("Геокодер OSM: адрес по точке (Nominatim)", ok2, "" if ok2 else f"HTTP {code}: {text}")


for t in (test_gpt, test_postbox, test_moderation, test_yookassa, test_geocoder):
    try:
        t()
    except Exception as e:
        report(t.__name__, False, f"сбой проверки: {type(e).__name__}")

bad = [n for n, ok in results if ok is False]
print("ИТОГ:", "всё работает" if not bad else "не работает — " + ", ".join(bad))

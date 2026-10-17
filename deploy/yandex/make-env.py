#!/usr/bin/env python3
"""
Собирает /opt/mesto/.env на сервере. Секреты, которые можно создать на месте,
сервер создаёт сам (один раз), чтобы их не нужно было никуда копировать вручную:
  SUPABASE_JWT_SECRET, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  CRON_SECRET, TELEGRAM_WEBHOOK_SECRET.
Из GitHub приходит только /opt/mesto/inputs.env: токен бота, ID админов и (по желанию)
дополнительные строки KEY=value из секрета YC_APP_ENV (ЮKassa, Карты, почта и т.д.).

Порядок: значения по умолчанию < уже сохранённый .env < inputs.env (непустые значения).
Запуск: python3 make-env.py /opt/mesto/.env /opt/mesto/inputs.env
"""
import base64, hashlib, hmac, json, os, secrets, string, sys, time

env_path, inputs_path = sys.argv[1], sys.argv[2]

DEFAULTS = {
    "APP_URL": "https://mesto-go.ru",
    "NEXT_PUBLIC_SUPABASE_URL": "https://db.mesto-go.ru",
    "API_HOST": "db.mesto-go.ru",
    "APP_HOSTS": "new.mesto-go.ru",
    "ACME_EMAIL": "",
    "CRON_ENABLED": "0",
    # api.telegram.org из России недоступен — бот ходит в Telegram через прокладку на Vercel.
    "TELEGRAM_API_ROOT": "https://2-xfcn.vercel.app/api/telegram/relay",
    "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME": "Mesto_people_bot",
    "YANDEX_GPT_MODEL": "yandexgpt-lite",
    "MAIL_FROM_NAME": "МЕСТО",
}


def read(path):
    out = {}
    if not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.split(" #", 1)[0].strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def rand(n):
    abc = string.ascii_letters + string.digits
    return "".join(secrets.choice(abc) for _ in range(n))


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def jwt(role, secret):
    now = int(time.time())
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64(json.dumps({"role": role, "iss": "supabase", "iat": now, "exp": now + 10 * 365 * 86400},
                          separators=(",", ":")).encode())
    sig = b64(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


env = dict(DEFAULTS)
env.update(read(env_path))
for k, v in read(inputs_path).items():
    if v:
        env[k] = v

if not env.get("SUPABASE_JWT_SECRET"):
    env["SUPABASE_JWT_SECRET"] = rand(48)
    # ключи подписываются этим секретом — при новом секрете перевыпускаем и их
    env.pop("NEXT_PUBLIC_SUPABASE_ANON_KEY", None)
    env.pop("SUPABASE_SERVICE_ROLE_KEY", None)
if not env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"):
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = jwt("anon", env["SUPABASE_JWT_SECRET"])
if not env.get("SUPABASE_SERVICE_ROLE_KEY"):
    env["SUPABASE_SERVICE_ROLE_KEY"] = jwt("service_role", env["SUPABASE_JWT_SECRET"])
for k in ("CRON_SECRET", "TELEGRAM_WEBHOOK_SECRET"):
    if not env.get(k):
        env[k] = rand(40)

missing = [k for k in ("TELEGRAM_BOT_TOKEN",) if not env.get(k)]

old = os.umask(0o077)
with open(env_path + ".tmp", "w", encoding="utf-8") as f:
    for k in sorted(env):
        f.write(f"{k}={env[k]}\n")
os.replace(env_path + ".tmp", env_path)
os.umask(old)

print(f".env: {len(env)} keys" + (f"; НЕ ХВАТАЕТ: {', '.join(missing)}" if missing else ""))

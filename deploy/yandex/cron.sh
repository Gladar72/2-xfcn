#!/usr/bin/env bash
# Вызов фоновой задачи сайта с CRON_SECRET (как это делал Vercel Cron).
# Пока сервер не основной (CRON_ENABLED != 1 в /opt/mesto/.env) — ничего не делает,
# чтобы напоминания не уходили дважды (с Vercel и отсюда).
set -euo pipefail
ENV=/opt/mesto/.env
[ "$(grep -E '^CRON_ENABLED=' "$ENV" | cut -d= -f2- || true)" = "1" ] || exit 0
SECRET=$(grep -E '^CRON_SECRET=' "$ENV" | cut -d= -f2- | tr -d '"')
curl -fsS -m 240 -H "Authorization: Bearer ${SECRET}" "http://127.0.0.1:3000$1" >/dev/null 2>>/opt/mesto/cron.log || echo "$(date -u +%FT%TZ) fail $1" >>/opt/mesto/cron.log

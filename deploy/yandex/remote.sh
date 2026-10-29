#!/usr/bin/env bash
# Управление сервером «Места» в Yandex Cloud. Запускается из GitHub Actions
# (.github/workflows/yandex.yml) по SSH: ssh deploy@host 'bash -s' -- <task> < remote.sh
#   bootstrap — один раз: Docker, swap, код из GitHub
#   supabase  — поднять свой Supabase (база, фото, чат); ключи сервер создаёт сам (make-env.py)
#   migrate   — перенести базу и фото из Supabase Cloud (повторять можно: данные перезаписываются)
#   deploy    — собрать и перезапустить сайт (+ фоновые задачи)
#   status    — что запущено, место на диске, память
#   logs      — последние логи сайта и Supabase
set -euo pipefail
TASK="${1:-status}"
ROOT=/opt/mesto
APP=$ROOT/app
SB=/opt/supabase
OLD_SUPABASE_URL="https://cawrwvafbcmcxsjxgwxi.supabase.co"
log() { echo "==> $*"; }
envget() { grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DC() { sudo docker compose "$@"; }

bootstrap() {
  log "packages"
  sudo apt-get update -y -q
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io docker-compose-v2 git python3-yaml curl jq cron
  sudo mkdir -p /etc/docker
  # Docker Hub из России работает с перебоями — тянем образы через зеркала.
  echo '{"registry-mirrors":["https://mirror.gcr.io","https://dockerhub.timeweb.cloud"],"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl enable --now docker cron
  sudo systemctl restart docker
  if ! sudo swapon --show | grep -q .; then
    log "swap 2G"
    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
  sudo mkdir -p "$ROOT" /opt/backups && sudo chown -R "$USER" "$ROOT" /opt/backups
  [ -d "$APP/.git" ] || git clone --depth 1 https://github.com/Gladar72/2-xfcn.git "$APP"
  log "done: $(sudo docker --version), $(sudo docker compose version)"
}

# .env собирается на сервере: свои ключи + то, что пришло из GitHub (inputs.env).
prepare_env() {
  update_code
  python3 "$APP/deploy/yandex/make-env.py" "$ROOT/.env" "$ROOT/inputs.env"
  rm -f "$ROOT/inputs.env"
}

update_code() {
  cd "$APP"
  git fetch --depth 1 origin main -q
  git reset --hard -q origin/main
  log "code at $(git log --oneline -1)"
}

setenv() { # setenv FILE KEY VALUE — заменить или добавить строку KEY=VALUE
  local f="$1" k="$2" v="$3"
  if grep -qE "^$k=" "$f"; then
    python3 - "$f" "$k" "$v" <<'PY'
import sys
f, k, v = sys.argv[1:]
lines = open(f).read().splitlines()
lines = [f"{k}={v}" if l.startswith(k + "=") else l for l in lines]
open(f, "w").write("\n".join(lines) + "\n")
PY
  else
    echo "$k=$v" >>"$f"
  fi
}
rand() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }

supabase() {
  prepare_env
  if [ ! -d "$SB/.git" ]; then
    log "clone supabase/docker"
    sudo mkdir -p "$SB" && sudo chown "$USER" "$SB"
    git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase "$SB"
    (cd "$SB" && git sparse-checkout set docker)
  fi
  cd "$SB/docker"
  [ -f .env ] || cp .env.example .env
  [ -f docker-compose.yml.orig ] || cp docker-compose.yml docker-compose.yml.orig
  cp docker-compose.yml.orig docker-compose.yml
  python3 "$APP/deploy/yandex/slim-supabase.py" docker-compose.yml
  # Те же ключи, что у Supabase Cloud: приложению меняется только адрес.
  setenv .env JWT_SECRET "$(envget SUPABASE_JWT_SECRET)"
  setenv .env ANON_KEY "$(envget NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  setenv .env SERVICE_ROLE_KEY "$(envget SUPABASE_SERVICE_ROLE_KEY)"
  local api; api="https://$(envget API_HOST)"
  setenv .env API_EXTERNAL_URL "$api"
  setenv .env SUPABASE_PUBLIC_URL "$api"
  setenv .env SITE_URL "$(envget APP_URL)"
  # Свои внутренние пароли — генерируем один раз и храним в .env на сервере.
  if [ ! -f .generated ]; then
    setenv .env POSTGRES_PASSWORD "$(rand 32)"
    setenv .env DASHBOARD_PASSWORD "$(rand 24)"
    setenv .env SECRET_KEY_BASE "$(rand 64)"
    setenv .env VAULT_ENC_KEY "$(rand 32)"
    setenv .env PG_META_CRYPTO_KEY "$(rand 32)"
    setenv .env LOGFLARE_PUBLIC_ACCESS_TOKEN "$(rand 32)"
    setenv .env LOGFLARE_PRIVATE_ACCESS_TOKEN "$(rand 32)"
    touch .generated
  fi
  chmod 600 .env
  log "supabase up"
  DC pull -q || true
  DC up -d
  sleep 15
  DC ps
}

migrate() {
  prepare_env
  local OLD_DB_URL; OLD_DB_URL="$(grep -E '^OLD_DB_URL=' "$ROOT/migrate.env" | cut -d= -f2-)"
  [ -n "$OLD_DB_URL" ] || { echo "нет OLD_DB_URL в $ROOT/migrate.env"; exit 1; }
  mkdir -p "$ROOT/migrate"
  log "dump public schema from Supabase Cloud"
  sudo docker run --rm -e PGCONNECT_TIMEOUT=20 postgres:17 \
    pg_dump "$OLD_DB_URL" --schema=public --no-owner --no-comments >"$ROOT/migrate/public.sql"
  log "dump size: $(du -h "$ROOT/migrate/public.sql" | cut -f1)"
  log "restore into own Supabase"
  sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
SQL
  # Строки, которых нет в PostgreSQL 15 (transaction_timeout и т.п.), пропускаем — данные от этого не зависят.
  grep -v -E '^SET transaction_timeout' "$ROOT/migrate/public.sql" |
    sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 2>"$ROOT/migrate/restore-errors.log" || true
  log "restore warnings: $(grep -c ERROR "$ROOT/migrate/restore-errors.log" || true) (см. $ROOT/migrate/restore-errors.log)"
  grep ERROR "$ROOT/migrate/restore-errors.log" | head -20 || true
  sudo docker exec supabase-db psql -U postgres -d postgres -tAc "NOTIFY pgrst, 'reload schema'" >/dev/null || true
  sudo docker exec supabase-db psql -U postgres -d postgres -tAc \
    "select 'users='||(select count(*) from public.users)||' events='||(select count(*) from public.events)||' messages='||(select count(*) from public.messages)"
  log "list storage files in Supabase Cloud"
  sudo docker run --rm -e PGCONNECT_TIMEOUT=20 postgres:17 psql "$OLD_DB_URL" -tAc \
    "select coalesce(json_agg(json_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)),'[]') from storage.buckets" \
    >"$ROOT/migrate/buckets.json"
  sudo docker run --rm -e PGCONNECT_TIMEOUT=20 postgres:17 psql "$OLD_DB_URL" -tA -F $'\t' -c \
    "select bucket_id, name, coalesce(metadata->>'mimetype','') from storage.objects where name not like '%/.emptyFolderPlaceholder' order by 1,2" \
    >"$ROOT/migrate/files.tsv"
  log "copy storage files ($(wc -l <"$ROOT/migrate/files.tsv"))"
  sudo docker run --rm --network host -v "$APP/deploy/yandex:/w:ro" -v "$ROOT/migrate:/m:ro" \
    -e SERVICE_ROLE_KEY="$(envget SUPABASE_SERVICE_ROLE_KEY)" node:20-bookworm-slim \
    node /w/copy-storage.mjs "$OLD_SUPABASE_URL" "http://127.0.0.1:8000" /m/buckets.json /m/files.tsv
  log "rewrite photo URLs"
  { echo "SET mesto.old = '$OLD_SUPABASE_URL/storage/v1/'; SET mesto.new = 'https://$(envget API_HOST)/storage/v1/';"; cat "$APP/deploy/yandex/rewrite-urls.sql"; } |
    sudo docker exec -i supabase-db psql -U postgres -d postgres -q
}

# Докопировать файлы, которые не перенеслись при migrate (база не трогается).
storagefix() {
  update_code
  [ -s "$ROOT/migrate/files.tsv" ] || { echo "нет списка файлов $ROOT/migrate/files.tsv — сначала migrate"; exit 1; }
  log "copy missing storage files"
  sudo docker run --rm --network host -v "$APP/deploy/yandex:/w:ro" -v "$ROOT/migrate:/m:ro" \
    -e ONLY_MISSING=1 -e SERVICE_ROLE_KEY="$(envget SUPABASE_SERVICE_ROLE_KEY)" node:20-bookworm-slim \
    node /w/copy-storage.mjs "$OLD_SUPABASE_URL" "http://127.0.0.1:8000" /m/buckets.json /m/files.tsv
}

deploy() {
  prepare_env
  cd "$APP/deploy/yandex"
  # Caddy (HTTPS для db.mesto-go.ru) поднимаем до сборки: при сборке страницы читают базу.
  log "start caddy"
  DC --env-file "$ROOT/.env" -f docker-compose.yml up -d caddy
  DC --env-file "$ROOT/.env" -f docker-compose.yml restart caddy  # перечитать Caddyfile
  sleep 10
  # Защита от дублей уведомлений (идемпотентно, ошибки не мешают деплою).
  log "notification guards"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0066_notifications_once_guards_v3.sql" || true
  # Учёт блокировок бота (идемпотентно).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0067_bot_blocks.sql" || true
  # Удаление аккаунта: платежи и жалобы не мешают удалению (идемпотентно).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0068_account_deletion.sql" || true
  # Подборка мест «Мося рекомендует» (таблица + сид, идемпотентно).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0069_place_picks.sql" || true
  [ -f "$APP/deploy/yandex/place-picks.sql" ] && sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/deploy/yandex/place-picks.sql" || true
  # «В популярное сегодня»: продвижения и разовые платежи (идемпотентно).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0070_promotions.sql" || true
  # Подарок «Старт» по ссылке из директа Инстаграма.
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0071_gift_direct.sql" || true
  # Разовые рассылки от бота (кому уже ушло).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0072_broadcasts.sql" || true
  # Анонсы новых встреч: можно отключить кнопкой (идемпотентно).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0073_event_announcements.sql" || true
  # Раздел бизнес-события (Бары, Вечеринки и клубы…) + раскладка старых событий (идемпотентно).
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 \
    < "$APP/supabase/migrations/0074_biz_category.sql" || true
  log "build & start app"
  DC --env-file "$ROOT/.env" -f docker-compose.yml up -d --build
  crontab "$APP/deploy/yandex/crontab"
  cleanup
  sleep 5
  curl -fsS -o /dev/null -w "local app: %{http_code}\n" http://127.0.0.1:3000/ || true
}

# Чистка Docker: старые образы и кэш сборки съедают диск (каждый деплой — +1–2 ГБ).
# Тома с базой и файлами не трогаем.
cleanup() {
  # Если диск увеличили в Яндекс Облаке — растягиваем раздел и файловую систему (без перезагрузки).
  local src fs disk part
  read -r src fs < <(findmnt -no SOURCE,FSTYPE /)
  disk="/dev/$(lsblk -no PKNAME "$src")"; part="$(cat /sys/class/block/$(basename "$src")/partition 2>/dev/null)"
  if [ -n "$part" ] && sudo growpart "$disk" "$part" >/dev/null 2>&1; then
    if [ "$fs" = xfs ]; then sudo xfs_growfs / >/dev/null; else sudo resize2fs "$src" >/dev/null 2>&1; fi
    echo "раздел растянут на весь диск"
  fi
  df -h / | tail -1 | awk '{print "диск до чистки: занято "$3" из "$2" ("$5")"}'
  sudo docker image prune -af >/dev/null 2>&1 || true
  sudo docker builder prune -af --filter until=48h >/dev/null 2>&1 || true
  sudo journalctl --vacuum-size=200M >/dev/null 2>&1 || true
  df -h / | tail -1 | awk '{print "диск после чистки: занято "$3" из "$2" ("$5")"}'
}

status() {
  echo "--- система: $(. /etc/os-release; echo "$PRETTY_NAME"), ядро $(uname -r), $(uptime -p)"
  [ -f /var/run/reboot-required ] && echo "нужна перезагрузка после обновлений" || true
  echo "обновлений доступно: $(apt list --upgradable 2>/dev/null | grep -c upgradable || true), из них безопасности: $(apt list --upgradable 2>/dev/null | grep -c -- -security || true)"
  echo "docker: $(sudo docker --version 2>/dev/null)"
  sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  df -h / | tail -1
  free -m | head -3
  echo "--- диск: устройство, CPU, что занимает место"
  lsblk -d -o NAME,SIZE,TYPE | grep -v loop || true
  echo "CPU: $(nproc), нагрузка: $(cut -d' ' -f1-3 /proc/loadavg)"
  sudo du -sh /var/lib/docker /opt/backups /opt/mesto /var/log 2>/dev/null || true
  sudo docker system df 2>/dev/null || true
  sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' 2>/dev/null | head -20 || true
  local UA="Mozilla/5.0 (status check)"
  curl -sS -A "$UA" -o /dev/null -w "app: %{http_code}\n" http://127.0.0.1:3000/ || echo "app: down"
  for h in $(envget APP_HOSTS | tr ',' ' ') $(envget API_HOST); do
    curl -sS -A "$UA" -o /dev/null -m 15 --resolve "$h:443:127.0.0.1" -w "https $h: %{http_code}\n" "https://$h/" || echo "https $h: fail"
  done
  echo "--- caddy"; sudo docker logs --tail 15 mesto-caddy-1 2>&1 | cut -c1-300 || true
  curl -fsS -o /dev/null -w "supabase rest: %{http_code}\n" -H "apikey: $(envget NEXT_PUBLIC_SUPABASE_ANON_KEY)" http://127.0.0.1:8000/rest/v1/categories?select=slug\&limit=1 || echo "supabase: down"
  tail -5 "$ROOT/cron.log" 2>/dev/null || true
}

logs() {
  sudo docker logs --tail 80 mesto-app-1 2>&1 | tail -80 || true
  for c in supabase-kong supabase-rest supabase-storage realtime-dev.supabase-realtime supabase-db; do
    echo "--- $c"; sudo docker logs --tail 25 "$c" 2>&1 | tail -25 || true
  done
}

# Какие ключи заданы на сервере. Значения не выводятся — только «задан/пусто».
envcheck() {
  prepare_env
  local k v
  for k in YOOKASSA_SHOP_ID YOOKASSA_SECRET_KEY APP_URL TELEGRAM_API_ROOT CRON_ENABLED TELEGRAM_BOT_TOKEN \
    NEXT_PUBLIC_YANDEX_MAPS_API_KEY YANDEX_GEOCODER_API_KEY YANDEX_PLACES_API_KEY YANDEX_GPT_API_KEY YANDEX_FOLDER_ID \
    BREVO_API_KEY POSTBOX_ACCESS_KEY_ID POSTBOX_SECRET_KEY MAIL_FROM SMSRU_API_ID SIGHTENGINE_API_USER SIGHTENGINE_API_SECRET \
    APPLE_IAP_ISSUER_ID APPLE_IAP_KEY_ID APPLE_IAP_PRIVATE_KEY EXPO_ACCESS_TOKEN RUSTORE_PUSH_PROJECT_ID RUSTORE_PUSH_SERVICE_TOKEN; do
    v=$(envget "$k" || true)
    if [ -z "$v" ]; then echo "$k: пусто"
    elif [ "$k" = YOOKASSA_SHOP_ID ]; then
      # ShopID — только цифры. Если там что-то другое (например, секретный ключ) — не печатаем.
      if [[ "$v" =~ ^[0-9]+$ ]]; then echo "$k: $v"; else echo "$k: ОШИБКА — это не ShopID (должны быть только цифры)"; fi
    elif [ "$k" = APP_URL ] || [ "$k" = TELEGRAM_API_ROOT ] || [ "$k" = CRON_ENABLED ]; then echo "$k: $v"
    else echo "$k: задан"; fi
  done
  echo "--- все ключи в .env (только имена):"
  grep -oE '^[A-Z0-9_]+=' "$ROOT/.env" | tr -d '=' | sort | tr '\n' ' '; echo
}

# Живая проверка ключей: по одному безвредному запросу в GPT, Postbox, модерацию фото, ЮKassa, геокодер.
# Печатает только «работает / ошибка», значения ключей не выводятся.
keytest() {
  prepare_env
  python3 "$APP/deploy/yandex/keytest.py" "$ROOT/.env" "$APP"
}

# Сводка о состоянии сервера — та же, что каждое утро приходит админам в бота.
# Отчёт по блокировкам бота: после каких сообщений блокируют (только тексты сообщений и числа).
blocksreport() {
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select count(*) filter (where status='blocked') blocked, count(*) filter (where status='unblocked') unblocked,
           min(at) since from bot_blocks;"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select coalesce(left(last_preview,60),'(бот ещё ничего не присылал)') last_message, count(*) n,
           round(avg(extract(epoch from at - last_sent_at)/3600)::numeric,1) hours_after,
           round(avg(extract(epoch from at - user_created_at)/86400)::numeric,1) days_since_signup
    from bot_blocks where status='blocked' group by 1 order by 2 desc limit 25;"
}

# Сколько людей заблокировали бота (только числа).
blockedcount() {
  update_code
  sudo docker exec -i supabase-db psql -U postgres -d postgres -tA -c \
    "select telegram_id from users where telegram_id is not null" |
    TG_TOKEN="$(envget TELEGRAM_BOT_TOKEN)" TG_ROOT="$(tgroot)" python3 "$APP/deploy/yandex/blocked-count.py"
}

# Сообщение от бота тем, кто зарегистрировался в старой базе после переезда (один раз, 19.10.2026).
reauthnotify() {
  update_code
  local OLD_DB_URL; OLD_DB_URL="$(grep -E '^OLD_DB_URL=' "$ROOT/migrate.env" | cut -d= -f2-)"
  [ -n "$OLD_DB_URL" ] || { echo "нет OLD_DB_URL"; exit 1; }
  sudo docker exec -i supabase-db psql -U postgres -d postgres -tA -c \
    "select telegram_id from users where telegram_id is not null" > "$ROOT/existing_tg.txt"
  sudo docker run --rm -e PGCONNECT_TIMEOUT=20 postgres:17 psql "$OLD_DB_URL" -tA -F $'\t' -c \
    "select telegram_id, coalesce(name,'') from users where created_at > '2026-10-17 22:30+00' and created_at < '2026-10-19 04:00+00' and telegram_id is not null" |
    TG_TOKEN="$(envget TELEGRAM_BOT_TOKEN)" TG_ROOT="$(tgroot)" python3 "$APP/deploy/yandex/reauth-notify.py" "$ROOT/existing_tg.txt"
  rm -f "$ROOT/existing_tg.txt"
}

# Перенос встреч, созданных в старой базе после переезда (deploy/yandex/restore-events.sql).
restoreevents() {
  update_code
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -v ON_ERROR_STOP=1 < "$APP/deploy/yandex/restore-events.sql"
}

# Диагностика встреч (только чтение): последние встречи в базе сервера и ошибки API при создании.
eventsdiag() {
  log "встречи за 3 дня в базе сервера"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select to_char(e.created_at at time zone 'Asia/Yekaterinburg','DD.MM HH24:MI') created, e.status, e.city,
           e.event_date, e.event_time, left(e.title,30) title, e.is_business, e.latitude is not null as geo,
           e.category_id is not null as cat
    from events e where e.created_at > now() - interval '3 days' order by e.created_at desc limit 40;"
  log "статусы опубликованных будущих встреч по городам"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select city, status, count(*) from events where event_date >= current_date - 1 group by 1,2 order by 3 desc limit 20;"
  log "пользователи: всего / активны за сутки / новые за 2 дня"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -tA -c "
    select count(*), count(*) filter (where last_active_at > now()-interval '1 day'), count(*) filter (where created_at > now()-interval '2 days') from users;"
  log "ошибки приложения за сутки (POST /api/events и 5xx)"
  sudo docker logs --since 24h mesto-app-1 2>&1 | grep -iE "api/events|error|failed" | grep -v "^\s*$" | tail -60 || true
}

bizdiag() {
  log "будущие бизнес-события"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select e.status, e.event_date, e.is_business biz, e.biz_category razdel, left(e.title,30) title
    from events e where e.status='published' and e.event_date >= current_date order by e.event_date limit 25;"
  log "разделы бизнес-событий"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select biz_category, count(*) from events where is_business and event_date >= current_date group by 1 order by 2 desc;
    select left(title,40), biz_category from events where is_business and (title ilike '%бал%' or biz_category='party');" || true
  log "подборка мест по городам"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "select city, category, training_type, count(*) from place_picks group by 1,2,3 order by 1,2,3;" || true
  log "города пользователей (топ-15)"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "select city, count(*) from users group by 1 order by 2 desc limit 15;" || true
  log "события города (Что ещё в городе)"
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "
    select event_date, left(title,40), latitude is not null geo, status from city_events where event_date >= current_date - 1 order by event_date limit 15;" 2>&1 | head -20 || true
  log "API карты заведений по фильтрам"
  for d in "" today tomorrow weekend; do
    echo "--- date=$d"
    curl -s -o /tmp/bm.json -w "http %{http_code}\n" "http://127.0.0.1:3000/api/events/map?city=%D0%A2%D1%8E%D0%BC%D0%B5%D0%BD%D1%8C&business=only&date=$d"; head -c 200 /tmp/bm.json; echo; cat /tmp/bm.json | python3 -c "import sys,json; j=json.load(sys.stdin); [print(i.get('eventDate'), i.get('eventTime'), i.get('isCity',False), i.get('title')[:40]) for i in j.get('items',[])]; print('всего', len(j.get('items',[])), j.get('error',''))" || true
  done
  date; sudo docker exec mesto-app-1 date || true
}

storyshot() {
  # Готовые сторис «Поделиться» с нескольких настоящих встреч — для промо (файлы забирает workflow).
  rm -rf /tmp/storyshot && mkdir -p /tmp/storyshot
  sudo docker exec -i supabase-db psql -U postgres -d postgres -At -c "
    select e.id || '|' || coalesce(c.slug,'x') from events e left join categories c on c.id=e.category_id
    where e.status='published' and e.event_date >= current_date and not coalesce(e.is_business,false)
      and not coalesce(e.is_anonymous,false) and e.photo_url is not null
    order by (c.slug='coffee') desc, (c.slug='training') desc, e.event_date limit 6;" | while IFS='|' read -r id slug; do
    [ -n "$id" ] || continue
    curl -sS -m 60 -o "/tmp/storyshot/${slug}_${id}.png" -w "$slug $id %{http_code} %{size_download}\n" "http://127.0.0.1:3000/api/events/$id/story.png?ig=1" || true
  done
  ls -la /tmp/storyshot
}

promodiag() {
  # «В популярное сегодня»: таблица, ограничения платежей, активные продвижения.
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "\d public.promotions" || true
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.payments'::regclass and contype='c';" || true
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "select city, source, top_from, top_until, ends_at, views, opens from promotions order by created_at desc limit 10;" || true
  curl -s -o /dev/null -w "promotions api (без входа): %{http_code}\n" "http://127.0.0.1:3000/api/promotions?eventId=x" || true
  curl -sS -m 20 -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Telegram" -o /tmp/twa.js -w "tg script: %{http_code}, %{size_download} байт\n" "http://127.0.0.1:3000/tg/telegram-web-app.js" || true
  head -c 200 /tmp/twa.js; echo; grep -c disableVerticalSwipes /tmp/twa.js || true
  curl -sS -m 10 -o /dev/null -w "telegram.org с сервера: %{http_code}\n" https://telegram.org/js/telegram-web-app.js || echo "telegram.org с сервера: недоступен"
}

promofix() {
  # Разово: у Динары оставить одну встречу в «Популярном» (первую по времени продвижения), остальные — снять.
  local Q="sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c"
  $Q "select u.name, e.title, p.source, p.created_at, p.ends_at from promotions p join users u on u.id=p.user_id join events e on e.id=p.event_id where p.ends_at > now() order by u.name, p.created_at;" || true
  $Q "with d as (select p.id, row_number() over (partition by p.user_id order by p.created_at) rn from promotions p join users u on u.id=p.user_id where p.ends_at > now() and u.name ilike 'Динара%') update promotions set ends_at = now(), top_until = least(top_until, now()) where id in (select id from d where rn > 1) returning id;" || true
  $Q "select u.name, e.title, p.created_at, p.ends_at from promotions p join users u on u.id=p.user_id join events e on e.id=p.event_id where p.ends_at > now() order by u.name, p.created_at;" || true
}

bizmove() {
  # Мастер-классы, семинары, платные занятия, созданные как обычная встреча, — в «Для бизнеса».
  # Только предстоящие. Сначала список, потом перенос, потом что стало.
  local Q="sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c"
  local W="e.is_business is not true and e.status in ('published','closed') and e.event_date >= current_date - 1 and (e.title || ' ' || coalesce(e.description,'')) ~* '(мастер[ -]?класс|мастеркласс|воркшоп|workshop|семинар|вебинар|тренинг|обучени|провожу|проведу|научу|стоимость участия|предоплат)'"
  $Q "select e.id, u.name, e.title, e.event_date, e.status from events e join users u on u.id=e.organizer_id where $W order by e.created_at;" || true
  $Q "update events e set is_business = true, is_anonymous = false, category_id = (select id from categories where slug='custom'), business_pricing_type = coalesce(e.business_pricing_type, 'custom'), business_pricing_details = coalesce(e.business_pricing_details, 'Подробности у организатора') where $W returning e.id, e.title;" || true
}

osupdate() {
  # Только обновления безопасности Ubuntu (unattended-upgrade), без смены версии системы.
  sudo apt-get update -qq || true
  sudo unattended-upgrade -v 2>&1 | tail -25 || true
  echo "--- после: обновлений осталось $(apt list --upgradable 2>/dev/null | grep -c upgradable || true), из них безопасности: $(apt list --upgradable 2>/dev/null | grep -c -- -security || true)"
  [ -f /var/run/reboot-required ] && echo "нужна перезагрузка: $(cat /var/run/reboot-required.pkgs 2>/dev/null | tr '\n' ' ')" || echo "перезагрузка не нужна"
  curl -sS -o /dev/null -w "app: %{http_code}\n" http://127.0.0.1:3000/ || echo "app: down"
}

giftdiag() {
  sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "select c.code, c.title, c.plan, c.days, c.open_to_all, c.is_active, (select count(*) from gift_claims g where g.campaign_code=c.code) claims from gift_campaigns c order by c.code;" || true
}

statsdiag() {
  q() { sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -c "$1" || true; }
  echo "## users total / city"; q "select count(*) total, count(*) filter (where telegram_id>0) tg, count(*) filter (where city ilike 'тюмень') tyumen from users;"
  echo "## new users by month"; q "select to_char(date_trunc('month',created_at),'YYYY-MM') m, count(*) from users group by 1 order by 1;"
  echo "## new users by week (last 10)"; q "select to_char(date_trunc('week',created_at),'YYYY-MM-DD') w, count(*) from users where created_at>now()-interval '70 days' group by 1 order by 1;"
  echo "## active (any action: event/member/message)"; q "with a as (select organizer_id u, created_at t from events union all select user_id, joined_at from event_members union all select sender_id, created_at from messages) select count(distinct u) filter (where t>now()-interval '1 day') dau, count(distinct u) filter (where t>now()-interval '7 days') wau, count(distinct u) filter (where t>now()-interval '30 days') mau from a;"
  echo "## events by month"; q "select to_char(date_trunc('month',created_at),'YYYY-MM') m, count(*) events, count(distinct organizer_id) organizers from events group by 1 order by 1;"
  echo "## joins by month"; q "select to_char(date_trunc('month',joined_at),'YYYY-MM') m, count(*) from event_members where role<>'organizer' group by 1 order by 1;"
  echo "## subscriptions"; q "select plan, status, count(*), count(*) filter (where current_period_end>now()) live from subscriptions group by 1,2 order by 1,2;"
  echo "## payments by month"; q "select to_char(date_trunc('month',created_at),'YYYY-MM') m, status, count(*), sum(amount) rub from payments group by 1,2 order by 1,2;"
  echo "## gift claims"; q "select count(*) from gift_claims;"
}

broadcast() {
  # Рассылка от бота: текст и dry (только посчитать) — в deploy/yandex/broadcast/current.json.
  update_code
  sudo docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 < "$APP/supabase/migrations/0072_broadcasts.sql" || true
  curl -sS -m 900 -X POST "http://127.0.0.1:3000/api/cron/broadcast" \
    -H "Authorization: Bearer $(envget CRON_SECRET)" -H "Content-Type: application/json" \
    --data @"$APP/deploy/yandex/broadcast/current.json"; echo
}

health() {
  update_code
  bash "$APP/deploy/yandex/health.sh"
}

# Адрес Telegram Bot API: напрямую из России не открывается, поэтому через прокладку (TELEGRAM_API_ROOT).
tgroot() { local r; r=$(envget TELEGRAM_API_ROOT); echo "${r:-https://api.telegram.org}" | sed 's#/$##'; }

# Проверка связи с Telegram: напрямую и через прокладку. Ничего не меняет.
tgcheck() {
  prepare_env
  local tok root
  tok=$(envget TELEGRAM_BOT_TOKEN); root=$(tgroot)
  [ -n "$tok" ] || { echo "нет TELEGRAM_BOT_TOKEN"; exit 1; }
  log "напрямую api.telegram.org"
  curl -sS -m 10 -o /dev/null -w "http %{http_code}\n" "https://api.telegram.org/" || echo "недоступен"
  log "через прокладку: $root"
  curl -sS -m 20 "$root/bot$tok/getMe" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print("ok:", d.get("ok"), (d.get("result") or {}).get("username", d.get("description","")))' || echo "прокладка не отвечает"
  log "скрипт Mini App с сервера"
  curl -sS -m 20 -o /dev/null -w "http %{http_code}, %{size_download} байт\n" "http://127.0.0.1:3000/tg/telegram-web-app.js" || true
  log "вебхук сейчас (только чтение)"
  curl -sS -m 20 "$root/bot$tok/getWebhookInfo" |
    python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("url:", r.get("url"), "| pending:", r.get("pending_update_count"), "| last_error:", r.get("last_error_message", "-"))' || true
}

# Telegram-вебхук бота → этот сервер (APP_URL). Токен и секрет берутся из /opt/mesto/.env и никуда не выводятся.
webhook() {
  prepare_env
  local tok url sec root
  tok=$(envget TELEGRAM_BOT_TOKEN); sec=$(envget TELEGRAM_WEBHOOK_SECRET); root=$(tgroot)
  url="$(envget APP_URL | sed 's#/$##')/api/telegram/webhook"
  [ -n "$tok" ] || { echo "нет TELEGRAM_BOT_TOKEN"; exit 1; }
  log "setWebhook → $url (через $root)"
  curl -sS -m 30 -X POST "$root/bot$tok/setWebhook" \
    --data-urlencode "url=$url" --data-urlencode "secret_token=$sec" -d drop_pending_updates=false |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print("ok:", d.get("ok"), d.get("description",""))'
  curl -sS -m 30 "$root/bot$tok/getWebhookInfo" |
    python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("url:", r.get("url"), "| pending:", r.get("pending_update_count"), "| last_error:", r.get("last_error_message", "-"))'
  curl -sS -m 30 "$root/bot$tok/getChatMenuButton" |
    python3 -c 'import json,sys; b=json.load(sys.stdin)["result"]; print("menu button:", b.get("type"), (b.get("web_app") or {}).get("url", ""))'
}

case "$TASK" in
  bootstrap | supabase | migrate | deploy | status | logs | webhook | tgcheck | envcheck | eventsdiag | bizdiag | storyshot | promodiag | promofix | bizmove | osupdate | giftdiag | statsdiag | broadcast | restoreevents | reauthnotify | blockedcount | blocksreport | keytest | health | storagefix | cleanup) "$TASK" ;;
  *) echo "unknown task $TASK"; exit 1 ;;
esac

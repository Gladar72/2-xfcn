#!/usr/bin/env bash
# Сводка о состоянии сервера «Места» админам в Telegram-бота (ADMIN_TELEGRAM_IDS).
#   health.sh          — ежедневная сводка (всегда пишет)
#   health.sh --alert  — ежечасная проверка: пишет, только если что-то сломалось
#   health.sh --watch  — ежечасный отчёт для GitHub (watchlog): только итоги, без данных людей
#   В режимах --alert и --watch сервер сам чинит простое: перезапускает упавшее, чистит кэш при нехватке диска.
# Ключи и токены берутся из /opt/mesto/.env и никуда не выводятся.
set -uo pipefail
ENV=/opt/mesto/.env
MODE="${1:-}"
envget() { grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

TOKEN=$(envget TELEGRAM_BOT_TOKEN)
ROOT_API=$(envget TELEGRAM_API_ROOT); ROOT_API="${ROOT_API:-https://api.telegram.org}"; ROOT_API="${ROOT_API%/}"
ADMINS=$(envget ADMIN_TELEGRAM_IDS)
HOST=$(envget APP_URL | sed -E 's#^https?://##; s#/.*$##'); HOST="${HOST:-mesto-go.ru}"
UA="Mozilla/5.0 (mesto health)"

BAD=()   # критичные проблемы — из-за них приходит тревога
WARN=()  # стоит посмотреть, но сайт работает
OK=()
FIXED=() # что сервер исправил сам

# 0. Самолечение (раз в час): упавшие контейнеры, зависшее приложение, переполненный диск.
if [ "$MODE" = "--alert" ] || [ "$MODE" = "--watch" ]; then
  for c in $(sudo docker ps -a --format '{{.Names}} {{.Status}}' | grep -E ' (Exited \([1-9]|Dead|Created)' | awk '{print $1}'); do
    sudo docker start "$c" >/dev/null 2>&1 && FIXED+=("Запустил упавший контейнер $c")
  done
  # Живо, если сайт отдаёт хоть что-то (не 000 и не 5xx) — локально или через HTTPS. 3 попытки за ~1 мин.
  alive=0; codes=""
  for _ in 1 2 3; do
    c1=$(curl -sS -o /dev/null -m 15 -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || true)
    c2=$(curl -sS -o /dev/null -m 15 -w "%{http_code}" --resolve "$HOST:443:127.0.0.1" "https://$HOST/" 2>/dev/null || true)
    codes="$codes ${c1:-000}/${c2:-000}"
    case "${c1:-000}" in [1-4][0-9][0-9]) alive=1 ;; esac
    case "${c2:-000}" in [1-4][0-9][0-9]) alive=1 ;; esac
    [ "$alive" = 1 ] && break
    sleep 20
  done
  echo "проверка жизни приложения:$codes"
  if [ "$alive" = 0 ] && sudo docker ps --format '{{.Names}}' | grep -qx mesto-app-1; then
    sudo docker restart mesto-app-1 >/dev/null 2>&1 && FIXED+=("Приложение не отвечало — перезапустил")
    sleep 20
  fi
  appmem=$(sudo docker stats --no-stream --format '{{.MemUsage}}' mesto-app-1 2>/dev/null | awk '{v=$1; if (v ~ /GiB/) {sub(/GiB/,"",v); v*=1024} else sub(/MiB/,"",v); printf "%d", v}')
  if [ "${appmem:-0}" -gt 1500 ] 2>/dev/null; then
    sudo docker restart mesto-app-1 >/dev/null 2>&1 && FIXED+=("Приложение заняло ${appmem} МБ памяти — перезапустил")
    sleep 20
  fi
  d0=$(df --output=pcent / | tail -1 | tr -dc 0-9)
  if [ "$d0" -ge 80 ] || [ "$(date -u +%H)" = 04 ]; then
    sudo docker image prune -f >/dev/null 2>&1 || true
    sudo docker builder prune -af --filter until=48h >/dev/null 2>&1 || true
    sudo journalctl --vacuum-size=200M >/dev/null 2>&1 || true
    d1=$(df --output=pcent / | tail -1 | tr -dc 0-9)
    [ "$d0" -ge 80 ] && FIXED+=("Почистил кэш Docker и журналы: диск $d0% → $d1%")
  fi
fi

# 1. Сайт снаружи (через HTTPS на этом сервере) и приложение внутри.
code=$(curl -sS -A "$UA" -o /dev/null -m 20 --resolve "$HOST:443:127.0.0.1" -w "%{http_code}" "https://$HOST/" 2>/dev/null || echo 000)
if [ "$code" = 200 ]; then OK+=("Сайт $HOST открывается"); else BAD+=("Сайт $HOST не открывается (код $code)"); fi

# 2. База (Supabase REST).
anon=$(envget NEXT_PUBLIC_SUPABASE_ANON_KEY)
code=$(curl -sS -o /dev/null -m 15 -w "%{http_code}" -H "apikey: $anon" "http://127.0.0.1:8000/rest/v1/categories?select=slug&limit=1" 2>/dev/null || echo 000)
if [ "$code" = 200 ]; then OK+=("База отвечает"); else BAD+=("База не отвечает (код $code)"); fi

# 3. Контейнеры, которые упали или перезапускаются.
down=$(sudo docker ps -a --format '{{.Names}} {{.Status}}' | grep -Ev ' Up ' | grep -Ev 'Exited \(0\)' | awk '{print $1}' | tr '\n' ' ')
restarting=$(sudo docker ps --format '{{.Names}} {{.Status}}' | grep -i restarting | awk '{print $1}' | tr '\n' ' ')
[ -n "$down$restarting" ] && BAD+=("Не работают контейнеры: ${down}${restarting}") || OK+=("Все контейнеры запущены")

# 4. Telegram: прокладка, бот и вебхук.
if [ -n "$TOKEN" ]; then
  me=$(curl -sS -m 20 "$ROOT_API/bot$TOKEN/getMe" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))' 2>/dev/null || echo False)
  if [ "$me" = True ]; then
    OK+=("Бот отвечает (через прокладку)")
    read -r pend lasterr < <(curl -sS -m 20 "$ROOT_API/bot$TOKEN/getWebhookInfo" 2>/dev/null | python3 -c '
import json,sys,time
r=json.load(sys.stdin)["result"]
age=time.time()-r.get("last_error_date",0)
print(r.get("pending_update_count",0), "1" if r.get("last_error_message") and age<3600 else "0")' 2>/dev/null || echo "? 0")
    if [ "$pend" != "?" ] && [ "$pend" -gt 50 ] 2>/dev/null; then BAD+=("Вебхук: в очереди $pend необработанных сообщений"); fi
    [ "$lasterr" = 1 ] && WARN+=("Вебхук: были ошибки доставки за последний час")
  else
    BAD+=("Бот не отвечает — не работает прокладка Telegram через Vercel")
  fi
fi

# 5. Диск и память.
disk=$(df --output=pcent / | tail -1 | tr -dc 0-9)
if [ "$disk" -ge 90 ]; then BAD+=("Диск заполнен на $disk%"); elif [ "$disk" -ge 80 ]; then WARN+=("Диск заполнен на $disk%"); else OK+=("Диск: занято $disk%"); fi
mem=$(free -m | awk '/^Mem:/{printf "%d", ($2-$7)*100/$2}')
[ "$mem" -ge 90 ] && WARN+=("Память занята на $mem%") || OK+=("Память: занято $mem%")

# 6. SSL-сертификат.
exp=$(echo | timeout 10 openssl s_client -servername "$HOST" -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$exp" ]; then
  days=$(( ( $(date -d "$exp" +%s) - $(date +%s) ) / 86400 ))
  if [ "$days" -lt 7 ]; then BAD+=("SSL-сертификат истекает через $days дн."); elif [ "$days" -lt 20 ]; then WARN+=("SSL-сертификат истекает через $days дн."); else OK+=("SSL ещё $days дн."); fi
fi

# 7. Резервная копия базы (делается каждую ночь).
last=$(ls -t /opt/backups/mesto-*.sql.gz 2>/dev/null | head -1)
if [ -z "$last" ]; then WARN+=("Нет ни одной резервной копии базы")
else
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 3600 ))
  size=$(du -h "$last" | cut -f1)
  [ "$age_h" -gt 30 ] && WARN+=("Последней копии базы $age_h ч. ($size)") || OK+=("Копия базы: $age_h ч. назад, $size")
fi

# 8. Фоновые задачи (cron) за сутки.
fails=$(awk -v since="$(date -u -d '24 hours ago' +%FT%TZ)" '$2=="fail" && $1>=since' /opt/mesto/cron.log 2>/dev/null | wc -l)
[ "$fails" -gt 3 ] && WARN+=("Фоновые задачи: $fails сбоев за сутки") || OK+=("Фоновые задачи: сбоев за сутки — $fails")

# 8б. Скорость ответов (лаги): главная и API, среднее из 3 замеров.
for path in / /feed /api/categories; do
  r=$(for _ in 1 2 3; do curl -sS -A "$UA" -o /dev/null -m 20 --resolve "$HOST:443:127.0.0.1" -w "%{http_code} %{time_total}\n" "https://$HOST$path" 2>/dev/null || echo "000 20"; done |
    awk '{s+=$2; c=$1} END {printf "%s %d", c, s/NR*1000}')
  read -r code ms <<<"$r"
  if [ "$code" = 000 ] || [ "${code:0:1}" = 5 ]; then BAD+=("$path не отвечает (код $code)")
  elif [ "$ms" -ge 3000 ]; then BAD+=("Тормозит $path: ${ms} мс")
  elif [ "$ms" -ge 1000 ]; then WARN+=("Медленно $path: ${ms} мс")
  else OK+=("$path: ${ms} мс (код $code)"); fi
done
# 8в. Ошибки приложения за последний час.
errh=$(sudo docker logs --since 1h mesto-app-1 2>&1 | grep -ciE 'error|exception|unhandled' || true)
[ "${errh:-0}" -ge 30 ] && WARN+=("Ошибок в логах за час: $errh") || OK+=("Ошибок в логах за час: ${errh:-0}")

# Отчёт для GitHub: только итоги проверок (без имён и данных людей) и обезличенные ошибки.
if [ "$MODE" = "--watch" ]; then
  echo "время: $(date -u +%FT%TZ)"
  for x in "${FIXED[@]}"; do echo "FIXED $x"; done
  for x in "${BAD[@]}"; do echo "BAD $x"; done
  for x in "${WARN[@]}"; do echo "WARN $x"; done
  for x in "${OK[@]}"; do echo "OK $x"; done
  echo "--- нагрузка: $(cut -d' ' -f1-3 /proc/loadavg), приложение: ${appmem:-?} МБ"
  echo "--- ошибки приложения за час (обезличено, по типам)"
  sudo docker logs --since 1h mesto-app-1 2>&1 | grep -iE 'error|exception|unhandled|timed out' |
    sed -E 's#bot[0-9]+:[A-Za-z0-9_-]+#bot<token>#g; s/[0-9a-f]{8}-[0-9a-f-]{27}/<id>/g; s/[0-9]{5,}/<n>/g; s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g; s/"[^"]{40,}"/"<…>"/g; s/\x27[^\x27]*\x27/<…>/g' |
    cut -c1-180 | sort | uniq -c | sort -rn | head -25
  echo "--- фоновые задачи: сбои за час"
  awk -v since="$(date -u -d '1 hour ago' +%FT%TZ)" '$2=="fail" && $1>=since {print $3}' /opt/mesto/cron.log 2>/dev/null | sort | uniq -c
  # Админу в бота пишет ежечасный cron (--alert), здесь не дублируем.
  exit 0
fi

# Ежечасная проверка: молчим, если нет критичных проблем и ничего не чинили.
if [ "$MODE" = "--alert" ] && [ ${#BAD[@]} -eq 0 ] && [ ${#FIXED[@]} -eq 0 ]; then exit 0; fi

# 9. Для ежедневной сводки — немного цифр за сутки.
STATS=""
if [ "$MODE" != "--alert" ]; then
  STATS=$(sudo docker exec supabase-db psql -U postgres -d postgres -tA -F ' ' -c "
    select
      (select count(*) from users where created_at > now() - interval '24 hours'),
      (select count(*) from users),
      (select count(*) from events where created_at > now() - interval '24 hours'),
      (select count(*) from events where status = 'published' and event_date >= current_date)" 2>/dev/null)
  errs=$(sudo docker logs --since 24h mesto-app-1 2>&1 | grep -ciE 'error|exception' || true)
  # Работа сервиса: сегодня (последние 24 ч) и вчера (24–48 ч назад) — для динамики.
  WORK=$(sudo docker exec supabase-db psql -U postgres -d postgres -tA -F ' ' -c "
    with a as (select organizer_id u, created_at t from events union all select user_id, joined_at from event_members union all select sender_id, created_at from messages),
    w(k, f, t) as (values (0, now() - interval '24 hours', now()), (1, now() - interval '48 hours', now() - interval '24 hours'))
    select
      (select count(*) from users where created_at > f and created_at <= t),
      (select count(*) from events where created_at > f and created_at <= t),
      (select count(distinct u) from a where a.t > w.f and a.t <= w.t),
      (select count(*) from applications where created_at > f and created_at <= t),
      (select count(*) from applications where status = 'accepted' and updated_at > f and updated_at <= t),
      (select count(*) from messages where created_at > f and created_at <= t),
      (select count(*) from notifications where created_at > f and created_at <= t),
      (select count(*) from payments where status = 'succeeded' and created_at > f and created_at <= t),
      (select coalesce(sum(amount), 0) from payments where status = 'succeeded' and currency = 'RUB' and created_at > f and created_at <= t)
    from w order by k" 2>/dev/null)
  # Подборка встреч (18:00 по городу): скольким ушла за сутки и сколько из них потом заходили в приложение.
  DIGEST=$(sudo docker exec supabase-db psql -U postgres -d postgres -tA -F ' ' -c "
    select count(*), count(*) filter (where last_active_at > last_digest_at)
      from users where last_digest_at > now() - interval '24 hours'" 2>/dev/null)
  # Блокировки бота за сутки — после какого сообщения.
  BLOCKS=$(sudo docker exec supabase-db psql -U postgres -d postgres -tA -F '|' -c "
    select case
        when last_preview is null then 'без сообщений от бота'
        when last_preview ~* '(Новое событие|Новая встреча|Что интересного)' then 'после анонса'
        when last_preview ~* '(Кнопки закреплены|запустим наше|Привет! Это)' then 'после приветствия'
        when last_preview ~* '(Через .* встреча|Напоминаю)' then 'после напоминания о встрече'
        else 'после другого сообщения' end, count(*)
      from bot_blocks where status = 'blocked' and at > now() - interval '24 hours' group by 1 order by 2 desc" 2>/dev/null)
  unblocked=$(sudo docker exec supabase-db psql -U postgres -d postgres -tA -c "select count(*) from bot_blocks where status = 'unblocked' and at > now() - interval '24 hours'" 2>/dev/null)
  tgto=$(sudo docker logs --since 24h mesto-app-1 2>&1 | grep -c "timed out after" || true)
fi

{
  if [ "$MODE" = "--alert" ] && [ ${#BAD[@]} -eq 0 ]; then echo "🛠 Место: сервер сам исправил"
  elif [ "$MODE" = "--alert" ]; then echo "🚨 Место: проблема на сервере"; else echo "📊 Место: состояние сервера"; fi
  for x in "${FIXED[@]}"; do echo "🛠 $x"; done
  for x in "${BAD[@]}"; do echo "❌ $x"; done
  for x in "${WARN[@]}"; do echo "⚠️ $x"; done
  if [ "$MODE" != "--alert" ]; then
    for x in "${OK[@]}"; do echo "✅ $x"; done
    if [ -n "$STATS" ]; then
      read -r nu tu ne ae <<<"$STATS"
      echo ""
      echo "Всего людей: $tu, активных встреч: $ae"
    fi
    if [ -n "${WORK:-}" ]; then
      # Стрелка динамики к вчерашнему дню: ↑ +3 / ↓ −2 / = 
      dyn() { local c=$1 p=$2 d=$(( $1 - $2 )); if [ "$d" -gt 0 ]; then echo "$c ↑+$d"; elif [ "$d" -lt 0 ]; then echo "$c ↓$d"; else echo "$c ="; fi; }
      { read -r nu ne dau apps acc msgs notif pays sum; read -r nu0 ne0 dau0 apps0 acc0 msgs0 notif0 pays0 sum0; } <<<"$WORK"
      echo ""
      echo "За сутки (к вчера):"
      echo "• новых людей: $(dyn "$nu" "${nu0:-0}")"
      echo "• активных людей: $(dyn "$dau" "${dau0:-0}")"
      echo "• новых встреч: $(dyn "$ne" "${ne0:-0}")"
      echo "• заявок: $(dyn "$apps" "${apps0:-0}"), одобрено: $(dyn "$acc" "${acc0:-0}")"
      echo "• сообщений в чатах: $(dyn "$msgs" "${msgs0:-0}")"
      echo "• уведомлений: $(dyn "$notif" "${notif0:-0}")"
      echo ""
      echo "💰 Деньги за сутки: оплат $(dyn "$pays" "${pays0:-0}"), сумма $(dyn "$sum" "${sum0:-0}") ₽"
    fi
    if [ -n "${DIGEST:-}" ]; then
      read -r dsent dopen <<<"$DIGEST"
      echo "🗓 Подборка встреч: получили $dsent, потом зашли в приложение $dopen"
    fi
    echo ""
    if [ -n "${BLOCKS:-}" ]; then
      echo "Заблокировали бота за сутки:"
      while IFS='|' read -r why n; do [ -n "$why" ] && echo "• $why — $n"; done <<<"$BLOCKS"
    else
      echo "Заблокировали бота за сутки: никто"
    fi
    [ "${unblocked:-0}" -gt 0 ] 2>/dev/null && echo "Разблокировали: $unblocked"
    echo "Ошибок в логах сайта за сутки: ${errs:-?}, задержек Telegram: ${tgto:-?}"
  fi
} >/tmp/mesto-health.txt

# Логи GitHub публичные — сам текст (цифры по людям) туда не печатаем, только итог.
echo "сводка: проблем ${#BAD[@]}, предупреждений ${#WARN[@]}"
[ -n "$TOKEN" ] && [ -n "$ADMINS" ] || { echo "нет TELEGRAM_BOT_TOKEN или ADMIN_TELEGRAM_IDS — в бота не отправлено"; exit 0; }
for id in ${ADMINS//,/ }; do
  curl -sS -m 20 -o /dev/null -w "отправлено админу: %{http_code}\n" "$ROOT_API/bot$TOKEN/sendMessage" \
    --data-urlencode "chat_id=$id" --data-urlencode "text@/tmp/mesto-health.txt" || echo "не отправлено"
done

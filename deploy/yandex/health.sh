#!/usr/bin/env bash
# Сводка о состоянии сервера «Места» админам в Telegram-бота (ADMIN_TELEGRAM_IDS).
#   health.sh          — ежедневная сводка (всегда пишет)
#   health.sh --alert  — ежечасная проверка: пишет, только если что-то сломалось
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

# Ежечасная проверка: молчим, если нет критичных проблем.
if [ "$MODE" = "--alert" ] && [ ${#BAD[@]} -eq 0 ]; then exit 0; fi

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
  # Работа сервиса за сутки.
  WORK=$(sudo docker exec supabase-db psql -U postgres -d postgres -tA -F ' ' -c "
    with a as (select organizer_id u, created_at t from events union all select user_id, joined_at from event_members union all select sender_id, created_at from messages)
    select
      (select count(distinct u) from a where t > now() - interval '24 hours'),
      (select count(*) from applications where created_at > now() - interval '24 hours'),
      (select count(*) from applications where status = 'accepted' and updated_at > now() - interval '24 hours'),
      (select count(*) from messages where created_at > now() - interval '24 hours'),
      (select count(*) from notifications where created_at > now() - interval '24 hours')" 2>/dev/null)
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
  if [ "$MODE" = "--alert" ]; then echo "🚨 Место: проблема на сервере"; else echo "📊 Место: состояние сервера"; fi
  for x in "${BAD[@]}"; do echo "❌ $x"; done
  for x in "${WARN[@]}"; do echo "⚠️ $x"; done
  if [ "$MODE" != "--alert" ]; then
    for x in "${OK[@]}"; do echo "✅ $x"; done
    if [ -n "$STATS" ]; then
      read -r nu tu ne ae <<<"$STATS"
      echo ""
      echo "За сутки: новых людей $nu (всего $tu), новых встреч $ne, активных встреч $ae"
    fi
    if [ -n "${WORK:-}" ]; then
      read -r dau apps acc msgs notif <<<"$WORK"
      echo ""
      echo "Работа за сутки: активных людей $dau, заявок $apps (одобрено $acc), сообщений в чатах $msgs, уведомлений $notif"
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

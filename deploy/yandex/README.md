# Переезд «Места» на Yandex Cloud

Цель: сайт, мини-приложение, база, фото и чат — на сервере в России. Быстро открывается
у всех провайдеров и соответствует 152-ФЗ (данные россиян хранятся в РФ).

## Что где будет

| Было                         | Станет                                              |
|------------------------------|-----------------------------------------------------|
| Vercel (сайт, API, кроны)    | Сервер в Yandex Cloud: Docker + Caddy (HTTPS)       |
| Supabase Cloud (база, фото, чат) | Свой Supabase на том же сервере (`db.mesto-go.ru`) |
| Кроны Vercel                 | cron на сервере (`deploy/yandex/crontab`)           |
| Деплой при пуше в GitHub     | GitHub Actions → «Yandex Cloud» (по SSH)            |

Ключи Supabase на сервере новые (создаются автоматически), поэтому после переезда
пользователи один раз заново входят — данные, встречи и подписки сохраняются.

Размер на 13.10.2026: база 19 МБ, 617 файлов / 130 МБ, 722 пользователя.

## Сервер

- Ubuntu 24.04 LTS, зона `ru-central1-a`, Intel Ice Lake, **2 vCPU (100%), 4 ГБ RAM, 40 ГБ SSD**
- Публичный **статический** IP
- Логин `deploy` + SSH-ключ (публичная часть)
- Группа безопасности: входящие 22, 80, 443

## Шаги

1. **SSH-ключ** (на Mac, Терминал):
   `ssh-keygen -t ed25519 -f ~/.ssh/mesto_yc -N "" -C mesto-deploy`
   → `~/.ssh/mesto_yc.pub` вставить при создании ВМ, `~/.ssh/mesto_yc` — в GitHub-секрет `YC_SSH_KEY`.
2. **ВМ** в консоли Yandex Cloud (параметры выше). Записать IP.
3. **DNS** у reg.ru: `new.mesto-go.ru` и `db.mesto-go.ru` → A → IP сервера. (`mesto-go.ru` пока не трогаем.)
4. **GitHub → Settings → Secrets and variables → Actions**:
   - Secrets: `YC_HOST` (IP сервера), `YC_SSH_KEY` (`~/.ssh/mesto_yc`), `YC_OLD_DB_URL` (Supabase → Connect → Session pooler),
     `YC_BOT_TOKEN` (токен бота из @BotFather), по желанию `YC_APP_ENV` — доп. строки из `env.template` (ЮKassa, Карты, почта…).
   - Variables: `YC_ADMIN_IDS` — Telegram ID админов через запятую.
   Ключи Supabase, `CRON_SECRET` и секрет вебхука сервер создаёт сам (`make-env.py`), копировать их не нужно.
   После переезда все пользователи один раз заново входят (новые ключи) — данные не теряются.
5. **GitHub → Actions → Yandex Cloud → Run workflow** по очереди:
   `bootstrap` → `supabase` → `migrate` → `deploy` → `status`.
6. **Проверка** на `https://new.mesto-go.ru` (вход, лента, фото, чат, создание встречи).

## Переключение (вечером, ~15 минут)

1. Run workflow → `migrate` — свежая копия базы и фото (то, что люди успели сделать после этого и до шага 3, не перенесётся — поэтому переключаем вечером, быстро).
2. В `YC_APP_ENV`: `APP_HOSTS=mesto-go.ru, www.mesto-go.ru, new.mesto-go.ru`, `CRON_ENABLED=1` → `deploy`.
3. DNS: `mesto-go.ru` и `www` → A → IP сервера (вместо Vercel).
4. Vercel: убрать `crons` из `vercel.json`, `NEXT_PUBLIC_SUPABASE_URL=https://db.mesto-go.ru` (старые ссылки 2-xfcn.vercel.app продолжат работать с новой базой).
5. Telegram-вебхук на `https://mesto-go.ru/api/telegram/webhook` с новым `TELEGRAM_WEBHOOK_SECRET`.
6. ЮKassa: адрес уведомлений `https://mesto-go.ru/api/webhooks/yookassa` (если был другой).
7. Неделю держим Supabase Cloud и Vercel как запасной вариант, потом отключаем.

## Обслуживание

- Деплой: Run workflow → `deploy` (или переменная репозитория `YC_AUTODEPLOY=on` — деплой на каждый пуш в main).
- Логи: Run workflow → `logs`. Состояние: `status`.
- Резервные копии базы: каждую ночь в `/opt/backups` (14 дней).

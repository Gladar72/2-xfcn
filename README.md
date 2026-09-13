# Meetup App — Telegram Bot + Mini App

Приложение для поиска компании на конкретную активность (тренировка, кино, кофе,
завтрак, ужин, прогулка или своё предложение) — сначала активность, потом человек.
Не свайп-знакомства.

> Статус: 🚧 в разработке (см. `docs/TODO.md` за текущим прогрессом по этапам)

## Архитектура

Подробно: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

Кратко: Telegram Bot и Mini App → единое Next.js-приложение (frontend + API routes)
→ Supabase (PostgreSQL, Auth, Realtime, Storage) → Yandex Maps (карта) →
Telegram Stars (оплата) → n8n (уведомления) → Vercel (хостинг).

## Стек

- Next.js 14 (App Router) + TypeScript + React + Tailwind CSS
- Supabase (PostgreSQL, Row Level Security, Realtime, Storage)
- Telegram Bot API + Telegram Mini Apps SDK
- Yandex Maps API
- n8n (вспомогательные автоматизации, не бизнес-логика)
- Vercel + GitHub

## Требования (prerequisites)

- Node.js ≥ 18.18
- Аккаунт Supabase (бесплатного тарифа достаточно для старта)
- Telegram Bot, созданный через @BotFather
- Аккаунт Yandex Developer (для Maps API ключа)
- Аккаунт Vercel
- Аккаунт GitHub

## Установка (локально)

```bash
git clone <URL-твоего-репозитория>
cd meetup-app
npm install
cp .env.example .env.local
# заполни .env.local своими значениями (см. раздел "Переменные окружения")
npm run dev
```

## Переменные окружения

См. [`.env.example`](./.env.example) — там перечислены все переменные с комментариями,
откуда их взять. Реальные значения — только в `.env.local`, никогда не в git.

## Supabase — настройка

1. Создать проект на supabase.com.
2. Скопировать `Project URL`, `anon key`, `service_role key` и `JWT Secret`
   (Project Settings → API) в `.env.local`.
3. Накатить миграции — самый простой способ без установки CLI:
   - Открыть в Supabase раздел **SQL Editor**.
   - Скопировать содержимое файлов из `supabase/migrations/` **по порядку номеров**
     (0001, 0002, 0003 …) и выполнить каждый файл отдельным запросом.
   - Либо, если установлен Supabase CLI: `supabase link` → `supabase db push`.
4. Проверить в разделе **Table Editor**, что появились все таблицы
   (users, events, applications, conversations, messages, subscriptions и т.д.)
   и что в `categories`/`training_types` есть строки (seed из 0009-миграции).

## Telegram Bot — настройка

1. Убедись, что в `.env.local` заполнены `TELEGRAM_BOT_TOKEN`, `APP_URL`
   (публичный URL после деплоя на Vercel) и, желательно, `TELEGRAM_WEBHOOK_SECRET`
   (любая случайная строка — защищает webhook от посторонних запросов).
2. Установи зависимости и запусти:
   ```bash
   npm run bot:set-webhook
   ```
   Это одноразово сообщает Telegram, куда слать апдейты бота.
3. Команды бота: `/start`, `/app` (открыть приложение), `/help`, `/support`,
   `/paysupport` (обязательна для ботов с оплатой — см. `lib/telegram/bot.ts`).
4. При каждой смене `APP_URL` (например, после первого реального деплоя)
   нужно перезапустить `npm run bot:set-webhook`.

## Telegram Mini App — настройка

_Будет дополнено на Этапе 3._

## Yandex Maps — настройка

_Будет дополнено на Этапе 11._

## Деплой на Vercel

ШАГ 1.
Зайди на vercel.com, нажми **Add New → Project**, выбери свой GitHub-репозиторий с этим проектом.

ШАГ 2.
В настройках проекта (**Environment Variables**) добавь все переменные из
`.env.example` с реальными значениями — `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, `ADMIN_TELEGRAM_IDS`, `N8N_WEBHOOK_URL`,
`N8N_API_KEY`. `APP_URL` заполни ПОСЛЕ первого деплоя — тогда узнаешь
реальный домен (например, `https://meetup-app.vercel.app`).

ШАГ 3.
Нажми **Deploy**. Дождись сборки.

ШАГ 4.
Скопируй присвоенный Vercel домен, вернись в **Environment Variables**,
заполни `APP_URL` этим доменом, сделай **Redeploy** (переменные окружения
применяются только к новым сборкам).

ШАГ 5.
В кабинете разработчика Yandex Maps (см. раздел выше) впиши этот же домен
в поле "Ограничение по HTTP Referer" вместо `localhost`.

ШАГ 6.
Локально (или в любом окружении с доступом к интернету) запусти
`npm run bot:set-webhook`, чтобы бот начал присылать апдейты на прод-домен.

ШАГ 7.
Открой бота в Telegram, нажми `/start` → «Открыть приложение» — должна
открыться главная страница, а дальше сработает вся цепочка: проверка
initData → регистрация или лента → создание встречи и т.д.

## n8n — настройка автоматизаций

Подробная инструкция и все 6 готовых workflow: [`n8n/README.md`](./n8n/README.md).

## Разработка

```bash
npm run dev         # локальный сервер разработки
npm run typecheck   # проверка типов
npm run lint        # линтер
npm run test        # тесты критичной логики
npm run build       # production build
```

## Troubleshooting

**В Supabase SQL Editor результат "Success", но данных в базе не появилось.**
Известная гонка: если вставлять текст в редактор и сразу же нажимать
Cmd+Enter, иногда выполняется предыдущий (уже завершившийся) запрос, а не
только что вставленный. Решение: подождать секунду после вставки, прежде
чем нажимать "Run", и после важных миграций проверять результат отдельным
`select count(*) from information_schema.tables ...`, а не доверять только
надписи "Success".

**Supabase Dashboard визуально "ломается" / показывает код на русском
вместо английского.**
Это Chrome Translate пытается перевести страницу и иногда конфликтует с
React-рендерингом редактора (SQL-код в редакторе может визуально исказиться
до состояния полной нечитаемости). Помогает обновление страницы; на сами
данные в базе это не влияет.

**`npm run build` падает с ошибкой про grammy / Node.js API.**
Проверь, что в `next.config.js` есть `experimental.serverComponentsExternalPackages: ["grammy"]`
(в новых версиях Next.js ключ может называться `serverExternalPackages` —
свериться с текущей документацией Next.js при апгрейде).

**Yandex Maps не показывает карту.**
Ключ активируется ~15 минут после создания, и обязательно должен быть
заполнен "Ограничение по HTTP Referer" в кабинете разработчика — для
локальной разработки там должен быть `localhost`, для прода — реальный домен.

**Telegram Stars инвойс не открывается.**
`openInvoice` работает только внутри реального Telegram-клиента (не в
обычном браузере) — тестировать оплату можно только через настоящий Mini App.

## План разработки

Полный пошаговый план и текущий статус: [`docs/TODO.md`](./docs/TODO.md).

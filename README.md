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

_Будет дополнено на Этапе 2 (миграции)._ Кратко: создать проект в Supabase,
скопировать `Project URL`, `anon key`, `service_role key` в `.env.local`,
затем накатить миграции из `supabase/migrations`.

## Telegram Bot — настройка

_Будет дополнено на Этапе 3 (аутентификация) и Этапе 28 (команды бота)._

## Telegram Mini App — настройка

_Будет дополнено на Этапе 3._

## Yandex Maps — настройка

_Будет дополнено на Этапе 11._

## Деплой на Vercel

_Будет дополнено на Этапе 15 (production hardening)._

## n8n — настройка автоматизаций

_Будет дополнено на Этапе 12._ Описание workflow: [`n8n/workflows`](./n8n/workflows).

## Разработка

```bash
npm run dev         # локальный сервер разработки
npm run typecheck   # проверка типов
npm run lint        # линтер
npm run test        # тесты критичной логики
npm run build       # production build
```

## Troubleshooting

_Раздел будет пополняться реальными проблемами по мере разработки._

## План разработки

Полный пошаговый план и текущий статус: [`docs/TODO.md`](./docs/TODO.md).

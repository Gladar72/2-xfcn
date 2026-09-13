# План разработки

Статусы: ✅ готово · 🔄 в работе · ⬜ не начато

## Этап 1 — Архитектура + инициализация репозитория
- ✅ Структура папок Next.js проекта
- ✅ package.json, tsconfig.json, tailwind.config.ts, next.config.js
- ✅ .gitignore, .env.example
- ✅ docs/ARCHITECTURE.md
- 🔄 README.md (скелет → будет дополняться на каждом этапе)
- ⬜ Локальная git-инициализация и первый коммит
- ⬜ От тебя: создать пустой репозиторий на GitHub и прислать мне URL (или сказать, что сам запушишь)

## Этап 2 — Supabase schema + миграции
- ✅ SQL-миграция: базовые таблицы (users, categories, training_types, interests, user_interests, user_photos)
- ✅ SQL-миграция: события (events, event_members, applications)
- ✅ SQL-миграция: чаты (conversations, conversation_members, messages)
- ✅ SQL-миграция: монетизация (subscriptions, subscription_usage, boosts, payments)
- ✅ SQL-миграция: доверие и безопасность (reviews, reports, blocks, notifications)
- ✅ RLS policies для всех таблиц из п.24 ТЗ
- ✅ Seed категорий и типов тренировок
- ✅ Реально накатить миграции в твою Supabase — **выполнено 13.09, подтверждено напрямую SQL-запросом**: 20 таблиц, 34 RLS-политики, bucket `avatars`, 7 категорий, 8 типов тренировок, 15 интересов.

## Этап 3 — Telegram аутентификация
- ✅ `lib/telegram/validate-init-data.ts` — проверка подписи initData (HMAC-SHA256 по алгоритму Telegram)
- ✅ `/api/auth` route — проверка initData → поиск/создание пользователя → выдача сессии
- ✅ Сессия: `lib/telegram/session.ts` (свой JWT, совместимый с Supabase auth.uid()) + httpOnly cookie
- ✅ `lib/supabase/admin.ts` (service_role, только сервер) и `lib/supabase/server.ts` (от имени пользователя, через RLS)
- ✅ Тесты на валидацию initData (5 сценариев) — логика вручную прогнана на чистом Node, все прошли
- ⬜ От тебя: TELEGRAM_BOT_TOKEN из @BotFather (нужен для реального теста на живом боте)

## Этап 4 — Регистрация
- ✅ Экран онбординга (фото, имя, дата рождения, город, bio, интересы) — по одному вопросу на экран
- ✅ Загрузка фото в Supabase Storage (через backend, bucket `avatars`)
- ✅ Проверка 18+ (zod на клиенте + check-constraint в БД)
- ✅ API создания профиля (`/api/users`) с повторной проверкой initData
- ✅ `/api/interests` — справочник для шага "интересы"
- ✅ Точка входа `/` — определяет, вести на онбординг или в ленту
- ✅ Seed интересов + bucket `avatars` в Storage (миграции 0010, 0011)

## Этап 5 — Главный экран (Mini App UI)
- ✅ Дизайн-система: базовые UI-компоненты (кнопка, прогресс-бар) — заложены на Этапе 4
- ✅ Верхняя панель (город, уведомления) — `components/layout/TopBar.tsx`
- ✅ Сетка категорий — `components/home/CategoryGrid.tsx`
- ✅ Раскрытие "Совместная тренировка" в подкатегории — bottom sheet, данные из БД (расширяемо без деплоя)
- ✅ Нижнее меню (5 разделов, центральная кнопка "Создать") — `components/layout/BottomNav.tsx`
- ✅ `/api/categories` — отдаёт категории и типы тренировок
- ✅ Заглушки для /map, /create, /chats, /profile (реализация — на соответствующих этапах)

## Этап 6 — Лента событий
- ✅ Алгоритм ранжирования `lib/scoring/rank-events.ts` (город/интересы/свежесть/дистанция/заполненность/буст/тариф)
- ✅ Тесты ranking — 6 сценариев, включая ключевой принцип "релевантный START > нерелевантный PREMIUM" (проверено вручную на Node: 38.0 > 34.0)
- ✅ `/api/events` — лента с фильтрами по категории/типу тренировки, city берётся из профиля
- ✅ Карточка встречи `components/feed/EventCard.tsx` — все поля из п.8 ТЗ
- ✅ Empty state ("Сегодня пока тихо...")
- ✅ Пагинация кнопкой "Показать ещё" (курсор по page, кандидатный пул 150 → ranking → срез по 20)
- ⬜ Настоящий infinite scroll (сейчас — кнопка; можно заменить на IntersectionObserver позже, не блокирует MVP)

## Этап 7 — Создание встречи
- ✅ Мастер из 7 экранов (превью и публикация объединены в один финальный шаг) — по одному вопросу на экран
- ✅ Проверка активной подписки перед доступом (гейт в `app/(app)/create/page.tsx`)
- ✅ Проверка лимита `events_limit` и размера группы (`groupMax`) на сервере — `POST /api/events`
- ✅ Preview + публикация

## Этап 8 — Подписки / paywall
- ✅ `lib/subscriptions/limits.ts` — единственный источник истины по лимитам/ценам тарифов
- ✅ Экран paywall (`components/paywall/`) — появляется только при попытке создать встречу (п.11 ТЗ)
- ✅ Серверная проверка `active_subscription` (`getActiveSubscriptionInfo`)
- ✅ Начальная интеграция Telegram Stars — `createStarsInvoiceLink` + `/api/subscriptions/create-invoice`
- ✅ Атомарный инкремент usage-счётчиков (SQL-миграция 0012, RPC, без гонок)
- ⬜ Полная активация подписки по факту оплаты — это Этап 25 (webhook), контракт уже задокументирован в `app/api/payments/telegram-webhook/route.ts`
- ⬜ Цены в Telegram Stars (`priceStars` в limits.ts) — placeholder-значения, нужно сверить с актуальным курсом перед запуском

## Этап 9 — Отклики (applications)
- ✅ Кнопка "Хочу пойти" → создание application (pending), реально подключена в ленте
- ✅ Экран организатора: список заявок, принять/отклонить (`/events/[id]/applications`)
- ✅ Уведомление организатору о новой заявке (запись в `notifications`, push через n8n — Этап 12)
- ✅ Уведомление заявителю о принятии
- ✅ Атомарное занятие места при принятии (SQL RPC `accept_event_seat`, применена к БД) — защита от овербукинга
- ✅ Автоматическое создание чата при принятии заявки (п.15 ТЗ — чат только после подтверждения)

## Этап 10 — Чаты
- ✅ Supabase Realtime канал сообщений — `lib/supabase/browser-realtime.ts`, подписка на INSERT в `messages`
- ✅ Отдельный короткоживущий токен для WebSocket-авторизации (`/api/auth/realtime-token`) — основная сессия остаётся в httpOnly cookie
- ✅ Список чатов (`/chats`) — превью последнего сообщения, unread count, данные собеседника
- ✅ Экран чата (`/chats/[id]`, вынесен из-под общего layout, чтобы нижнее меню не перекрывало поле ввода)
- ✅ text, timestamp, unread count, read status, список чатов — всё есть
- ✅ Блокировка и скрытие чата — `PATCH /api/conversations/[id]` (hide/unhide/block/unblock)
- ✅ Realtime включён на таблице `messages` (миграция 0015, подтверждено запросом к `pg_publication_tables`)
- ⬜ Картинки в сообщениях — сознательно не делаем в MVP (п.15 ТЗ это разрешает)

## Этап 11 — Карта
- ✅ Интеграция Yandex Maps **JS API 3.0** (не устаревшая 2.1) — `lib/maps/load-yandex-maps.ts`
- ✅ На карте НЕ показывается live location пользователей — только координаты встреч
- ✅ Кластеризация через официальный пакет `@yandex/ymaps3-clusterer` (`YMapClusterer` + `clusterByGrid`)
- ✅ Клик по маркеру/кластеру открывает список встреч (bottom sheet)
- ✅ `/api/events/map` — координаты встреч по городу
- ✅ Выбор места тапом по карте в мастере создания встречи (`LocationPicker`, через `YMapListener`) — координаты реально сохраняются в `events.latitude/longitude`
- ⬜ Полноценный geosuggest/поиск адреса по названию — не делали (не входит в MVP-скоуп ТЗ п.17), сейчас место вводится текстом + точка на карте
- ⚠️ Ключ `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` получен, но у него обязательно должно быть заполнено поле "Ограничение по HTTP Referer" в кабинете разработчика — на этапе локальной разработки там должен быть `localhost`, на проде — реальный домен Vercel

## Этап 12 — Уведомления / n8n
- ⬜ Экспорт workflow 1–6 (п.27 ТЗ) как n8n JSON в n8n/workflows
- ⬜ Точки интеграции (webhook endpoints) со стороны Next.js

## Этап 13 — Отзывы и рейтинг
- ⬜ Форма отзыва после встречи (оценка 1–5 + доп. признаки)
- ⬜ Защита от повторного отзыва
- ⬜ Пересчёт рейтинга пользователя

## Этап 14 — Admin
- ⬜ Защищённый /admin route (только ADMIN_TELEGRAM_IDS)
- ⬜ Разделы: Users, Events, Reports, Subscriptions, Payments, Reviews
- ⬜ Метрики: DAU, конверсии воронки, revenue

## Этап 15 — Production hardening
- ⬜ Полный прогон lint + typecheck + tests + build
- ⬜ Проверка RLS на всех таблицах
- ⬜ Финальный README и инструкция по деплою на Vercel

---

## Правило после каждого этапа
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test` (если есть тесты для этапа)
4. `npm run build`
5. Исправить ошибки → только потом переходить дальше.

⚠️ Важно: в песочнице Claude нет доступа в интернет, поэтому `npm install` и
реальный `npm run build` я не могу выполнить сам — это делается либо у тебя
локально, либо автоматически на Vercel при деплое. Я буду максимально
внимательно проверять код вручную (типы, импорты, логику), чтобы build проходил
с первого раза, но финальную команду `npm run build` в реальном окружении
нужно будет запустить тебе или Vercel.

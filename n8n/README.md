# n8n workflows

Шесть workflow'ов из п.27 ТЗ. Разделение ответственности (важно не нарушать при доработке):

- **Next.js решает, КОГО и О ЧЁМ уведомлять** (релевантность, права, идемпотентность).
- **n8n только отправляет** сообщения в Telegram по уже готовому списку получателей.

Никогда не переносите в n8n проверки прав, лимитов подписки или бизнес-правил —
это должно остаться в Next.js (см. `docs/ARCHITECTURE.md`).

## Файлы

| Файл | Тип триггера | Что делает |
|---|---|---|
| `01-new-event-notify-relevant-users.json` | Webhook `event-created` | Уведомляет пользователей с подходящими интересами о новой встрече |
| `02-new-application-notify-organizer.json` | Webhook `new-application` | Уведомляет организатора о новом отклике |
| `03-application-accepted-notify-participant.json` | Webhook `application-accepted` | Уведомляет участника о принятии заявки |
| `04-event-reminder.json` | Schedule (каждые 15 мин) | Напоминание за 2 часа до встречи |
| `05-review-request.json` | Schedule (каждые 30 мин) | Запрос отзыва после встречи (и перевод встречи в статус `completed`) |
| `06-low-attendance-boost-suggestion.json` | Schedule (раз в час) | Подсказка организатору поднять встречу, если мало участников |

## Как импортировать

ШАГ 1.
Открой свой n8n → **Workflows** → **Import from File**.

ШАГ 2.
Выбери один из файлов выше. Повтори для всех шести.

ШАГ 3.
В каждом workflow найди узел **Telegram: Send Message** и настрой credential
(**Create New** → вставь `TELEGRAM_BOT_TOKEN`, тот же токен, что у бота).

ШАГ 4.
В n8n должны быть доступны переменные окружения `APP_URL` (публичный URL
твоего Vercel-деплоя) и `N8N_API_KEY` (тот же секрет, что в `.env.local`
приложения, поле `N8N_API_KEY`) — без них узлы `HTTP Request` не смогут
достучаться до защищённых `/api/n8n/*` эндпоинтов.

ШАГ 5.
Для webhook-workflow'ов (01-03) скопируй **Production URL** каждого webhook
из n8n и собери из них базовый `N8N_WEBHOOK_URL` для `.env.local` приложения
(например, если webhook URL — `https://n8n.example.com/webhook/event-created`,
то `N8N_WEBHOOK_URL=https://n8n.example.com/webhook`).

ШАГ 6.
Включи (**Activate**) все шесть workflow'ов.

## Проверка

- Опубликуй тестовую встречу → должен сработать workflow 01.
- Откликнись на неё со второго аккаунта → workflow 02.
- Прими заявку → workflow 03.
- Workflow'ы 04-06 сработают сами по расписанию, когда появятся подходящие встречи.

## Примечание про версии n8n

Параметры узлов (`Telegram`, `HTTP Request`, `Item Lists`) могут немного
отличаться между версиями n8n. Если после импорта узел показывает ошибку
конфигурации — открой его и пересохрани значения полей вручную, сама логика
и структура workflow при этом не меняется.

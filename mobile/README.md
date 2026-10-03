# «Место» — мобильное приложение (iOS + Android)

Expo / React Native. Ходит в тот же бэкенд, что и мини-приложение в Telegram
(`https://2-xfcn.vercel.app`), — аккаунты, встречи и чаты общие.
Мини-приложение в Telegram при этом работает как раньше.

## Запуск на телефоне (для проверки)

```bash
cd mobile
npm install
npx expo install --fix      # подтянет точные версии под текущий Expo SDK
npx expo start              # отсканировать QR в Expo Go
```

Карта (`react-native-maps`) и вход через Telegram работают и в Expo Go.
Push-уведомления — только в сборке (`eas build`).

## Сборка для сторов

```bash
npm i -g eas-cli
eas login
eas init                     # пропишет projectId в app.json → extra.eas.projectId
eas build --profile preview --platform android   # APK для теста
eas build --profile production --platform all    # для App Store и Google Play
eas submit --platform ios / android
```

## Что нужно настроить один раз

1. **SMS-коды**: в Vercel → Environment Variables добавить `SMSRU_API_ID`
   (ключ из личного кабинета sms.ru) и при желании `SMSRU_FROM` (имя отправителя).
2. **Вход через Telegram**: в @BotFather → `/setdomain` → выбрать бота
   @Mesto_people_bot → указать `2-xfcn.vercel.app`.
3. **Google Maps для Android**: ключ Maps SDK for Android в `app.json`
   → `android.config.googleMaps.apiKey` (на iPhone используются Apple Maps, ключ не нужен).
4. Аккаунты разработчика: Apple Developer ($99/год) и Google Play Console ($25 разово).

## Что уже есть (этап 1)

- Вход по номеру телефона (SMS-код) и через Telegram, регистрация (анкета как в мини-аппе)
- Лента встреч с фильтром по дате, карта с фото организаторов и метками времени
- Карточка встречи: мини-карта, «Маршрут», организатор, участники, «Я иду»
- Чаты: список и переписка
- Профиль, выход

## Дальше (этап 2)

- Создание и редактирование встречи
- Push-уведомления вместо сообщений бота (токены уже сохраняются в `push_tokens`)
- Realtime в чатах вместо опроса раз в 4 секунды, фото в чатах
- Тарифы через App Store / Google Play (In-App Purchase), редактирование профиля, отзывы

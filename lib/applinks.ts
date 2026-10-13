/**
 * Универсальные ссылки (iOS) и App Links (Android): какие адреса mesto-go.ru
 * открываются сразу в приложении, если оно установлено. Остальные — в браузере.
 * Важно: /auth/* (вход через Telegram) сюда не входит — он должен открываться в браузере.
 * Те же пути — в mobile/app.json (android.intentFilters) и mobile/app/+native-intent.tsx.
 */
export const APP_LINK_PATHS = [
  "/e/*",
  "/r/*",
  "/events/*",
  "/people",
  "/people/*",
  "/chats",
  "/chats/*",
  "/city/*",
  "/my-events",
  "/notifications",
];

export const APP_BUNDLE_ID = process.env.APPLE_BUNDLE_ID?.split(",")[0]?.trim() || "ru.mesto.app";
export const ANDROID_PACKAGE = "ru.mesto.app";

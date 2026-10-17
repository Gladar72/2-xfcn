/**
 * Адрес Telegram Bot API. По умолчанию — сам Telegram.
 * На сервере в России api.telegram.org недоступен, поэтому там задаётся
 * TELEGRAM_API_ROOT=https://2-xfcn.vercel.app/api/telegram/relay — прокладка на Vercel
 * (app/api/telegram/relay), которая пересылает запросы в Telegram как есть.
 */
export const TELEGRAM_API_ROOT = (process.env.TELEGRAM_API_ROOT || "https://api.telegram.org").replace(/\/+$/, "");

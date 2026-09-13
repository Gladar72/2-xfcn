"use client";

/**
 * Telegram инжектит объект window.Telegram.WebApp через скрипт
 * https://telegram.org/js/telegram-web-app.js (подключается в app/layout.tsx).
 * Это официальный документированный глобальный объект Mini Apps API.
 *
 * Мы читаем initData именно отсюда, а не пытаемся собрать его вручную —
 * подпись (hash) для этой строки формирует сам Telegram на своей стороне.
 *
 * Перед продакшн-использованием свериться с актуальной документацией:
 * https://core.telegram.org/bots/webapps
 */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  openInvoice: (url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  MainButton: {
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Возвращает сырую initData-строку для отправки на backend, либо null вне Telegram. */
export function getInitData(): string | null {
  const webApp = getTelegramWebApp();
  if (!webApp || !webApp.initData) return null;
  return webApp.initData;
}

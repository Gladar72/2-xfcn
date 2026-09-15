"use client";

import { useEffect, useState } from "react";

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
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  close: () => void;
  // viewportHeight — реальная видимая высота окна Mini App, которую Telegram
  // сам пересчитывает при появлении/скрытии клавиатуры. Обычный CSS
  // 100vh/100dvh внутри WebView Telegram не всегда обновляется корректно при
  // открытии клавиатуры — из-за этого и "съезжал" экран чата при наборе
  // текста. viewportChanged — событие, которое стреляет при каждом
  // изменении (в т.ч. открытии клавиатуры).
  viewportHeight: number;
  viewportStableHeight: number;
  onEvent: (eventType: "viewportChanged", callback: () => void) => void;
  offEvent: (eventType: "viewportChanged", callback: () => void) => void;
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

/**
 * Живая высота видимой области Mini App в пикселях — уже с учётом открытой
 * клавиатуры. Вне Telegram (например, при разработке в обычном браузере)
 * возвращает null — в этом случае экран должен сам откатиться на обычный
 * CSS h-[100dvh] как запасной вариант.
 */
export function useTelegramViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    function update() {
      setHeight(webApp!.viewportHeight);
    }

    update();
    webApp.onEvent("viewportChanged", update);
    return () => webApp.offEvent("viewportChanged", update);
  }, []);

  return height;
}

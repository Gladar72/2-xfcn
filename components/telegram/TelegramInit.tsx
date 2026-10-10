"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

/**
 * Рендерится один раз в корневом layout (app/layout.tsx). Без явного
 * expand() Telegram открывает Mini App компактным окном примерно на
 * половину экрана — full-screen нужно запросить самим.
 *
 * ready() сообщает Telegram, что интерфейс готов к показу (по
 * документации должен вызываться как можно раньше) — некоторые версии
 * официального скрипта делают это неявно сами, но явный вызов не
 * помешает и не задваивает эффект.
 */
export function TelegramInit() {
  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    // Экраны редизайна прокручиваются внутри себя (.scroll), а не всей
    // страницей. Без этого Telegram принимает свайп вниз/вверх за жест
    // «свернуть приложение», и прокрутка на телефоне не работает.
    try {
      webApp.disableVerticalSwipes?.();
    } catch {
      /* старый клиент Telegram — метода нет */
    }
  }, []);

  return null;
}

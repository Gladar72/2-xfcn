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
    // Приложение ожило — сбрасываем флаг разовой перезагрузки (app/layout.tsx, CHUNK_RELOAD).
    try {
      sessionStorage.removeItem("mesto_chunk_reload");
    } catch {
      /* нет хранилища */
    }
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    // На телефоне — сразу на весь экран, как у мировых приложений: шапка Telegram
    // пропадает, остаются только его кнопки «закрыть/свернуть» сверху. Отступы под
    // них приходят в CSS-переменных --tg-content-safe-area-inset-* (учтены в --top).
    // На компьютере не включаем — там это развернуло бы всё окно Telegram.
    try {
      const mobile = webApp.platform === "ios" || webApp.platform === "android";
      if (mobile && webApp.isVersionAtLeast?.("8.0") && !webApp.isFullscreen) webApp.requestFullscreen?.();
    } catch {
      /* старый клиент — остаётся обычное развёрнутое окно */
    }
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

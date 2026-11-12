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
    // Browsing MESTO does not need an extra "Close anyway" confirmation.
    // Configure the native close control; do not intercept or imitate its tap.
    try {
      webApp.disableClosingConfirmation?.();
    } catch {
      /* old Telegram clients do not expose this option */
    }
    // На весь экран, без шапки Telegram (Bot API 8.0+): кнопки «Закрыть / ⋯»
    // лежат поверх афиши, отступы берутся из --tg-content-safe-area-inset-top.
    // Telegram иногда стартует с isActive=false и лишь потом шлёт «activated» —
    // раньше в этом случае полноэкранный режим не включался вовсе, и сверху
    // оставалась чёрная шапка Telegram. Теперь просим ещё раз при активации.
    const mobile = webApp.platform === "ios" || webApp.platform === "android";
    const goFull = () => {
      try {
        if (webApp.isActive === false) return;
        webApp.expand();
        if (mobile && webApp.isVersionAtLeast?.("8.0") && !webApp.isFullscreen) webApp.requestFullscreen?.();
      } catch {
        /* старый клиент — остаёмся в обычном раскрытом окне */
      }
    };
    goFull();
    const t1 = setTimeout(goFull, 400);
    const t2 = setTimeout(goFull, 1500);
    try {
      webApp.onEvent("activated", goFull);
    } catch {
      /* нет событий */
    }
    // Экраны редизайна прокручиваются внутри себя (.scroll), а не всей
    // страницей. Без этого Telegram принимает свайп вниз/вверх за жест
    // «свернуть приложение», и прокрутка на телефоне не работает.
    try {
      webApp.disableVerticalSwipes?.();
    } catch {
      /* старый клиент Telegram — метода нет */
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      try {
        webApp.offEvent("activated", goFull);
      } catch {
        /* нет событий */
      }
    };
  }, []);

  return null;
}

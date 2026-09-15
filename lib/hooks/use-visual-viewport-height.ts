"use client";

import { useEffect, useState } from "react";

/**
 * Реальная видимая высота экрана с учётом открытой клавиатуры.
 *
 * Раньше для этого использовался Telegram.WebApp.viewportHeight — но в
 * части клиентов Telegram (особенно старых или на некоторых платформах)
 * событие viewportChanged либо не приходит, либо приходит с задержкой, и
 * "съезжание" экрана при наборе текста никуда не девалось.
 *
 * window.visualViewport — стандартный браузерный API (широко
 * поддерживается в мобильных WebView, включая тот, что использует
 * Telegram) — надёжнее, т.к. не зависит от конкретной реализации
 * Telegram-клиента, а отражает реальную видимую область страницы.
 *
 * Возвращает null на сервере/при отсутствии поддержки — в этом случае
 * экран должен откатиться на обычный CSS h-[100dvh].
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      setHeight(window.visualViewport!.height);
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}

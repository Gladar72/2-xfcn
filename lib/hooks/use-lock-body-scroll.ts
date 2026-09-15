"use client";

import { useEffect } from "react";

/**
 * Блокирует прокрутку document.body, пока смонтирован компонент, который
 * вызвал этот хук — и восстанавливает как было при размонтировании.
 *
 * Зачем: WebView Telegram (на уровне нативного приложения, не нашего кода)
 * при фокусе на текстовое поле пытается сама проскроллить страницу, чтобы
 * подвести поле под клавиатуру. Если у body физически нет возможности
 * скроллиться, скроллить нечего — экран остаётся на месте.
 *
 * Используется ТОЛЬКО на полноэкранных страницах с собственной внутренней
 * прокруткой (чат, мастер создания встречи) — не глобально, иначе сломает
 * обычные страницы (ленту, профиль и т.д.), которые полагаются на обычный
 * скролл всей страницы браузером.
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const original = {
      position: document.body.style.position,
      overflow: document.body.style.overflow,
      width: document.body.style.width,
      height: document.body.style.height,
    };

    document.body.style.position = "fixed";
    document.body.style.overflow = "hidden";
    document.body.style.width = "100%";
    document.body.style.height = "100%";

    return () => {
      document.body.style.position = original.position;
      document.body.style.overflow = original.overflow;
      document.body.style.width = original.width;
      document.body.style.height = original.height;
    };
  }, []);
}

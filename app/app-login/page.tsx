"use client";

import { useEffect } from "react";

/**
 * Кнопка «Вернуться в «Место»» из бота. Если ссылка открылась в браузере, а не сразу
 * в приложении, — пробуем открыть приложение по его схеме mesto://, и даём кнопку.
 * Сам вход приложение забирает само (опрос /api/auth/mobile/telegram/poll).
 */
export default function AppLoginPage() {
  const href = "mesto://app-login";
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = href; }, 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="m-aurora flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mosya/mosya_wave.webp" alt="" className="h-32 w-32 object-contain" />
      <h1 className="m-title text-[26px] font-bold text-ink-900">Вход подтверждён</h1>
      <p className="text-sm text-ink-600">Вернись в приложение «Место» — ты уже вошёл.</p>
      <a href={href} className="m-btn mt-2 rounded-full bg-ink-900 px-6 py-3 text-[15px] font-medium text-white">
        Открыть «Место»
      </a>
    </main>
  );
}

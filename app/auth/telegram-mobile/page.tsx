"use client";

import { useEffect, useRef } from "react";

/**
 * Страница входа через Telegram для мобильного приложения.
 * Приложение открывает её во встроенном браузере; после подтверждения в Telegram
 * виджет отдаёт подписанные данные, и мы возвращаем их в приложение ссылкой
 * mesto://auth?... (подпись проверяет сервер в /api/auth/mobile/telegram).
 *
 * Нужна разовая настройка: BotFather → /setdomain → домен приложения.
 */
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";

export default function TelegramMobileLoginPage() {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "mesto://auth";
    const safeRedirect = /^(mesto|exp|exps):\/\//.test(redirect) ? redirect : "mesto://auth";

    (window as unknown as { onTelegramAuth: (u: Record<string, string | number>) => void }).onTelegramAuth = (user) => {
      const q = new URLSearchParams();
      Object.entries(user).forEach(([k, v]) => q.set(k, String(v)));
      window.location.href = `${safeRedirect}${safeRedirect.includes("?") ? "&" : "?"}${q.toString()}`;
    };

    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", BOT_USERNAME);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "14");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    box.current?.appendChild(s);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo/mesto-mascot.png" alt="" className="h-24 w-24" />
      <div>
        <h1 className="text-title font-bold text-ink-900">Вход через Telegram</h1>
        <p className="mt-2 text-sm text-ink-600">Нажми кнопку и подтверди вход в Telegram — потом вернёшься в приложение «Место».</p>
      </div>
      <div ref={box} />
    </main>
  );
}

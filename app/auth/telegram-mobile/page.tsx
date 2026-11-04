"use client";

import { TelegramLoginWidget } from "@/components/telegram/TelegramLoginWidget";

/**
 * Страница входа через Telegram для мобильного приложения.
 * Приложение открывает её во встроенном браузере; после подтверждения в Telegram
 * виджет отдаёт подписанные данные, и мы возвращаем их в приложение ссылкой
 * mesto://auth?... (подпись проверяет сервер в /api/auth/mobile/telegram).
 *
 * Нужна разовая настройка: BotFather → /setdomain → домен приложения.
 */

export default function TelegramMobileLoginPage() {
  function handleTelegramAuth(user: Record<string, string | number>) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "mesto://auth";
    const safeRedirect = /^(mesto|exp|exps):\/\//.test(redirect) ? redirect : "mesto://auth";
    const q = new URLSearchParams();
    Object.entries(user).forEach(([k, v]) => q.set(k, String(v)));
    window.location.href = `${safeRedirect}${safeRedirect.includes("?") ? "&" : "?"}${q.toString()}`;
  }

  return (
    <main className="m-aurora flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mosya/mosya_wave.webp" alt="" className="h-32 w-32 object-contain" />
      <div>
        <h1 className="m-title text-[28px] font-bold text-ink-900">Вход через Telegram</h1>
        <p className="mt-2 text-sm text-ink-600">Нажми кнопку и подтверди вход в Telegram — потом вернёшься в приложение «Место».</p>
      </div>
      <div className="w-full max-w-sm"><TelegramLoginWidget onAuth={handleTelegramAuth} /></div>
    </main>
  );
}

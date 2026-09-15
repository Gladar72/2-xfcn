cat > "app/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getInitData } from "@/lib/telegram/webapp-client";

/**
 * Точка входа Mini App. Ждёт initData от Telegram, вызывает /api/auth и
 * редиректит:
 *   - "authenticated"       → /feed
 *   - "needs_registration"  → /onboarding
 *   - ошибка / initData нет → показываем сообщение "открой через Telegram"
 *
 * Пока идёт проверка — показываем брендированный экран загрузки (логотип +
 * полоса загрузки + слоган), а не голый текст.
 */
export default function EntryPage() {
  const [status, setStatus] = useState<"loading" | "no_telegram" | "error">("loading");

  useEffect(() => {
    const initData = getInitData();
    if (!initData) {
      // Небольшая задержка на случай, если telegram-web-app.js ещё не успел выполниться.
      const timeout = setTimeout(() => {
        if (!getInitData()) setStatus("no_telegram");
      }, 500);
      return () => clearTimeout(timeout);
    }

    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === "authenticated") {
          window.location.href = "/feed";
        } else if (res.ok && data.status === "needs_registration") {
          window.location.href = "/onboarding";
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <div className="relative h-[75px] w-[220px]">
        <Image src="/brand/logo/mesto-logo-3d.png" alt="МЕСТО" fill className="object-contain" priority />
      </div>

      {status === "loading" && (
        <>
          <div className="h-1.5 w-48 overflow-hidden rounded-pill bg-lavender-100">
            <div className="splash-progress-bar h-full rounded-pill bg-brand-gradient" />
          </div>
          <span className="relative block h-[29px] w-[220px]">
            <Image
              src="/brand/logo/mesto-tagline.svg"
              alt="Когда есть куда пойти, но не с кем"
              fill
              className="object-contain"
            />
          </span>
        </>
      )}

      {status === "no_telegram" && (
        <p className="max-w-[280px] text-sm text-ink-600">
          Это приложение открывается только внутри Telegram. Открой его через кнопку в боте.
        </p>
      )}

      {status === "error" && (
        <p className="max-w-[280px] text-sm text-ink-600">
          Что-то пошло не так. Попробуй закрыть и открыть приложение снова.
        </p>
      )}
    </div>
  );
}
ENDOFFILE

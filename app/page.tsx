"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { getInitData } from "@/lib/telegram/webapp-client";

/**
 * Точка входа Mini App. Ждёт initData от Telegram, вызывает /api/auth и
 * редиректит:
 *   - "authenticated"       → /feed (или на ?goto=..., см. EntryPageInner)
 *   - "needs_registration"  → /onboarding
 *   - ошибка / initData нет → показываем сообщение "открой через Telegram"
 *
 * Пока идёт проверка — показываем брендированный экран загрузки (логотип +
 * полоса загрузки + слоган), а не голый текст.
 *
 * Suspense обязателен: useSearchParams() в клиентском компоненте требует
 * границу Suspense при статической генерации страницы, иначе сборка Next.js
 * падает с ошибкой.
 */
export default function EntryPage() {
  return (
    <Suspense fallback={<SplashScreen status="loading" />}>
      <EntryPageInner />
    </Suspense>
  );
}

function EntryPageInner() {
  const [status, setStatus] = useState<"loading" | "no_telegram" | "error">("loading");
  const searchParams = useSearchParams();
  // Кнопка "Купить подписку" в боте открывает приложение с ?goto=subscriptions —
  // после обычной проверки авторизации ниже редиректим сразу туда, а не в /feed.
  const goto = searchParams.get("goto");

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
          const allowedGotoPaths = new Set(["subscriptions", "admin"]);
          window.location.href = goto && allowedGotoPaths.has(goto) ? `/${goto}` : "/feed";
        } else if (res.ok && data.status === "needs_registration") {
          window.location.href = "/onboarding";
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  return <SplashScreen status={status} />;
}

function SplashScreen({ status }: { status: "loading" | "no_telegram" | "error" }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cover bg-center px-8 text-center"
      style={{ backgroundImage: "url(/brand/backgrounds/gradient-bg.jpg)" }}
    >
      <div className="relative h-[180px] w-[180px]">
        <Image src="/brand/logo/mesto-mascot.png" alt="МЕСТО" fill className="object-contain" priority />
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

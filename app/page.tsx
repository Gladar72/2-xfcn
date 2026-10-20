"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingScenes } from "@/components/brand/LoadingScenes";
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
  // Первый запуск — полная анимация (Мося бежит по стенкам, ~4,6 с),
  // дальше — короткая версия, чтобы не задерживать вход.
  const [full, setFull] = useState(false);
  const fullRef = useRef(false);
  useEffect(() => {
    try {
      fullRef.current = !localStorage.getItem("mesto_splash_seen");
    } catch {
      fullRef.current = false;
    }
    setFull(fullRef.current);
  }, []);
  const startedAt = useRef(Date.now());
  const go = (url: string) => {
    try {
      localStorage.setItem("mesto_splash_seen", "1");
    } catch {
      /* без хранилища — просто всегда короткая анимация не включится */
    }
    const wait = Math.max(0, (fullRef.current ? 4600 : 900) - (Date.now() - startedAt.current));
    setTimeout(() => {
      window.location.href = url;
    }, wait);
  };

  useEffect(() => {
    const initData = getInitData();
    if (!initData) {
      // Небольшая задержка на случай, если telegram-web-app.js ещё не успел выполниться.
      // Открыли в обычном браузере (не в Telegram) — на страницу входа по почте / Telegram.
      const timeout = setTimeout(() => {
        if (!getInitData()) window.location.replace(`/login${goto ? `?goto=${encodeURIComponent(goto)}` : ""}`);
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
          // Кнопка «Открыть встречу» под напоминанием в боте: ?goto=event_<id>.
          // «📸 Сторис» под напоминанием «никто не откликнулся»: ?goto=eventshare_<id> — сразу окно «Поделиться».
          const eventMatch = goto?.match(/^event(share)?_([0-9a-f-]{36})$/);
          // Кнопка «Открыть чат» под уведомлением о сообщении: ?goto=chat_<id>.
          const chatMatch = goto?.match(/^chat_([0-9a-f-]{36})$/);
          go(eventMatch
            ? `/events/${eventMatch[2]}${eventMatch[1] ? "?share=1" : ""}`
            : chatMatch
              ? `/chats/${chatMatch[1]}`
            : goto && allowedGotoPaths.has(goto)
              ? `/${goto}`
              : "/feed");
        } else if (res.ok && data.status === "needs_registration") {
          // Пришёл по ссылке на встречу — после анкеты вернём его на эту встречу.
          const pendingEvent = goto?.match(/^event_([0-9a-f-]{36})$/);
          if (pendingEvent) {
            try {
              sessionStorage.setItem("mesto_after_onboarding", `/events/${pendingEvent[1]}`);
            } catch {
              /* хранилище недоступно — просто попадёт в ленту */
            }
          }
          go("/onboarding");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  return <SplashScreen status={status} full={full} />;
}

/** Экран загрузки: три сцены с персонажами «Места» (components/brand/LoadingScenes). */
function SplashScreen({ status }: { status: "loading" | "no_telegram" | "error"; full?: boolean }) {
  const message =
    status === "no_telegram"
      ? "Это приложение открывается только внутри Telegram. Открой его через кнопку в боте."
      : status === "error"
        ? "Что-то пошло не так. Попробуй закрыть и открыть приложение снова."
        : undefined;
  return <LoadingScenes message={message} loading={status === "loading"} />;
}

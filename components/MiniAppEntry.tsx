"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingScenes } from "@/components/brand/LoadingScenes";
import { getInitData } from "@/lib/telegram/webapp-client";
import { waitForLaunchData } from "@/lib/telegram/launch-data";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { TELEGRAM_BOT_URL } from "@/components/telegram/TelegramLoginWidget";

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
  const [errorMessage, setErrorMessage] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const navigationTimer = useRef<ReturnType<typeof setTimeout>>();
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
    navigationTimer.current = setTimeout(() => {
      window.location.href = url;
    }, wait);
  };

  useEffect(() => {
    const controller = new AbortController();
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus("loading");
    setErrorMessage(undefined);
    async function authenticate() {
      const initData = await waitForLaunchData(getInitData, controller.signal);
      if (controller.signal.aborted) return;
      if (!initData) {
        window.location.replace(`/login${goto ? `?goto=${encodeURIComponent(goto)}` : ""}`);
        return;
      }
      requestTimer = setTimeout(() => {
        setErrorMessage("Сервер долго отвечает. Проверь интернет и попробуй ещё раз.");
        setStatus("error");
        controller.abort();
      }, 15000);

      fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (controller.signal.aborted) return;
          if (res.ok && data.status === "authenticated") {
            const allowedGotoPaths = new Set(["subscriptions", "admin", "create"]);
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
            setErrorMessage(apiErrorText(data, "Не получилось войти. Попробуй ещё раз.", res.status));
            setStatus("error");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setErrorMessage("Нет связи с сервером. Проверь интернет и попробуй ещё раз.");
            setStatus("error");
          }
        })
        .finally(() => clearTimeout(requestTimer));
    }
    void authenticate();
    return () => {
      controller.abort();
      clearTimeout(requestTimer);
      clearTimeout(navigationTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, goto]);

  return <SplashScreen status={status} full={full} errorMessage={errorMessage} onRetry={() => setAttempt((n) => n + 1)} />;
}

/** Экран загрузки: три сцены с персонажами «Места» (components/brand/LoadingScenes). */
function SplashScreen({ status, errorMessage, onRetry }: { status: "loading" | "no_telegram" | "error"; full?: boolean; errorMessage?: string; onRetry?: () => void }) {
  const message =
    status === "no_telegram"
      ? "Это приложение открывается только внутри Telegram. Открой его через кнопку в боте."
      : status === "error"
        ? errorMessage ?? "Не получилось войти. Попробуй открыть приложение снова."
        : undefined;
  return <>
    <LoadingScenes message={message} loading={status === "loading"} />
    {status === "error" && <div style={{ position: "fixed", bottom: "max(24px, env(safe-area-inset-bottom))", left: 20, right: 20, zIndex: 20, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
      <button type="button" onClick={onRetry} className="m-btn m-btn-v px-5 py-3">Попробовать снова</button>
      <a href={TELEGRAM_BOT_URL} className="m-btn m-btn-o px-5 py-3">Открыть через бота</a>
    </div>}
  </>;
}

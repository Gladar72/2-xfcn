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
          // Кнопка «Открыть встречу» под напоминанием в боте: ?goto=event_<id>.
          const eventMatch = goto?.match(/^event_([0-9a-f-]{36})$/);
          // Кнопка «Открыть чат» под уведомлением о сообщении: ?goto=chat_<id>.
          const chatMatch = goto?.match(/^chat_([0-9a-f-]{36})$/);
          window.location.href = eventMatch
            ? `/events/${eventMatch[1]}`
            : chatMatch
              ? `/chats/${chatMatch[1]}`
            : goto && allowedGotoPaths.has(goto)
              ? `/${goto}`
              : "/feed";
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
          window.location.href = "/onboarding";
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  return <SplashScreen status={status} />;
}

/** Предметы вокруг маскота: картинка, позиция в % от сцены, размер, задержка «парения». */
const SPLASH_PROPS = [
  { src: "/brand/3d/coffee.png", left: "4%", top: "0%", size: 92, delay: "0s", tilt: -8 },
  { src: "/brand/3d/workout.png", left: "68%", top: "6%", size: 96, delay: "0.6s", tilt: 10 },
  { src: "/brand/3d/movie.png", left: "-2%", top: "54%", size: 84, delay: "1.1s", tilt: -10 },
  { src: "/brand/3d/walk.png", left: "72%", top: "60%", size: 88, delay: "0.3s", tilt: 8 },
];

function SplashScreen({ status }: { status: "loading" | "no_telegram" | "error" }) {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-10 pt-6 text-center"
      style={{ background: "radial-gradient(120% 70% at 50% 40%, #FFFFFF 0%, #F6F2FF 60%, #F1ECFF 100%)" }}
    >
      {/* Сцена: маскот в центре, вокруг парят кофе, гантеля, кино и кроссовок */}
      <div className="relative h-[330px] w-[340px] max-w-full">
        {SPLASH_PROPS.map((p) => (
          <div
            key={p.src}
            className="splash-float absolute"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: p.delay }}
            aria-hidden
          >
            <Image
              src={p.src}
              alt=""
              fill
              sizes="100px"
              priority
              className="object-contain drop-shadow-[0_10px_14px_rgba(108,59,255,0.18)]"
              style={{ transform: `rotate(${p.tilt}deg)` }}
            />
          </div>
        ))}
        <div className="absolute left-1/2 top-[24%] h-[240px] w-[230px] -translate-x-1/2">
          <Image
            src="/brand/logo/mesto-mascot.png"
            alt="МЕСТО"
            fill
            sizes="240px"
            priority
            className="splash-wave object-contain drop-shadow-[0_16px_22px_rgba(76,40,180,0.22)]"
          />
        </div>
      </div>

      <h1 className="mt-10 text-[56px] font-black leading-none tracking-tight text-[#20102F]">МЕСТО</h1>
      <p className="mt-3 text-xl leading-snug text-[#20102F]">
        Когда есть куда пойти,
        <br />
        но не с кем.
      </p>

      {status === "loading" && (
        <div className="mt-14 flex items-center gap-3" role="status" aria-label="Загрузка">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="splash-dot h-3 w-3 rounded-full bg-accent"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      )}

      {status === "no_telegram" && (
        <p className="mt-10 max-w-[280px] text-sm text-ink-600">
          Это приложение открывается только внутри Telegram. Открой его через кнопку в боте.
        </p>
      )}

      {status === "error" && (
        <p className="mt-10 max-w-[280px] text-sm text-ink-600">
          Что-то пошло не так. Попробуй закрыть и открыть приложение снова.
        </p>
      )}
    </div>
  );
}

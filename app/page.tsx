"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/brand/Logo";
import { Character } from "@/components/brand/AliveStage";
import { CAST } from "@/components/brand/characters";
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
          go(eventMatch
            ? `/events/${eventMatch[1]}`
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

/** Персонажи, которые «выскакивают» вокруг, когда Мося добегает до центра. */
const POPS: [number, number, number][] = [
  [7, 150, 64],
  [76, 140, 70],
  [5, 330, 54],
  [82, 320, 50],
  [45, 96, 40],
  [83, 560, 42],
  [4, 560, 38],
];

function SplashScreen({ status, full = false }: { status: "loading" | "no_telegram" | "error"; full?: boolean }) {
  const runner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const r = runner.current;
    if (!full || !r || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Мося выбегает слева, бежит по полу, вверх по правой стенке, по
    // потолку, вниз по левой и прыгает в центр — где превращается в героя.
    const H = window.innerHeight;
    const Wd = window.innerWidth;
    const h = 43;
    const P2: [number, number, number][] = [
      [-60, H - 34 - h, 0],
      [Wd - h, H - 34 - h, 0],
      [Wd - h, H - 34 - h, -90],
      [Wd - h, 96, -90],
      [Wd - h, 96, -180],
      [h, 96, -180],
      [h, 96, -270],
      [h, H * 0.51, -270],
      [Wd / 2, H * 0.36, -360],
    ];
    const L = [0];
    for (let i = 1; i < P2.length; i++) {
      const d = Math.hypot(P2[i][0] - P2[i - 1][0], P2[i][1] - P2[i - 1][1]) + Math.abs(P2[i][2] - P2[i - 1][2]) * 0.9;
      L.push(L[i - 1] + d);
    }
    const T = L[L.length - 1];
    const kf: Keyframe[] = P2.map((p, i) => ({
      transform: `translate(${p[0] - h}px,${p[1] - h}px) rotate(${p[2]}deg) scale(${i === P2.length - 1 ? 2.2 : 1})`,
      opacity: i === P2.length - 1 ? 0 : 1,
      offset: L[i] / T,
    }));
    r.animate(kf, { duration: 2900, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "forwards" });
  }, [full]);

  return (
    <div className={`m-splash m-aurora ${full ? "" : "fast"}`}>
      {full && (
        <div ref={runner} className="runner" aria-hidden style={{ transform: "translate(-200px,0)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mosya/mosya_run.webp" alt="" />
        </div>
      )}
      <div aria-hidden>
        {POPS.map(([x, y, s], i) => (
          <span
            key={i}
            className="pp2"
            style={{
              left: `${x}%`,
              top: `calc(${(y / 844) * 100}% )`,
              width: s,
              height: s,
              animationDelay: `${(full ? 2.95 : 0.1) + i * 0.07}s`,
            }}
          >
            <Character shape={CAST[i][0]} pal={CAST[i][1]} face={CAST[i][2]} size={s} seed={i + 3} />
          </span>
        ))}
      </div>

      <div className="lockup">
        <div className="hero-m">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mosya/mosya_wave.webp" alt="" />
        </div>
        <div className="wm">
          <Wordmark height={52} color="#16121F" />
        </div>
        <p className="tag">Есть куда пойти. Найдём, с кем</p>

        {status === "no_telegram" && (
          <p className="mt-4 max-w-[280px] text-sm text-ink-600">
            Это приложение открывается только внутри Telegram. Открой его через кнопку в боте.
          </p>
        )}

        {status === "error" && (
          <p className="mt-4 max-w-[280px] text-sm text-ink-600">
            Что-то пошло не так. Попробуй закрыть и открыть приложение снова.
          </p>
        )}
      </div>

      {status === "loading" && (
        <div className="load" role="status" aria-label="Загрузка">
          <i />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

/**
 * «Быстрый доступ»: предлагаем иконку «Места» на главный экран телефона
 * (Telegram Bot API 8.0, addToHomeScreen). Показываем на главной:
 * при первом заходе (в т.ч. сразу после регистрации), потом напоминаем раз в 3 дня, не больше 4 раз.
 * Если иконка уже стоит или телефон не умеет — не показываем вовсе.
 * Окно — родное окно Telegram «Быстрый доступ» (телефон с нашей иконкой,
 * «Напомнить позже» / «Добавить на экран»): его открывает addToHomeScreen().
 */
const KEY = "mesto_homescreen_v1";
const EVERY_MS = 3 * 24 * 3600 * 1000;
const MAX_TIMES = 4;

type State = { shown: number; last: number; done?: boolean };

function read(): State {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as State;
  } catch {
    return { shown: 0, last: 0 };
  }
}
function write(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — просто не запомним */
  }
}
export function HomeScreenPrompt() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/feed") return;
    const wa = getTelegramWebApp();
    if (!wa?.addToHomeScreen || !wa.checkHomeScreenStatus || !wa.isVersionAtLeast?.("8.0")) return;
    if (wa.platform !== "ios" && wa.platform !== "android") return;
    const st = read();
    if (st.done || st.shown >= MAX_TIMES || (st.last && Date.now() - st.last < EVERY_MS)) return;
    let alive = true;
    const t = setTimeout(() => {
      wa.checkHomeScreenStatus?.((status) => {
        if (!alive) return;
        if (status === "added" || status === "unsupported") {
          write({ ...st, done: true });
          return;
        }
        write({ shown: st.shown + 1, last: Date.now() });
        try {
          wa.addToHomeScreen?.();
        } catch {
          /* не вышло — напомним в следующий раз */
        }
      });
    }, 4000);
    const added = () => {
      write({ ...read(), done: true });
    };
    wa.onEvent("homeScreenAdded", added);
    return () => {
      alive = false;
      clearTimeout(t);
      wa.offEvent("homeScreenAdded", added);
    };
  }, [pathname]);

  return null;
}

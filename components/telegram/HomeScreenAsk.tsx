"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { Sheet, Toast } from "@/components/proto/ui";

/**
 * «Быстрый доступ» (шторка прототипа): предлагаем добавить «Место»
 * на экран «Домой», чтобы открывать в одно касание. Показываем, только если
 * ярлыка ещё нет: после регистрации, при открытии (раз в сутки) и после 3 минут
 * в приложении (раз в 6 часов). Если Telegram не умеет ставить значок сам —
 * подсказываем, где это в меню «⋯».
 */
const KEY = "mesto_home_ask";
const LAUNCHES = "mesto_launches";
const LATER_DAYS = 1;

function read(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* нет хранилища */
  }
}

/** Вызвать вручную (кнопка в настройках). true — Telegram открыл окно добавления. */
export function addToHome(): boolean {
  const w = getTelegramWebApp();
  if (!w?.addToHomeScreen || !w.isVersionAtLeast?.("8.0")) return false;
  w.addToHomeScreen();
  return true;
}

export function HomeScreenAsk() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Умеет ли Telegram сам поставить значок (иначе — подсказка, где это в меню «⋯»).
  const [native, setNative] = useState(false);

  useEffect(() => {
    const w = getTelegramWebApp();
    if (!w?.initData) return;
    if (read(KEY) === "added") return;
    const n = Number(read(LAUNCHES) ?? "0") + 1;
    write(LAUNCHES, String(n));
    const canNative = !!w.addToHomeScreen && !!w.isVersionAtLeast?.("8.0");
    setNative(canNative);
    const added = () => {
      write(KEY, "added");
      setOpen(false);
      setToast("Добавлено на экран «Домой»");
      setTimeout(() => setToast(null), 2600);
    };
    if (canNative) w.onEvent("homeScreenAdded", added);

    // Когда показываем: сразу после регистрации (первое открытие), при открытии сервиса
    // (не чаще раза в сутки) и ещё раз, если человек провёл в приложении 3 минуты (не чаще раза в 6 часов).
    const last = Number(read(KEY) ?? "0") || 0;
    const ago = Date.now() - last;
    let disposed = false;
    let timer = 0;
    const show = (ms: number) => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        // A delayed offer must never cover a profile, filters, keyboard or an
        // existing dialog while the user is trying to close or operate it.
        const editing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
        if (document.hidden || window.location.pathname !== "/feed" || window.location.search ||
            editing || document.querySelector('[role="dialog"]')) {
          show(10_000);
          return;
        }
        write(KEY, String(Date.now()));
        setOpen(true);
      }, ms);
    };
    const go = () => {
      if (n === 1 || ago > LATER_DAYS * 864e5) show(2500);
      else if (ago > 6 * 36e5) show(3 * 60e3);
    };
    if (canNative && w.checkHomeScreenStatus) {
      w.checkHomeScreenStatus((status) => {
        if (status === "added") write(KEY, "added");
        else go();
      });
    } else go();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (canNative) w.offEvent("homeScreenAdded", added);
    };
  }, []);

  // An automatic offer belongs only on the home screen.
  const busy = path !== "/feed";
  useEffect(() => { if (busy) setOpen(false); }, [busy]);

  function later() {
    write(KEY, String(Date.now()));
    setOpen(false);
  }

  return (
    <>
      <Sheet open={open && !busy} onClose={later} label="Быстрый доступ">
        <h2 className="t">
          Быстрый <em>доступ</em>
        </h2>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          Добавь «Место» на экран «Домой» — открывай в одно касание, как обычное приложение.
        </p>
        <div className="gl" style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/appicon-new.webp" alt="" width={56} height={56} style={{ borderRadius: 14, flex: "none" }} />
          <span style={{ display: "grid", gap: 2 }}>
            <b style={{ fontWeight: 600, fontSize: 16 }}>Место</b>
            <small className="muted" style={{ fontSize: 13 }}>Найди компанию на сегодня</small>
          </span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {native ? (
            <button
              className="btn v"
              onClick={() => {
                write(KEY, String(Date.now()));
                setOpen(false);
                addToHome();
              }}
            >
              Добавить
            </button>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5, textAlign: "center" }}>
              Нажми «⋯» вверху справа → «Добавить на экран „Домой“»
            </p>
          )}
          <button className="btn o" onClick={later}>
            Позже
          </button>
        </div>
      </Sheet>
      <Toast text={toast} />
    </>
  );
}

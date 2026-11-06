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
  try { w.addToHomeScreen(); return true; } catch { return false; }
}

export function HomeScreenAsk() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Умеет ли Telegram сам поставить значок (иначе — подсказка, где это в меню «⋯»).
  const [native, setNative] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    let readyTimer = 0;
    let statusTimer = 0;
    let toastTimer = 0;
    let unsubscribe = () => {};
    const deadline = Date.now() + 10_000;
    const init = () => {
      if (disposed) return;
      const w = getTelegramWebApp();
      // The Telegram script can arrive after the app has mounted.
      if (!w?.initData) {
        if (Date.now() < deadline) readyTimer = window.setTimeout(init, 250);
        return;
      }
      const n = Number(read(LAUNCHES) ?? "0") + 1;
      write(LAUNCHES, String(n));
      const canNative = !!w.addToHomeScreen && !!w.isVersionAtLeast?.("8.0");
      setNative(canNative);
      const added = () => {
        if (disposed) return;
        window.clearTimeout(timer);
        window.clearTimeout(statusTimer);
        write(KEY, "added");
        setOpen(false);
        setToast("Добавлено на экран «Домой»");
        toastTimer = window.setTimeout(() => setToast(null), 2600);
      };
      if (canNative) {
        w.onEvent("homeScreenAdded", added);
        unsubscribe = () => w.offEvent("homeScreenAdded", added);
      }
      const show = (ms: number) => {
        if (disposed) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (read(KEY) === "added") return;
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
        if (read(KEY) === "added") return;
        const ago = Date.now() - (Number(read(KEY) ?? "0") || 0);
        if (n === 1 || ago > LATER_DAYS * 864e5) show(2500);
        else if (ago > 6 * 36e5) show(3 * 60e3);
      };
      if (canNative && w.checkHomeScreenStatus) {
        // A missing native callback must not disable the offer forever.
        statusTimer = window.setTimeout(go, 1500);
        try {
          w.checkHomeScreenStatus((status) => {
            if (disposed) return;
            window.clearTimeout(statusTimer);
            if (status === "added" || status === "unsupported") {
              window.clearTimeout(timer);
              setOpen(false);
              if (status === "added") write(KEY, "added");
            } else {
              // Recheck even a stored "added": the icon may have been removed.
              if (status === "missed" && read(KEY) === "added") write(KEY, "0");
              go();
            }
          });
        } catch { window.clearTimeout(statusTimer); go(); }
      } else go();
    };
    init();
    return () => {
      disposed = true;
      [timer, readyTimer, statusTimer, toastTimer].forEach(id => window.clearTimeout(id));
      unsubscribe();
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

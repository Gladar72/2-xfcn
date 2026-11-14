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

/** Ссылка на «Место» в App Store. На iPhone вместо ярлыка предлагаем скачать приложение. */
export const APP_STORE_URL = "https://apps.apple.com/ru/app/id6833348222";
export function isTelegramIos(): boolean {
  return getTelegramWebApp()?.platform === "ios";
}
export function openAppStore() {
  const w = getTelegramWebApp();
  try {
    if (w?.openLink) w.openLink(APP_STORE_URL);
    else window.open(APP_STORE_URL, "_blank");
  } catch {
    window.location.href = APP_STORE_URL;
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
  // На iPhone вместо ярлыка — приложение из App Store.
  const [ios, setIos] = useState(false);

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
      if (w.platform === "ios") {
        // iPhone: предлагаем скачать приложение. Ярлык не проверяем.
        setIos(true);
        const IOS_KEY = "mesto_appstore_ask";
        const last = Number(read(IOS_KEY) ?? "0") || 0;
        if (read(IOS_KEY) === "done") return;
        const wait = n === 1 ? 2500 : Date.now() - last > 3 * 864e5 ? 4000 : -1;
        if (wait < 0) return;
        const tryShow = () => {
          if (disposed) return;
          const editing = document.activeElement?.matches("input, textarea, [contenteditable=true]");
          if (document.hidden || window.location.pathname !== "/feed" || window.location.search ||
              editing || document.querySelector('[role="dialog"]')) {
            timer = window.setTimeout(tryShow, 10_000);
            return;
          }
          write(IOS_KEY, String(Date.now()));
          setOpen(true);
        };
        timer = window.setTimeout(tryShow, wait);
        return;
      }
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
    write(ios ? "mesto_appstore_ask" : KEY, String(Date.now()));
    setOpen(false);
  }

  if (ios) {
    return (
      <Sheet open={open && !busy} onClose={later} label="Приложение для iPhone">
        <h2 className="t">
          «Место» для <em>iPhone</em>
        </h2>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          Скачай приложение из App Store — быстрее, с уведомлениями о заявках и сообщениях. Вход тот же, все встречи и чаты на месте.
        </p>
        <div className="gl" style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo/appicon-new.webp" alt="" width={56} height={56} style={{ borderRadius: 14, flex: "none" }} />
          <span style={{ display: "grid", gap: 2 }}>
            <b style={{ fontWeight: 600, fontSize: 16 }}>Место — найди компанию</b>
            <small className="muted" style={{ fontSize: 13 }}>Бесплатно в App Store</small>
          </span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <button
            className="btn v"
            onClick={() => {
              write("mesto_appstore_ask", "done");
              setOpen(false);
              openAppStore();
            }}
          >
            Скачать в App Store
          </button>
          <button className="btn o" onClick={later}>
            Позже
          </button>
        </div>
      </Sheet>
    );
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

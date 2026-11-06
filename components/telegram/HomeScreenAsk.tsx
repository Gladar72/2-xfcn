"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";
import { Sheet, Toast } from "@/components/proto/ui";

/**
 * «Быстрый доступ» (шторка прототипа): предлагаем добавить «Место»
 * на экран «Домой», чтобы открывать в одно касание. Показываем, только если
 * Telegram это умеет и ярлыка ещё нет; с первого запуска,
 * после «Позже» — снова через 14 дней.
 */
const KEY = "mesto_home_ask";
const LAUNCHES = "mesto_launches";
const LATER_DAYS = 14;

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

  useEffect(() => {
    const w = getTelegramWebApp();
    if (!w?.checkHomeScreenStatus || !w.isVersionAtLeast?.("8.0")) return;
    const n = Number(read(LAUNCHES) ?? "0") + 1;
    write(LAUNCHES, String(n));
    const added = () => {
      write(KEY, "added");
      setOpen(false);
      setToast("Добавлено на экран «Домой»");
      setTimeout(() => setToast(null), 2600);
    };
    w.onEvent("homeScreenAdded", added);
    const last = read(KEY);
    const due = n >= 1 && last !== "added" && (!last || Date.now() - Number(last) > LATER_DAYS * 864e5);
    let t = 0;
    if (due) {
      w.checkHomeScreenStatus((status) => {
        if (status === "missed") t = window.setTimeout(() => setOpen(true), 2500);
        if (status === "added") write(KEY, "added");
      });
    }
    return () => {
      window.clearTimeout(t);
      w.offEvent("homeScreenAdded", added);
    };
  }, []);

  // Не мешаем во время создания встречи и в чате.
  const busy = /^\/(create|chats\/)/.test(path ?? "");

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
          <img src="/brand/logo/app-icon.png" alt="" width={56} height={56} style={{ borderRadius: 14, flex: "none" }} />
          <span style={{ display: "grid", gap: 2 }}>
            <b style={{ fontWeight: 600, fontSize: 16 }}>Место</b>
            <small className="muted" style={{ fontSize: 13 }}>Найди компанию на сегодня</small>
          </span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
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
          <button className="btn o" onClick={later}>
            Позже
          </button>
        </div>
      </Sheet>
      <Toast text={toast} />
    </>
  );
}

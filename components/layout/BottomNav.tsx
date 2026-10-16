"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { doneHints } from "@/lib/meet-hints";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Ic } from "@/components/proto/ui";

/**
 * Таббар из прототипа: тёмная стеклянная «таблетка», подсветка активной
 * вкладки переезжает пружиной, по центру — градиентный «+» (создать встречу).
 * Виден только на экранах-вкладках, на остальных уезжает вниз (.hide).
 */
const TABS = [
  { href: "/feed", label: "Главная", icon: "home" },
  { href: "/map", label: "Карта", icon: "map" },
  { href: "/create", label: "", icon: "plus" },
  { href: "/my-events", label: "Встречи", icon: "cal" },
  { href: "/profile", label: "Профиль", icon: "user" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const isTab = (pathname === "/feed" && !sp.get("category")) || ["/map", "/my-events", "/profile"].includes(pathname);
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ x: number; on: boolean }>({ x: 0, on: false });
  // Цифра на «Встречи» — сколько новых заявок ждут ответа на мои встречи.
  // Плюс намёки «Хочу на встречу», которые ещё не разобраны.
  const [pending, setPending] = useState(0);
  const [hints, setHints] = useState<string[]>([]);
  const [hintsDone, setHintsDone] = useState(0);
  useEffect(() => {
    if (!isTab) return;
    fetch("/api/me/pending-applications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPending(typeof d?.count === "number" ? d.count : 0))
      .catch(() => {});
    fetch("/api/me/meet-hints")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHints(((d?.items ?? []) as { notificationId: string }[]).map((h) => h.notificationId)))
      .catch(() => {});
  }, [pathname, isTab]);
  useEffect(() => {
    const on = () => setHintsDone((n) => n + 1);
    window.addEventListener("mesto:hints", on);
    return () => window.removeEventListener("mesto:hints", on);
  }, []);
  const openHints = useMemo(() => {
    const done = doneHints();
    return hints.filter((id) => !done.has(id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hints, hintsDone]);
  const badge = pending + openHints;

  useEffect(() => {
    const on = navRef.current?.querySelector<HTMLElement>(".tab.on");
    setInd(on ? { x: on.offsetLeft, on: true } : { x: 0, on: false });
  }, [pathname, isTab]);

  return (
    <nav ref={navRef} className={`tabbar ${isTab ? "" : "hide"}`} aria-label="Разделы">
      <span className="tind" style={{ transform: `translateX(${ind.x}px)`, opacity: ind.on ? 1 : 0 }} />
      {TABS.map((t) =>
        t.icon === "plus" ? (
          <Link key={t.href} href="/create" className="tab plus" aria-label="Создать встречу">
            <Ic n="plus" />
          </Link>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            className={`tab ${pathname === t.href ? "on" : ""}`}
            aria-current={pathname === t.href ? "page" : undefined}
            style={{ position: "relative" }}
          >
            <Ic n={t.icon} />
            {t.href === "/my-events" && badge > 0 && (
              <span
                aria-label={`Новое на встречах: ${badge}`}
                style={{ position: "absolute", top: 4, left: "58%", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "#FF3B6B", color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center", boxShadow: "0 0 0 2px rgba(22,18,31,.85)" }}
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
            <span className="lb">{t.label}</span>
          </Link>
        )
      )}
    </nav>
  );
}

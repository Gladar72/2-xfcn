"use client";

import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { doneHints } from "@/lib/meet-hints";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Creature } from "@/components/brand/Creature";

/**
 * Меню брендбука 2026: светлая стеклянная плашка с вырезом по центру, в
 * вырезе «утоплена» живая капля Мося с «+» (создать встречу). Форма выреза
 * строится под ширину экрана (clip-path), чтобы края были ровными на любом
 * телефоне. Видно только на экранах-вкладках, на остальных уезжает вниз.
 */
const H = 58;
function navPath(w: number): string {
  const c = w / 2;
  const f = (n: number) => +n.toFixed(2);
  return `M29 0H${f(c - 44.82)}A6 6 0 0 1 ${f(c - 38.84)} 6.53A39 39 0 1 0 ${f(c + 38.84)} 6.53A6 6 0 0 1 ${f(c + 44.82)} 0H${f(w - 29)}A29 29 0 0 1 ${f(w - 29)} ${H}H29A29 29 0 0 1 29 0Z`;
}

const ICONS: Record<string, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z" />,
  map: <path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14" />,
  people: <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />
    </>
  ),
};
function NavIcon({ n }: { n: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[n]}
    </svg>
  );
}
const TABS = [
  { href: "/feed", label: "Главная", icon: "home" },
  { href: "/map", label: "Карта", icon: "map" },
  { href: "/create", label: "", icon: "plus" },
  { href: "/my-events", label: "Встречи", icon: "people" },
  { href: "/profile", label: "Профиль", icon: "user" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const isTab = (pathname === "/feed" && !sp.get("category")) || ["/map", "/my-events", "/profile"].includes(pathname);
  const navRef = useRef<HTMLElement>(null);
  const [w, setW] = useState(358);
  const [jelly, setJelly] = useState(false);
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

  // Ширина плашки — под экран: от неё строится вырез под каплей.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width) || 358);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const path = navPath(w);

  const tab = (t: (typeof TABS)[number]) => (
    <Link
      key={t.href}
      href={t.href}
      className={`it ${pathname === t.href ? "on" : ""}`}
      aria-current={pathname === t.href ? "page" : undefined}
    >
      <span className="ni">
        <NavIcon n={t.icon} />
        {t.href === "/my-events" && badge > 0 && (
          <span className="nbadge" aria-label={`Новое на встречах: ${badge}`}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="lb">{t.label}</span>
    </Link>
  );

  return (
    <nav ref={navRef} className={`nav26 ${isTab ? "" : "hide"}`} aria-label="Разделы">
      <span className="bgp" style={{ clipPath: `path("${path}")`, WebkitClipPath: `path("${path}")` }} aria-hidden />
      <svg className="edge" width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden>
        <path d={path} fill="none" stroke="#fff" strokeWidth={1.2} />
      </svg>
      <Link
        href="/create"
        className={`bl ${jelly ? "jelly" : ""}`}
        aria-label="Создать встречу"
        onClick={() => {
          setJelly(true);
          window.setTimeout(() => setJelly(false), 700);
        }}
      >
        <Creature size={104} variant="p" />
        <span className="pl" aria-hidden />
      </Link>
      {tab(TABS[0])}
      {tab(TABS[1])}
      <span className="sp" aria-hidden />
      {tab(TABS[3])}
      {tab(TABS[4])}
    </nav>
  );
}

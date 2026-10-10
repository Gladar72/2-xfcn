"use client";

import { useEffect, useRef, useState } from "react";
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
          <Link key={t.href} href={t.href} className={`tab ${pathname === t.href ? "on" : ""}`} aria-current={pathname === t.href ? "page" : undefined}>
            <Ic n={t.icon} />
            <span className="lb">{t.label}</span>
          </Link>
        )
      )}
    </nav>
  );
}

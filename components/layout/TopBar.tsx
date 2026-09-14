"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  onCityPress?: () => void;
}

export function TopBar({ city, avatarUrl, onCityPress }: TopBarProps) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setHasUnread((data.items ?? []).some((n: { isRead: boolean }) => !n.isRead)))
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <button
        onClick={onCityPress}
        className="flex items-center gap-1 rounded-pill bg-white px-4 py-2 text-sm font-medium shadow-card"
      >
        {city} <Image src="/brand/icons/chevron-down.svg" alt="" width={14} height={14} />
      </button>

      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
          aria-label="Уведомления"
        >
          <Image src="/brand/icons/bell.svg" alt="" width={20} height={20} />
          {hasUnread && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
        </Link>

        <Link
          href="/profile"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card"
          aria-label="Профиль"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Image src="/brand/icons/avatar-placeholder.svg" alt="" width={20} height={20} className="brightness-0 invert" />
          )}
        </Link>
      </div>
    </div>
  );
}

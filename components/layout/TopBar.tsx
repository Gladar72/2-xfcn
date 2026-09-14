"use client";

import Image from "next/image";
import Link from "next/link";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  hasUnreadNotifications?: boolean;
  onCityPress?: () => void;
  onNotificationsPress?: () => void;
}

export function TopBar({
  city,
  avatarUrl,
  hasUnreadNotifications = false,
  onCityPress,
  onNotificationsPress,
}: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <button
        onClick={onCityPress}
        className="flex items-center gap-1 rounded-pill bg-white px-4 py-2 text-sm font-medium shadow-card"
      >
        {city} <span className="text-ink-400">▾</span>
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={onNotificationsPress}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
          aria-label="Уведомления"
        >
          <Image src="/brand/icons/bell.svg" alt="" width={20} height={20} />
          {hasUnreadNotifications && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
          )}
        </button>

        <Link
          href="/profile"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card"
          aria-label="Профиль"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            "🙂"
          )}
        </Link>
      </div>
    </div>
  );
}

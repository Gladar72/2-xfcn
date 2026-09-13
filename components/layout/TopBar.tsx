"use client";

interface TopBarProps {
  city: string;
  hasUnreadNotifications?: boolean;
  onCityPress?: () => void;
  onNotificationsPress?: () => void;
}

export function TopBar({
  city,
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

      <button
        onClick={onNotificationsPress}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
        aria-label="Уведомления"
      >
        🔔
        {hasUnreadNotifications && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
        )}
      </button>
    </div>
  );
}

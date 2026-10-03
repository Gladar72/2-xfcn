"use client";

/**
 * «Поделиться» встречей — как в Telegram: открывается стандартное окно
 * выбора чата, туда уходит ссылка t.me/<bot>?start=e_<id>. Получатель жмёт
 * ссылку — бот присылает карточку встречи с кнопкой «Открыть встречу».
 */
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";

export function eventShareUrl(eventId: string): string {
  return `https://t.me/${BOT_USERNAME}?start=e_${eventId}`;
}

export function ShareEventButton({
  eventId,
  title,
  when,
  className = "",
}: {
  eventId: string;
  title: string;
  when: string;
  className?: string;
}) {
  function share() {
    const link = eventShareUrl(eventId);
    const text = `${title} — ${when}. Пойдёшь со мной? 🙌`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } } }).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title, text, url: link }).catch(() => {});
      return;
    }
    window.open(shareUrl, "_blank", "noopener");
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Поделиться встречей"
      className={`flex items-center gap-1.5 rounded-pill bg-[#F1EAFF] px-4 py-2 text-sm font-semibold text-[color:var(--m-purple)] active:opacity-80 ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21.5 4.5 2.8 11.7c-.9.4-.9 1.6.1 1.9l4.7 1.5 1.8 5.6c.3.9 1.4 1.1 2 .4l2.6-2.7 4.9 3.6c.7.5 1.7.1 1.9-.8l3.1-14.9c.2-1.1-.8-1.9-1.9-1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m7.6 15.1 10-7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Поделиться
    </button>
  );
}

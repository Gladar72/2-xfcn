"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { K_ICONS } from "@/components/proto/k-icons";
import { photoThumb } from "@/lib/photos/thumb";
import { dayShort, costShort, type HeroEvent } from "@/components/proto/ui";
import { EventCardCover } from "@/components/events/EventCardCover";
import { FireChip } from "@/components/proto/Fire";

/**
 * Элементы экранов брендбука 2026 (классы k-* из app/k26.css, сгенерированного
 * из согласованного прототипа). Данные и переходы — настоящие, из приложения.
 */
const EXTRA: Record<string, string> = {
  down: '<path d="M6 9l6 6 6-6"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  ticket: '<path d="M4 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  minus: '<path d="M5 12h14"/>',
};

export function KI({ n, sw = 1.7, className, style }: { n: string; sw?: number; className?: string; style?: CSSProperties }) {
  const body = K_ICONS[n] ?? EXTRA[n] ?? "";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** Наша фирменная обложка (/brand/covers/…) — путь для сжатия на сервере, иначе null. */
function coverPath(url: string): string | null {
  return url.match(/^(?:https?:\/\/[^/]+)?(\/brand\/covers\/[a-z0-9_-]+\.webp)$/)?.[1] ?? null;
}

/** Share the exact displayed URL with the profile opened from this card. */
export function backgroundPhotoUrl(url: string | null | undefined, w = 480): string | null {
  if (!url) return null;
  const cover = coverPath(url);
  return cover ? `/_next/image?url=${encodeURIComponent(cover)}&w=${w >= 500 ? 640 : 384}&q=80` : photoThumb(url, Math.ceil(w / 2), true);
}

/** Фоновое фото карточки: сжатая версия, при отсутствии — мягкий жемчужный фон. */
export function bg(url: string | null | undefined, w = 480, pos = "center"): CSSProperties {
  return url
    ? // Сжатая копия под размер карточки (раньше шёл оригинал в несколько МБ — всё грузилось долго).
      { backgroundImage: `url(${backgroundPhotoUrl(url, w)})`, backgroundSize: "cover", backgroundPosition: pos }
    : { backgroundImage: "linear-gradient(160deg,#3A3646,#17141F)", backgroundSize: "cover" };
}

/** Заголовок в две строки, как в прототипе: последнее слово — курсивом Lora. */
export function TwoLine({ text }: { text: string }) {
  const t = text.trim();
  const i = t.lastIndexOf(" ");
  if (i < 3 || t.length > 34) return <>{t}</>;
  return (
    <>
      {t.slice(0, i)}{" "}
      <br />
      <em>{t.slice(i + 1)}</em>
    </>
  );
}

function plural(n: number, a: string, b: string, c: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
  return c;
}

/** Вертикальная карточка встречи (k-hc): тег сверху, название, время и кнопка. */
export function KHc({ e, cta, tag }: { e: HeroEvent & { myApplicationStatus?: string | null; isMine?: boolean }; cta?: string; tag?: ReactNode }) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const left = Math.max(0, e.seatsTotal - e.seatsTaken);
  const when = `${dayShort(e.eventDate)}, ${e.eventTime.slice(0, 5)}`;
  const who = e.isBusiness
    ? `${left > 0 ? `${left} ${plural(left, "место", "места", "мест")}` : "мест нет"}`
    : e.isAnonymous || e.organizerHidden
      ? "анонимно"
      : !e.organizer
      ? null
      : e.organizer.name;
  const kind = e.trainingType?.name ?? e.category?.name;
  const defTag = e.isLive
    ? (
        <>
          <i className="k-livedot" />
          Идёт сейчас
        </>
      )
    : e.isBusiness
      ? e.isPromoted || e.isBoosted
        ? "↑ В топе"
        : e.category?.name ?? "Афиша"
      : e.isAnonymous || e.organizerHidden
        ? `${going} из ${max} · анонимно`
        : `${going} из ${max}${kind ? ` · ${kind.toLowerCase()}` : ""}`;
  const status =
    e.isMine ? "Моя встреча" : e.myApplicationStatus === "accepted" ? "Ты идёшь" : e.myApplicationStatus === "pending" ? "Заявка отправлена" : null;
  return (
    <Link href={`/events/${e.id}`} prefetch={false} className="k-hc k-pr">
      <EventCardCover url={e.photoUrl} />
      <span className="k-chip k-gw k-tg">{tag ?? defTag}</span>
      <span className="k-bt">
        <span className="k-tt">
          <TwoLine text={e.title} />
        </span>
        <span className="k-mm" style={{ display: "block" }}>
          {[when, who].filter(Boolean).join(" · ")}
        </span>
        <span className="k-card-actions">
          <span className="k-cta">{cta ?? status ?? (e.isBusiness ? costShort(e) : "Я иду")}</span>
          <FireChip id={e.id} count={e.fireCount ?? 0} mine={!!e.myFire} />
        </span>
      </span>
    </Link>
  );
}

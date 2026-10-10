"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { Mosya } from "@/components/brand/Mosya";
import { coverGradient } from "@/components/feed/EventCard";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { confetti } from "@/lib/mosya/confetti";

export interface JoinEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  photoUrl?: string | null;
  category?: { slug: string } | null;
  isBusiness?: boolean;
  organizerHidden?: boolean;
}

/**
 * «Я иду» как в прототипе: сначала шторка «Отправить заявку?» с краткой
 * карточкой встречи, затем экран «Заявка отправлена» с шагами статуса.
 * Сам запрос делает родитель (onConfirm) — механика заявки прежняя.
 */
export function JoinFlow({
  event,
  phase,
  onConfirm,
  onClose,
}: {
  event: JoinEvent | null;
  phase: "confirm" | "sending" | "done" | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  if (!event || !phase) return null;

  if (phase === "done") {
    return (
      <div className="m-aurora m-fade-in fixed inset-0 z-[70] flex flex-col items-center justify-center px-6 text-center">
        <Mosya pose="wave" size={160} className="m-pop" />
        <h1 className="m-title mt-2">
          Заявка <span className="m-em">отправлена</span>
        </h1>
        <p className="mt-2 max-w-[310px] text-[14.5px] leading-snug text-ink-600">
          Организатор посмотрит твой профиль и ответит. Ответ придёт сюда и в Telegram.
        </p>
        <div className="m-glass mt-6 w-full max-w-[380px] space-y-3 rounded-[24px] p-4 text-left">
          <StatusRow done label="Заявка отправлена" />
          <StatusRow active label="Организатор смотрит профиль" />
          <StatusRow label="Ты в деле" />
        </div>
        <p className="mt-3 max-w-[310px] text-xs text-ink-400">
          За 2 часа до начала напомним в Telegram — с кнопками «Иду / Не смогу».
        </p>
        <button onClick={onClose} className="m-btn m-btn-k mt-6 max-w-[380px]">
          Смотреть другие встречи
        </button>
        <button onClick={() => router.push(`/events/${event.id}`)} className="m-btn mt-1 h-12 max-w-[380px] text-ink-600">
          Открыть встречу
        </button>
      </div>
    );
  }

  const icon = event.isBusiness ? CATEGORY_ICON.business : event.category ? CATEGORY_ICON[event.category.slug] : undefined;
  return (
    <div className="m-fade-in fixed inset-0 z-[70] flex flex-col justify-end bg-[rgba(22,18,31,0.35)]" onClick={onClose}>
      <div
        className="m-sheet-in m-glass-2 rounded-t-[30px] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
        <h2 className="m-title mb-4 text-[26px]">
          Отправить <span className="m-em">заявку?</span>
        </h2>
        <div className="flex items-center gap-3 rounded-[22px] bg-white/80 p-2.5 shadow-card">
          <div
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px]"
            style={{ background: event.photoUrl ? undefined : coverGradient(event.category?.slug, event.isBusiness) }}
          >
            {event.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="h-full w-full object-contain p-1.5" />
              )
            )}
          </div>
          <div className="min-w-0">
            <b className="block truncate text-[15.5px] font-medium">{event.title}</b>
            <span className="block truncate text-[13px] text-ink-600">
              {formatDay(event.eventDate)}, {event.eventTime.slice(0, 5)}
              {event.placeName && !event.organizerHidden ? ` · ${event.placeName}` : ""}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2.5 rounded-[18px] bg-[rgba(108,59,255,.08)] p-3 text-[13px] leading-snug text-ink-700">
          <Icon name="shield" size={20} className="shrink-0 text-accent" />
          Организатор посмотрит твой профиль и подтвердит участие. Ответ придёт в Telegram.
        </div>
        <div className="mt-2 flex items-center gap-2.5 rounded-[18px] bg-white/60 p-3 text-[13px] text-ink-600">
          <Icon name="bell" size={20} className="shrink-0 text-accent" />
          Напомним за 2 часа — кнопками «Иду / Не смогу»
        </div>
        <button onClick={onConfirm} disabled={phase === "sending"} className="m-btn m-btn-v mt-5">
          {phase === "sending" ? "Отправляем…" : "Отправить заявку"}
        </button>
        <button onClick={onClose} className="m-btn mt-1 h-12 text-ink-600">
          Не сейчас
        </button>
      </div>
    </div>
  );
}

function StatusRow({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
          done ? "bg-brand-gradient text-white" : active ? "bg-white shadow-[inset_0_0_0_2px_#9B5CFF]" : "bg-white/60"
        }`}
      >
        {done ? <Icon name="check" size={15} strokeWidth={2.6} /> : active ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> : null}
      </span>
      <span className={`text-[14.5px] ${done || active ? "font-medium text-ink-900" : "text-ink-400"}`}>{label}</span>
    </div>
  );
}

function formatDay(dateIso: string) {
  const d = new Date(dateIso);
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/** Конфетти при одобрении/отправке — общий хелпер для экранов заявки. */
export const celebrate = confetti;

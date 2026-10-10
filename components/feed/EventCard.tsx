"use client";

import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { ApplicationStatus } from "@/components/applications/ApplicationStatus";
import { CATEGORY_ICON, trainingIcon } from "@/lib/data/category-icons";
import { RatingStar } from "@/components/ui/RatingStar";
import { photoThumb } from "@/lib/photos/thumb";

export interface EventCardData {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  seatsTotal: number;
  seatsTaken: number;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number | null;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  /** Лёгкое визуальное выделение — привилегия тарифов Медиум и Премьер. */
  isHighlighted?: boolean;
  /** Анонимная встреча (🎭). */
  isAnonymous?: boolean;
  /** Встреча уже началась и ещё не закончилась. */
  isLive?: boolean;
  /** Организатор и адрес скрыты от текущего пользователя (заявку ещё не одобрили). */
  organizerHidden?: boolean;
  isBusiness?: boolean;
  photoUrl?: string | null;
  /** Встреча создана текущим пользователем — кнопку «Я иду» не показываем. */
  isMine?: boolean;
  /** Статус заявки текущего пользователя на эту встречу (приходит из /api/events). */
  myApplicationStatus?: ApplicationStatus | null;
  /** Сколько человек уже идёт (организатор + принятые); 0 — пока никого, кроме организатора. */
  goingCount?: number;
  /** До трёх первых идущих — для кружков с аватарками. */
  goingPreview?: { id: string; name: string; avatarUrl: string | null }[];
}

interface EventCardProps {
  event: EventCardData;
  onApplyPress?: (eventId: string) => void;
  applied?: boolean;
  applying?: boolean;
  /** Локальный статус (например, сразу после отклика) — важнее того, что пришёл с сервера. */
  applicationStatus?: ApplicationStatus | null;
}

export function EventCard({
  event,
  onApplyPress,
  applied = false,
  applying = false,
  applicationStatus,
}: EventCardProps) {
  const status: ApplicationStatus | null =
    applicationStatus ?? event.myApplicationStatus ?? (applied ? "pending" : null);
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;
  const isDisabled = isFull || applied || applying;
  const categoryLabel = event.isBusiness ? "Бизнес-событие" : event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.isBusiness
    ? CATEGORY_ICON.business
    : event.category?.slug === "training"
      ? trainingIcon(event.trainingType?.slug)
      : event.category
        ? CATEGORY_ICON[event.category.slug]
        : undefined;
  const going = event.goingCount ?? 0;

  // Карточка редизайна: обложка во всю карточку (своё фото или фирменный
  // градиент с 3D-иконкой категории), сверху статусы, снизу стеклянная
  // плашка: дата, название, место, кто идёт и «Я иду».
  return (
    <Link
      href={`/events/${event.id}`}
      className={clsx("m-hero block h-[300px] w-full", event.isHighlighted && "ring-2 ring-white/80")}
      style={event.photoUrl ? undefined : { background: coverGradient(event.category?.slug, event.isBusiness) }}
    >
      {event.photoUrl ? (
        <Image src={event.photoUrl} alt="" fill className="ph object-cover" sizes="(max-width: 480px) 100vw, 440px" />
      ) : (
        categoryIcon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={categoryIcon}
            alt=""
            className="absolute right-[-6%] top-[8%] h-[66%] w-auto rotate-[-8deg] object-contain opacity-95 drop-shadow-[0_20px_30px_rgba(60,20,140,0.35)]"
          />
        )
      )}

      <div className="tl">
        {categoryLabel && (
          <span className="m-chip m-chip-glass">
            {categoryIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={categoryIcon} alt="" className="h-5 w-5 object-contain" />
            )}
            {categoryLabel}
          </span>
        )}
        {event.isLive && <span className="m-chip m-chip-live">Идёт сейчас</span>}
        {isFull ? (
          <span className="m-chip m-chip-full">Заполнено</span>
        ) : (
          <span className="m-chip m-chip-need">
            Нужно ещё {seatsLeft} {pluralPeople(seatsLeft)}
          </span>
        )}
        {event.isAnonymous && <span className="m-chip m-chip-glass">Анонимно</span>}
        {event.isMine && <span className="m-chip m-chip-glass">Ваша встреча</span>}
      </div>

      <div className="bar">
        <div className="m-dt">
          <b>{formatTime(event.eventTime)}</b>
          <small>{shortDay(event.eventDate)}</small>
        </div>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[16px] font-medium leading-tight">{event.title}</b>
          <span className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] opacity-90">
            {event.organizerHidden ? (
              "Место откроется после одобрения"
            ) : (
              <>
                {event.placeName ?? formatDate(event.eventDate)}
                {event.organizer && event.organizer.ratingAvg > 0 && (
                  <>
                    {" · "}
                    <RatingStar /> {event.organizer.ratingAvg.toFixed(1)}
                  </>
                )}
              </>
            )}
          </span>
          {going > 0 && (
            <span className="mt-1.5 flex items-center gap-2 text-[12px]">
              <Faces preview={event.goingPreview ?? []} count={going} />
              {going} {going === 1 ? "идёт" : "идут"}
            </span>
          )}
        </div>
        {!status && !event.isMine && (
          <ApplyButton isDisabled={isDisabled} isFull={isFull} applied={applied} applying={applying} onApplyPress={onApplyPress} eventId={event.id} />
        )}
        {status && <MiniStatus status={status} />}
      </div>
    </Link>
  );
}

/** Компактный статус заявки поверх стеклянной плашки карточки. */
function MiniStatus({ status }: { status: ApplicationStatus }) {
  const map = {
    pending: ["Ждём ответа", "bg-white text-accent"],
    accepted: ["Ты в деле", "bg-[#22B573] text-white"],
    rejected: ["Не в этот раз", "bg-white/80 text-ink-600"],
  } as const;
  const [label, cls] = map[status];
  return <span className={clsx("shrink-0 rounded-pill px-3 py-2 text-[13px] font-semibold", cls)}>{label}</span>;
}

function Faces({ preview, count }: { preview: { id: string; name: string; avatarUrl: string | null }[]; count: number }) {
  const extra = count - preview.length;
  return (
    <span className="m-faces" style={{ ["--ring" as string]: "rgba(255,255,255,.7)" }}>
      {preview.map((p) =>
        p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={photoThumb(p.avatarUrl, 26)} alt="" style={{ width: 22, height: 22 }} />
        ) : (
          <span key={p.id} style={{ width: 22, height: 22 }}>
            {p.name.charAt(0).toUpperCase()}
          </span>
        )
      )}
      {extra > 0 && <span style={{ width: 22, height: 22 }}>+{extra}</span>}
    </span>
  );
}

/** Фирменный фон обложки без фото — у каждой категории свой оттенок. */
export function coverGradient(slug?: string | null, business?: boolean) {
  if (business) return "linear-gradient(150deg,#2A1F4E 0%,#5B3AA8 55%,#C871B6 100%)";
  const g: Record<string, string> = {
    training: "linear-gradient(150deg,#6C3BFF 0%,#5AA9FF 100%)",
    cinema: "linear-gradient(150deg,#3A2F8F 0%,#A24DFF 60%,#FF6FA0 100%)",
    coffee: "linear-gradient(150deg,#A24DFF 0%,#FFB27A 100%)",
    breakfast: "linear-gradient(150deg,#FF9DBF 0%,#FFB27A 100%)",
    dinner: "linear-gradient(150deg,#5B3AA8 0%,#FF6FA0 100%)",
    walk: "linear-gradient(150deg,#5AA9FF 0%,#A24DFF 100%)",
  };
  return (slug && g[slug]) || "linear-gradient(120deg,#6C3BFF 0%,#A24DFF 48%,#FF6FA0 100%)";
}

function shortDay(dateIso: string): string {
  const d = new Date(dateIso);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((t1 - t0) / 86400000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

/** Пометка «Идёт сейчас» — красная пилюля с пульсирующей точкой. */
export function LiveBadge({ className }: { className?: string }) {
  return <span className={clsx("m-chip m-chip-live", className)}>Идёт сейчас</span>;
}


function pluralPeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "человека";
  return "человек";
}


function ApplyButton({
  isDisabled,
  isFull,
  applied,
  applying,
  onApplyPress,
  eventId,
  fullWidth,
}: {
  isDisabled: boolean;
  isFull?: boolean;
  applied: boolean;
  applying: boolean;
  onApplyPress?: (eventId: string) => void;
  eventId: string;
  fullWidth?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onApplyPress?.(eventId);
      }}
      disabled={isDisabled}
      className={clsx("m-go", fullWidth && "w-full px-1", isDisabled && "opacity-60")}
    >
      {applied ? "Отклик отправлен" : applying ? "Отправляем..." : isFull ? "Мест нет" : "Я иду"}
    </button>
  );
}

function formatDate(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatTime(timeString: string): string {
  return timeString.slice(0, 5);
}

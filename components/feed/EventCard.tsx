"use client";

import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { ApplicationStatusView, type ApplicationStatus } from "@/components/applications/ApplicationStatus";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
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
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  /** Лёгкое визуальное выделение — привилегия тарифов Медиум и Премьер. */
  isHighlighted?: boolean;
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
  // "Для бизнеса" — свои подпись и значок в шапке карточки (маскот с
  // кошельком, тот же, что и на карте/баннере), а не общая категория
  // "Своё предложение" — по явному уточнению пользователя.
  const categoryLabel = event.isBusiness ? "Бизнес событие" : event.trainingType?.name ?? event.category?.name;
  const categoryEmoji = event.trainingType?.emoji ?? event.category?.emoji;
  const categoryIcon = event.isBusiness
    ? "/brand/markers/marker-business.png"
    : event.category
      ? CATEGORY_ICON[event.category.slug]
      : undefined;

  return (
    <Link
      href={`/events/${event.id}`}
      className={clsx(
        "block rounded-card p-4 shadow-card",
        event.isHighlighted
          ? "bg-gradient-to-br from-lavender-50 to-white ring-1 ring-accent/25"
          : "bg-white"
      )}
    >
      <div className={clsx(event.photoUrl && "flex gap-3")}>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
            {categoryIcon ? (
              <div className="relative h-4 w-4 shrink-0">
                <Image src={categoryIcon} alt="" fill className="object-contain" sizes="16px" />
              </div>
            ) : (
              <span>{categoryEmoji}</span>
            )}
            <span>{categoryLabel}</span>
          </div>

          <h3 className="text-title mb-1">{event.title}</h3>

          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
            <span>{formatDate(event.eventDate)}</span>
            <span>{formatTime(event.eventTime)}</span>
            {event.placeName && <span>{event.placeName}</span>}
          </div>

          {event.description && (
            <p className="mb-3 line-clamp-2 text-sm text-ink-600">{event.description}</p>
          )}

          {event.organizer && (
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
                {event.organizer.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(event.organizer.avatarUrl, 32)} alt={event.organizer.name} className="h-full w-full object-cover" />
                ) : (
                  event.organizer.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="text-sm">
                <span className="font-medium text-ink-900">{event.organizer.name}</span>
                <span className="text-ink-400">, {event.organizer.age}</span>
                {event.organizer.ratingAvg > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-ink-600">
                    <RatingStar /> {event.organizer.ratingAvg.toFixed(1)} · {event.organizer.completedMeetingsCount} встреч
                  </span>
                )}
              </div>
            </div>
          )}

          {!!event.goingCount && event.goingCount > 0 && (
            <GoingRow count={event.goingCount} preview={event.goingPreview ?? []} />
          )}

          {/* Карточка без фото — любой статус во всю ширину над строкой мест. */}
          {!event.photoUrl && status && (
            <div className="mb-3">
              <ApplicationStatusView status={status} layout="wide" />
            </div>
          )}

          {!event.photoUrl && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-600">
                {isFull ? "Мест нет" : `Нужно ещё ${seatsLeft} чел.`}
              </span>
              {!status && !event.isMine && (
                <ApplyButton isDisabled={isDisabled} applied={applied} applying={applying} onApplyPress={onApplyPress} eventId={event.id} />
              )}
              {event.isMine && <MyEventLabel />}
            </div>
          )}
          {event.photoUrl && (
            <span className="text-sm text-ink-600">{isFull ? "Мест нет" : `Нужно ещё ${seatsLeft} чел.`}</span>
          )}
        </div>

        {event.photoUrl && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="relative aspect-square w-24 overflow-hidden rounded-card">
              <Image src={event.photoUrl} alt="" fill className="object-cover" sizes="96px" />
            </div>
            {event.isMine && <MyEventLabel />}
            {!status && !event.isMine && (
              <div className="w-24">
                <ApplyButton isDisabled={isDisabled} applied={applied} applying={applying} onApplyPress={onApplyPress} eventId={event.id} fullWidth />
              </div>
            )}
            {(status === "accepted" || status === "rejected") && (
              <ApplicationStatusView status={status} layout="compact" />
            )}
          </div>
        )}
      </div>

      {/* С фото: «ожидание» — широкая плашка под всей карточкой (макет),
          «принят»/«отклонён» — компактно в колонке под фото (выше). */}
      {event.photoUrl && status === "pending" && (
        <div className="mt-3">
          <ApplicationStatusView status="pending" layout="wide" />
        </div>
      )}
    </Link>
  );
}

/** «Уже идут N человек» — кружки с аватарками, как в шапке чата встречи. */
function GoingRow({
  count,
  preview,
}: {
  count: number;
  preview: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const extra = count - preview.length;
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex shrink-0 -space-x-2">
        {preview.map((person) => (
          <div
            key={person.id}
            className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-caption font-semibold text-ink-600"
          >
            {person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(person.avatarUrl, 28)} alt="" className="h-full w-full object-cover" />
            ) : (
              person.name.charAt(0).toUpperCase()
            )}
          </div>
        ))}
        {extra > 0 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-lavender-100 text-caption font-semibold text-accent">
            +{extra}
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-ink-900">
        Уже {count === 1 ? "идёт" : "идут"} {count} {pluralPeople(count)}
      </span>
    </div>
  );
}

function pluralPeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "человека";
  return "человек";
}

/** Вместо «Я иду» на своей встрече — метка, что это встреча самого пользователя. */
function MyEventLabel() {
  return (
    <span className="rounded-pill bg-lavender-100 px-3 py-1.5 text-xs font-semibold text-accent">Ваша встреча</span>
  );
}

function ApplyButton({
  isDisabled,
  applied,
  applying,
  onApplyPress,
  eventId,
  fullWidth,
}: {
  isDisabled: boolean;
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
      className={clsx(
        "shrink-0 whitespace-nowrap rounded-pill py-2 font-semibold",
        fullWidth ? "w-full px-1 text-center" : "px-5",
        fullWidth && applied ? "text-caption" : "text-sm",
        isDisabled ? "bg-ink-400/10 text-ink-400" : "bg-brand-gradient text-white shadow-cta active:scale-95"
      )}
    >
      {applied ? "Отклик отправлен" : applying ? "Отправляем..." : "Я иду"}
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

mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";
import "./mesto-event.css";

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  costType: string | null;
  isBusiness: boolean;
  businessPricingType: "ticket" | "free" | "custom" | null;
  businessPricingDetails: string | null;
  photoUrl: string | null;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

interface EventDetailsPageProps {
  // Next.js 14 (в этом проекте) — params плоский объект, НЕ Promise.
  // См. пояснение в app/chats/[id]/page.tsx про баг с use(params).
  params: { id: string };
}

const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export default function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);
  const [pendingApplicants, setPendingApplicants] = useState<ApplicantCardData[]>([]);
  const [processingApplicantId, setProcessingApplicantId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Встреча не найдена.");
          return;
        }
        setEvent(data);
        // Заявки на СВОЮ встречу показываем прямо здесь, сразу как только
        // организатор открыл событие — не нужно проваливаться ещё на один
        // экран "Управлять заявками", чтобы увидеть и принять новых людей.
        if (data.viewerStatus === "organizer") {
          loadPendingApplicants();
        }
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  function loadPendingApplicants() {
    fetch(`/api/events/${eventId}/applications`)
      .then((r) => r.json())
      .then((data) => {
        const items = (data.applications ?? []) as ApplicantCardData[];
        setPendingApplicants(items.filter((a) => a.status === "pending"));
      })
      .catch(() => {});
  }

  async function handleApplicantDecision(applicationId: string, action: "accept" | "reject") {
    setProcessingApplicantId(applicationId);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadPendingApplicants();
        // Обновляем и саму встречу — seatsTaken и статус (могла закрыться,
        // если это было последнее место).
        fetch(`/api/events/${eventId}`)
          .then((r) => r.json())
          .then((data) => !data.error && setEvent(data));
      }
    } finally {
      setProcessingApplicantId(null);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "event_full"
            ? "Мест больше нет."
            : data.error === "cannot_apply_to_own_event"
              ? "Это твоя собственная встреча."
              : data.error === "applications_limit_reached"
                ? "Лимит откликов на встречи по твоему тарифу исчерпан за этот период — загляни в раздел «Подписка», чтобы поднять лимит."
                : "Не получилось отправить отклик."
        );
        return;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        setEvent((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setConfirmingCancel(false);
      } else {
        setError("Не получилось отменить встречу.");
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleBoost() {
    setBoosting(true);
    setBoostMessage(null);
    try {
      const res = await fetch("/api/boosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoostMessage(
          data.error === "subscription_required"
            ? "Нужна подписка, чтобы поднимать встречи."
            : data.error === "boost_limit_reached"
              ? "Лимит подъёмов на этот месяц исчерпан."
              : "Не получилось поднять встречу."
        );
        return;
      }
      setBoostMessage(
        data.boostsLimit != null
          ? `Встреча поднята! Использовано ${data.boostsUsed} из ${data.boostsLimit} в этом месяце.`
          : "Встреча поднята!"
      );
    } finally {
      setBoosting(false);
      setTimeout(() => setBoostMessage(null), 4000);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/feed" className="text-sm font-medium text-accent">
          Вернуться на главную
        </Link>
      </div>
    );
  }
  if (!event) return null;

  const categoryLabel = event.isBusiness ? "Бизнес событие" : event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.isBusiness ? "/brand/markers/marker-business.png" : event.category ? CATEGORY_ICON[event.category.slug] : undefined;
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;

  // Строки для нового дизайна страницы («Акцент на фото», см.
  // MESTO_Photo_Focus_Kit) — те же данные, что и раньше, просто собраны
  // в отдельные подписи под конкретные плашки макета.
  const timeLabel = event.eventEndTime
    ? `${event.eventTime.slice(0, 5)}–${event.eventEndTime.slice(0, 5)}`
    : event.eventTime.slice(0, 5);
  const dateLabel = `${formatDate(event.eventDate)} · ${timeLabel}`;
  const addressLine = event.placeName ? `${event.placeName}${event.address ? `, ${event.address}` : ""}` : event.address ?? "";
  // Неразрывный пробел в "X из Y" — чтобы последняя цифра не переносилась
  // одна на новую строку на узком экране (см. ТЗ, п.3).
  const capacityLabel = isFull ? "Мест нет" : `${seatsLeft}\u00A0из\u00A0${event.seatsTotal}`;
  const priceLabel = event.isBusiness
    ? event.businessPricingType === "ticket"
      ? `Билет: ${event.businessPricingDetails}`
      : event.businessPricingType === "custom"
        ? event.businessPricingDetails ?? "Свои условия"
        : "Бесплатно"
    : event.costType
      ? { each_pays: "Каждый за себя", organizer_treats: "Автор угощает", free: "Бесплатно", negotiable: "По договорённости" }[
          event.costType
        ] ?? "—"
      : "—";
  // Фото есть только у "Для бизнеса" — у остальных категорий вместо
  // фотографии показываем крупную иконку категории на том же месте
  // (см. п.10 ТЗ — предусмотренный текущим проектом fallback).
  const heroPhotoSrc = event.photoUrl ?? categoryIcon ?? "/brand/3d/custom-proposal.png";
  const heroIsRealPhoto = !!event.photoUrl;
  const canManage = event.viewerStatus === "organizer" && (event.status === "published" || event.status === "closed");

  return (
    <div className="pb-28">
      <div className="mesto" style={{ "--m-nav-height": "0px" } as CSSProperties}>
        <main className="m-page" style={{ paddingBottom: 24 }}>
          <div className="mb-3 flex items-center gap-3">
            <button onClick={() => router.back()} aria-label="Назад">
              <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
            </button>
          </div>

          <div className="m-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mesto/assets/icons/png/business.png" alt="" width={20} height={20} />
            <span>{categoryLabel}</span>
          </div>

          <h1 className="m-title">{event.title}</h1>

          <figure className="m-hero">
            <Image
              className="m-photo"
              src={heroPhotoSrc}
              alt=""
              width={480}
              height={600}
              style={heroIsRealPhoto ? undefined : { objectFit: "contain", padding: 40, background: "#F1EAFF" }}
              sizes="100vw"
              priority
            />
            {event.organizer && (
              <div className="m-organizer">
                <span className="m-avatar" style={{ overflow: "hidden", display: "block" }}>
                  {event.organizer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.organizer.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-lavender-100 text-sm font-semibold text-ink-600">
                      {event.organizer.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="m-organizer-copy">
                  <span className="m-organizer-name">
                    {event.organizer.name}
                    {event.organizer.age ? `, ${event.organizer.age}` : ""}
                  </span>
                  <span className="m-rating">
                    {event.organizer.ratingAvg > 0 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/mesto/assets/icons/svg/star.svg" alt="" width={16} height={16} />
                    )}
                    <span>
                      {event.organizer.ratingAvg > 0 ? `${event.organizer.ratingAvg.toFixed(1)} · ` : ""}
                      {event.organizer.completedMeetingsCount} встреч
                    </span>
                  </span>
                </span>
              </div>
            )}
          </figure>

          <section className="m-details" aria-label="Информация о встрече">
            <p className="m-info m-date">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mesto/assets/icons/png/calendar.png" alt="" width={26} height={26} />
              <span>{dateLabel}</span>
            </p>
            {addressLine && (
              <p className="m-info m-address">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/location.png" alt="" width={26} height={26} />
                <span>{addressLine}</span>
              </p>
            )}
            <div className="m-chips">
              <p className="m-info m-capacity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/people.png" alt="" width={26} height={26} />
                <span>{capacityLabel}</span>
              </p>
              <p className="m-info m-price">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mesto/assets/icons/png/ticket.png" alt="" width={26} height={26} />
                <span>{priceLabel}</span>
              </p>
            </div>
          </section>

          {event.description && <p className="m-description">{event.description}</p>}

          {event.participants.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <div className="flex -space-x-2">
                {event.participants.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      p.name.charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs text-ink-600">
                {event.participants.length} {pluralizeParticipants(event.participants.length)}
              </span>
            </div>
          )}

          {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

          {event.status === "cancelled" && (
            <div className="mb-3 rounded-card bg-red-50 p-4 text-center text-sm text-red-600">
              Эта встреча отменена организатором.
            </div>
          )}

          {canManage && (
            <>
              {event.status === "published" && pendingApplicants.length > 0 && (
                <div className="mb-3 rounded-card bg-white p-4 shadow-card">
                  <h3 className="mb-3 text-sm font-semibold text-ink-900">
                    Новые заявки ({pendingApplicants.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingApplicants.map((app) => (
                      <ApplicantCard
                        key={app.id}
                        application={app}
                        onAccept={(id) => handleApplicantDecision(id, "accept")}
                        onReject={(id) => handleApplicantDecision(id, "reject")}
                        processing={processingApplicantId === app.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="m-actions" aria-label="Управление встречей">
                <Link href={`/events/${event.id}/applications`} className="m-action m-requests">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mesto/assets/icons/png/people.png" alt="" width={52} height={52} />
                  <span className="m-action-label">Заявки</span>
                </Link>
                {event.status === "published" && (
                  <button type="button" className="m-action m-boost" onClick={handleBoost} disabled={boosting} aria-busy={boosting}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/mesto/assets/icons/png/rocket.png" alt="" width={52} height={52} />
                    <span className="m-action-label">
                      {boosting ? "Поднимаем…" : (
                        <>
                          Поднять
                          <br />
                          встречу
                        </>
                      )}
                    </span>
                  </button>
                )}
              </div>
              {boostMessage && <p className="mt-2 text-center text-xs text-ink-600">{boostMessage}</p>}

              {!confirmingCancel ? (
                <button type="button" className="m-action m-cancel" onClick={() => setConfirmingCancel(true)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mesto/assets/icons/png/cancel.png" alt="" width={44} height={44} />
                  <span className="m-action-label">Отменить встречу</span>
                </button>
              ) : (
                <div className="rounded-card bg-red-50 p-4 text-center shadow-card-lg">
                  <p className="mb-3 text-sm text-ink-900">Точно отменить встречу? Лимит тарифа вернётся.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingCancel(false)}
                      className="flex-1 rounded-pill bg-white py-2.5 text-sm font-medium text-ink-600 shadow-card"
                    >
                      Не отменять
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 rounded-pill bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {cancelling ? "Отменяем..." : "Да, отменить"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Фиксированная кнопка внизу — только для тех, кто НЕ организатор
          (у организатора теперь блок m-actions/m-cancel в самом контенте
          выше, по дизайн-киту "Акцент на фото"). */}
      {event.viewerStatus !== "organizer" && (event.status === "published" || event.status === "closed") && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-5">
          <BottomAction
            viewerStatus={event.viewerStatus}
            isFull={isFull}
            applying={applying}
            onApply={handleApply}
            eventId={event.id}
          />
        </div>
      )}
    </div>
  );
}

function BottomAction({
  viewerStatus,
  isFull,
  applying,
  onApply,
  eventId,
}: {
  viewerStatus: EventDetails["viewerStatus"];
  isFull: boolean;
  applying: boolean;
  onApply: () => void;
  eventId: string;
}) {
  if (viewerStatus === "organizer") {
    return (
      <Link
        href={`/events/${eventId}/applications`}
        className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta"
      >
        <span className="relative h-7 w-7 shrink-0">
          <Image src="/brand/3d/applications-icon.png" alt="" fill className="object-contain" sizes="28px" />
        </span>
        Управлять заявками
      </Link>
    );
  }
  if (viewerStatus === "accepted") {
    return (
      <div className="w-full rounded-pill bg-ink-900 py-4 text-center text-base font-semibold text-white">
        Ты идёшь ✓
      </div>
    );
  }
  if (viewerStatus === "pending") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-600">
        Отклик отправлен
      </div>
    );
  }
  if (viewerStatus === "rejected") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-400">
        Отклонено
      </div>
    );
  }

  return (
    <button
      onClick={onApply}
      disabled={isFull || applying}
      className="w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40"
    >
      {isFull ? "Мест нет" : applying ? "Отправляем..." : "Я иду"}
    </button>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pluralizeParticipants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек идёт";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "человека идут";
  return "человек идут";
}
ENDOFFILE

mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/mesto-event.css" << 'ENDOFFILE'
@font-face{font-family:Inter;src:url('/mesto/assets/fonts/InterVariable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}
.mesto{
 --m-ink:#160631;--m-purple:#7430FF;--m-purple-dark:#340B83;--m-muted:#77757F;
 --m-lilac:#F1EAFF;--m-white:#FFFFFF;--m-radius:22px;--m-gap:12px;--m-pad:20px;
 --m-safe-bottom:max(env(safe-area-inset-bottom,0px),var(--tg-safe-area-inset-bottom,0px),var(--tg-content-safe-area-inset-bottom,0px));
 --m-safe-top:max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px),var(--tg-content-safe-area-inset-top,0px));
 --m-safe-left:max(env(safe-area-inset-left,0px),var(--tg-safe-area-inset-left,0px),var(--tg-content-safe-area-inset-left,0px));
 --m-safe-right:max(env(safe-area-inset-right,0px),var(--tg-safe-area-inset-right,0px),var(--tg-content-safe-area-inset-right,0px));
 --m-nav-height:72px;
 font:400 14px/1.45 Inter,Arial,sans-serif;font-optical-sizing:auto;color:var(--m-ink);color-scheme:light;
 overscroll-behavior:none;
 background:radial-gradient(ellipse at 0% 18%,#EDE5FF 0,transparent 32%),radial-gradient(ellipse at 100% 75%,#FCEEF7 0,transparent 31%),radial-gradient(ellipse at 6% 96%,#F0E9FF 0,transparent 24%),#fff;
}
.mesto,.mesto *,.mesto *::before,.mesto *::after{box-sizing:border-box}
.mesto button,.mesto a{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.mesto button{font:inherit;color:inherit;cursor:pointer;border:0}
.mesto button:disabled{cursor:default;opacity:.55}
.mesto button:focus-visible,.mesto a:focus-visible{outline:3px solid var(--m-purple);outline-offset:4px}
.mesto img{display:block;max-width:100%}
.m-page{width:100%;max-width:480px;margin-inline:auto;padding:calc(16px + var(--m-safe-top)) calc(var(--m-pad) + var(--m-safe-right)) calc(var(--m-nav-height) + var(--m-safe-bottom) + 24px) calc(var(--m-pad) + var(--m-safe-left))}
.m-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 8px;background:#EEE5FF;border-radius:999px;color:var(--m-purple);font-size:13px;font-weight:600;max-width:100%}
.m-badge img{width:20px;height:20px;object-fit:contain;flex:none}
.m-title{font-size:32px;line-height:1.12;font-weight:800;letter-spacing:-1.05px;margin:9px 0 14px;overflow-wrap:anywhere}
.m-hero{margin:0}
.m-photo{width:100%;height:auto;aspect-ratio:0.8;object-fit:cover;object-position:50% 43%;border-radius:var(--m-radius);background:#E7E0EF}
.m-organizer{position:relative;margin-top:-36px;width:calc(100% - 8px);margin-inline:auto;display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:64px;background:#fff;border-radius:22px;box-shadow:0 12px 26px #36158512;text-align:left}
.m-avatar{width:42px;height:42px;flex:none;object-fit:cover;border-radius:50%;background:#F1EAFF}
.m-organizer-copy{display:flex;flex-direction:column;min-width:0;gap:2px}
.m-organizer-name{font-size:14px;font-weight:500;overflow-wrap:anywhere}
.m-rating{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--m-muted);flex-wrap:wrap}
.m-rating img{width:16px;height:16px}
.m-details{display:grid;gap:8px;margin:20px 0 0}
.m-info{display:flex;align-items:center;gap:12px;min-width:0;min-height:44px;padding:10px 12px;border-radius:16px;background:#F6F5F8;margin:0}
.m-info>img{width:26px;height:26px;object-fit:contain;flex:none}
.m-info>span{min-width:0;overflow-wrap:anywhere}
.m-date{background:#F0E9FF;font-weight:500}
.m-address{color:#504A5D}
.m-chips{display:grid;grid-template-columns:minmax(0,1.16fr) minmax(0,1fr);gap:8px}
.m-chips .m-info{font-size:12px;gap:8px;line-height:1.35}
.m-capacity{background:#F6F1FF}
.m-price{background:#FFF7F1}
.m-description{font-size:14px;margin:10px 0 16px;white-space:pre-wrap;overflow-wrap:anywhere}
.m-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.m-action{width:100%;min-width:0;min-height:76px;padding:10px 12px;border-radius:22px;display:flex;justify-content:center;align-items:center;gap:10px;text-align:left;box-shadow:0 7px 20px #45227809;transition:transform .15s ease,box-shadow .15s ease}
.mesto .m-action:active:not(:disabled){transform:scale(.98)}
.m-action img{width:52px;height:52px;flex:none;object-fit:contain}
.m-action-label{overflow-wrap:anywhere;font-size:15px;line-height:1.25;font-weight:750;min-width:0}
.mesto .m-requests{color:#fff;background:linear-gradient(128deg,#7735FF 0%,#9250EB 45%,#FF8A4E 100%)}
.mesto .m-boost{color:var(--m-purple);background:#F7F2FF}
.m-cancel{margin-top:12px;min-height:58px;background:#fff;text-align:center;gap:10px;padding:7px 16px;box-shadow:0 10px 30px #3714730C}
.m-cancel img{width:44px;height:44px}
.mesto .m-cancel .m-action-label{color:var(--m-purple-dark);font-size:15px;line-height:1.3;font-weight:750}
.m-nav{position:fixed;z-index:20;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));height:calc(var(--m-nav-height) + var(--m-safe-bottom));padding:6px calc(8px + var(--m-safe-right)) calc(6px + var(--m-safe-bottom)) calc(8px + var(--m-safe-left));border-radius:28px 28px 0 0;background:rgba(255,255,255,.97);box-shadow:0 -6px 25px #3B185907}
.m-nav-item{background:transparent;display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-decoration:none;color:var(--m-muted)!important;font-size:11px!important;line-height:1.2;padding:0 2px!important}
.m-nav-item img{width:24px;height:24px;object-fit:contain}
.m-nav-item[aria-current=page]{color:var(--m-purple)!important}
.m-nav-item[aria-current=page] img{width:34px;height:34px;margin-top:-10px;filter:drop-shadow(0 4px 6px #7631FF25)}
.m-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.m-demo-note{position:fixed;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(var(--m-nav-height) + var(--m-safe-bottom) + 8px);width:max-content;max-width:calc(100% - 32px);padding:10px 14px;border-radius:12px;background:#2A0A55;color:white;box-shadow:0 5px 20px #2A0A5530;font-size:13px;text-align:center}
.m-demo-note[hidden]{display:none}
@media(max-width:359px){.mesto{--m-pad:16px}.m-title{font-size:29px}.m-action{gap:7px;padding-inline:10px}.m-action img{width:40px;height:44px}.m-action-label{font-size:13px}.m-cancel img{width:42px;height:42px}.mesto .m-cancel .m-action-label{font-size:14px}.m-chips .m-info{gap:6px;padding-inline:10px;font-size:11px}}
@media(prefers-reduced-motion:reduce){.m-action{transition:none}}
ENDOFFILE


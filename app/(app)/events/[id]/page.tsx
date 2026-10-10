"use client";

import { EventPlaceMap } from "@/components/events/EventPlaceMap";
import { markerIconFor } from "@/components/map/EventsMap";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type ApplicantCardData } from "@/components/applications/ApplicantCard";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { photoThumb } from "@/lib/photos/thumb";
import { useGuide } from "@/lib/mosya/guide";
import { say } from "@/lib/mosya/peek";
import { openRoute } from "@/lib/maps/route";
import { JoinFlow } from "@/components/events/JoinFlow";
import { Chr, Cover, Ic, MiniMap, Sheet, Toast, costShort, dayLong, eventIcon } from "@/components/proto/ui";
import { ShareSheet } from "@/components/proto/ShareSheet";

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  /** UTC-моменты с сервера (с учётом часового пояса города встречи). */
  startsAt?: string;
  endsAt?: string;
  autoCompleteAt?: string;
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
    age: number | null;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  /** Анонимная встреча (🎭). */
  isAnonymous?: boolean;
  /** Организатор и точный адрес скрыты, пока заявку не одобрили. */
  organizerHidden?: boolean;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

interface EventDetailsPageProps {
  // Next.js 14 (в этом проекте) — params плоский объект, НЕ Promise.
  // См. пояснение в app/chats/[id]/page.tsx про баг с use(params).
  params: { id: string };
}


export default function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);
  const [pendingApplicants, setPendingApplicants] = useState<ApplicantCardData[]>([]);
  const [processingApplicantId, setProcessingApplicantId] = useState<string | null>(null);
  useGuide("event", { when: !loading });

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

  const [joinPhase, setJoinPhase] = useState<"confirm" | "sending" | "done" | null>(null);

  async function confirmJoin() {
    setJoinPhase("sending");
    const ok = await handleApply();
    setJoinPhase(ok ? "done" : null);
  }

  async function handleApply(): Promise<boolean> {
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
              : apiErrorText(data, "Не получилось отправить отклик.", res.status)
        );
        if (data.error === "event_full") say("Упс, места закончились. Загляни в другие встречи — их много");
        return false;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
      return true;
    } catch {
      return false;
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

  async function handleComplete() {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEvent((prev) => (prev ? { ...prev, status: "completed" } : prev));
        setConfirmingComplete(false);
      } else {
        setError(apiErrorText(data, "Не получилось завершить встречу.", res.status));
      }
    } catch {
      setError("Проблема с соединением — попробуй ещё раз.");
    } finally {
      setCompleting(false);
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

  const [shareOpen, setShareOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [anonOpen, setAnonOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  // Чат встречи — ищем среди своих диалогов (есть, если ты организатор или принят).
  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => {
        const c = (d.items ?? []).find((i: { eventId?: string | null }) => i.eventId === eventId);
        if (c) setChatId(c.conversationId as string);
      })
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    if (error && event) {
      flash(error);
      setError(null);
    }
  }, [error, event]);

  async function removeParticipant(userId: string) {
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/events/${eventId}/members/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(data.error === "event_already_started" ? "Встреча уже началась — убрать участника нельзя." : apiErrorText(data, "Не получилось убрать участника.", res.status));
        return;
      }
      fetch(`/api/events/${eventId}`)
        .then((r) => r.json())
        .then((d) => !d.error && setEvent(d));
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <section className="scr ev aurora fade" data-id="event">
        <div className="sk" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 330, borderRadius: 0 }} />
        <div className="body">
          <div className="sheet2" style={{ marginTop: 290 }}>
            <div className="sk" style={{ height: 32, width: "60%" }} />
            <div className="sk" style={{ height: 70 }} />
            <div className="sk" style={{ height: 74 }} />
          </div>
        </div>
      </section>
    );
  }

  if (!event) {
    return (
      <section className="scr aurora fade" data-id="event">
        <div className="scroll">
          <div className="bar-top">
            <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
              <Ic n="back" />
            </button>
            <span />
          </div>
          <div className="empty" style={{ marginTop: 60 }}>
            <EmptyIllMini />
            <b>Встреча не найдена</b>
            <span>Возможно, её уже удалили. Посмотри другие встречи рядом.</span>
            <Link className="btn v" href="/feed" style={{ width: "100%", marginTop: 8 }}>
              На главную
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const mine = event.viewerStatus === "organizer";
  const st = event.viewerStatus;
  const going = event.seatsTaken + 1;
  const max = event.seatsTotal + 1;
  const free = event.seatsTotal - event.seatsTaken;
  const isFull = free <= 0;
  const hid = !!event.organizerHidden;
  const active = event.status === "published" || event.status === "closed";
  const canManage = mine && active;
  const hasStarted = !!event.startsAt && new Date(event.startsAt).getTime() <= Date.now();
  const isLive = hasStarted && active && (!event.endsAt || new Date(event.endsAt).getTime() > Date.now());
  const autoCompleteLabel = event.autoCompleteAt
    ? new Date(event.autoCompleteAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : null;
  const catName = event.isBusiness ? "Бизнес событие" : event.trainingType?.name ?? CAT_SHORT[event.category?.slug ?? ""] ?? event.category?.name ?? "Встреча";
  const icon = eventIcon(event);
  const timeLabel = `${event.eventTime.slice(0, 5)}${event.eventEndTime ? `–${event.eventEndTime.slice(0, 5)}` : ""}`;
  const dayLabel = dayLong(event.eventDate).toLowerCase();
  const ticket = event.isBusiness && event.businessPricingType === "ticket" ? event.businessPricingDetails : null;
  const costLabel = event.isBusiness
    ? ticket
      ? `Билет ${ticket}`
      : event.businessPricingType === "custom"
        ? event.businessPricingDetails ?? "Свои условия"
        : "Бесплатно"
    : COST_FULL[event.costType ?? ""] ?? "Каждый за себя";
  const shareWhen = `${dayLong(event.eventDate)}, ${event.eventTime.slice(0, 5)}`;
  const organizer = event.organizer;

  let ctaBtn: React.ReactNode;
  if (mine) {
    ctaBtn = active ? (
      <Link className="btn v" href={`/events/${event.id}/edit`}>
        <Ic n="edit" />
        Редактировать
      </Link>
    ) : (
      <button className="btn o" disabled>
        {event.status === "completed" ? "Встреча завершена" : "Встреча отменена"}
      </button>
    );
  } else if (!active) {
    ctaBtn = (
      <button className="btn o" disabled>
        {event.status === "completed" ? "Встреча завершена" : "Встреча отменена"}
      </button>
    );
  } else if (st === "accepted") {
    ctaBtn = event.isBusiness ? (
      <Link className="btn ok" href={`/events/${event.id}/ticket`}>
        <Ic n="check" />
        Открыть билет
      </Link>
    ) : (
      <Link className="btn ok" href={chatId ? `/chats/${chatId}` : "/chats"}>
        <Ic n="check" />
        Ты в деле · чат
      </Link>
    );
  } else if (st === "pending") {
    ctaBtn = (
      <button className="btn o" onClick={() => flash("Ждём ответа организатора")}>
        <Ic n="clock" />
        Заявка отправлена
      </button>
    );
  } else if (st === "rejected") {
    ctaBtn = (
      <button className="btn o" disabled>
        Не в этот раз
      </button>
    );
  } else if (isFull) {
    ctaBtn = (
      <button className="btn o" disabled>
        Мест нет
      </button>
    );
  } else {
    ctaBtn = (
      <button className="btn v" onClick={() => setJoinPhase("confirm")} disabled={applying}>
        Я иду
      </button>
    );
  }

  return (
    <section className="scr ev aurora in" data-id="event">
      <Cover photoUrl={event.photoUrl} icon={icon} thumb={900} />
      <div className="ph-sh" />
      <div className="hb">
        <button className="rb glass" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <div className="r">
          <button className="rb glass" onClick={() => setShareOpen(true)} aria-label="Поделиться">
            <Ic n="share" />
          </button>
          {canManage && (
            <Link className="rb glass" href={`/events/${event.id}/edit`} aria-label="Редактировать">
              <Ic n="edit" />
            </Link>
          )}
        </div>
      </div>

      <div className="body">
        <div className="sheet2">
          {canManage && (
            <div className="orgbar">
              <Ic n="shield" c="s" />
              <div>
                <b>Ты организатор этого события</b>
                <span>Информацию можно изменить в любой момент</span>
              </div>
            </div>
          )}
          <div className="chips">
            <span className="pill lav">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={icon} alt="" style={{ width: 26, height: 26, marginLeft: -8 }} />
              {catName}
            </span>
            <span className="pill gl">{event.isBusiness ? "Бизнес событие" : event.isAnonymous ? "Анонимно" : "Открытая встреча"}</span>
            {isLive && (
              <span className="pill gl">
                <span className="live">
                  <i />
                  Идёт сейчас
                </span>
              </span>
            )}
            {isFull && <span className="pill fullp">Заполнено</span>}
          </div>
          <h1 className="t" style={{ fontSize: 28 }}>
            {event.title}
          </h1>
          <div className="tiles3">
            <div className="gl">
              <Ic n="clock" c="s" />
              <b>{timeLabel}</b>
              <span>{dayLabel}</span>
            </div>
            <div className="gl">
              <Ic n="people" c="s" />
              <b>{isFull ? "Мест нет" : `${going} из ${max}`}</b>
              <span>{isFull ? "заполнено" : `нужно ещё ${free}`}</span>
            </div>
            <div className="gl">
              <Ic n="wallet" c="s" />
              <b>{ticket ?? costShort(event)}</b>
              <span>{ticket ? "на месте" : "расходы"}</span>
            </div>
          </div>

          {organizer &&
            (hid ? (
              <button className="host gl" onClick={() => setAnonOpen(true)}>
                <span className="hv">
                  <Chr shape="ball" pal="lilac" face="hidden" />
                </span>
                <div>
                  <b>Организатор скрыт · анонимно</b>
                  <span>
                    {organizer.ratingAvg > 0 ? `★ ${organizer.ratingAvg.toFixed(1).replace(".", ",")} · ` : ""}откроется после одобрения заявки
                  </span>
                </div>
                <span className="sm">Почему?</span>
              </button>
            ) : (
              <Link className="host gl" href={mine ? "/profile" : `/people/${organizer.id}`}>
                {organizer.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(organizer.avatarUrl, 100)} alt="" />
                ) : (
                  <span className="hv" style={{ background: "var(--g)", color: "#fff", display: "grid", placeItems: "center", borderRadius: "50%", fontWeight: 500 }}>
                    {organizer.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <b>
                    {organizer.name}
                    {mine ? " · это ты" : organizer.age ? `, ${organizer.age}` : ""}
                  </b>
                  <span>
                    {event.isBusiness ? "Бизнес событие · организатор" : "Организатор"}
                    {organizer.ratingAvg > 0 ? ` · ★ ${organizer.ratingAvg.toFixed(1).replace(".", ",")}` : ""} · {organizer.completedMeetingsCount}{" "}
                    {plural(organizer.completedMeetingsCount, "встреча", "встречи", "встреч")}
                  </span>
                </div>
                <Ic n="chev" c="s" />
              </Link>
            ))}

          <div className="addr gl">
            {hid ? (
              <div className="lockrow">
                <Ic n="lock" c="s" />
                <div>
                  <b>Место откроется после одобрения</b>
                  <span>Организатор и точный адрес видны только принятым участникам</span>
                </div>
              </div>
            ) : (
              <>
                <div className="mini" style={{ height: 130 }}>
                  {event.latitude != null && event.longitude != null ? (
                    <EventPlaceMap
                      latitude={event.latitude}
                      longitude={event.longitude}
                      markerSrc={markerIconFor({ isBusiness: event.isBusiness, category: event.category })}
                      placeName={event.placeName}
                      fallbackSrc={icon}
                    />
                  ) : (
                    <MiniMap />
                  )}
                </div>
                <div className="arow">
                  <div>
                    <b>{event.placeName ?? "Место встречи"}</b>
                    <span>{event.address ?? ""}</span>
                  </div>
                </div>
                <div className="abtns">
                  {event.address && (
                    <button
                      className="sm"
                      onClick={() =>
                        navigator.clipboard?.writeText(`${event.placeName ? event.placeName + ", " : ""}${event.address}`).then(
                          () => flash("Адрес скопирован"),
                          () => {}
                        )
                      }
                    >
                      <Ic n="copy" c="xs" /> Скопировать адрес
                    </button>
                  )}
                  {event.latitude != null && event.longitude != null && (
                    <button className="sm" onClick={() => openRoute(event.latitude!, event.longitude!)}>
                      <Ic n="route" c="xs" /> Маршрут
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="blk">
            <div className="blk-h">
              <b>{isLive ? "Уже на месте" : "Кто идёт"}</b>
              <span>
                {going} из {max}
                {isFull ? " · заполнено" : ` · нужно ещё ${free}`}
              </span>
            </div>
            <div className="ppl">
              {organizer && !hid && (
                <Link href={mine ? "/profile" : `/people/${organizer.id}`}>
                  {organizer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoThumb(organizer.avatarUrl, 120)} alt="" />
                  ) : (
                    <span className="av">{organizer.name.charAt(0).toUpperCase()}</span>
                  )}
                  {mine ? "Ты" : organizer.name}
                </Link>
              )}
              {organizer && hid && (
                <button onClick={() => setAnonOpen(true)}>
                  <span className="anon">
                    <Chr shape="ball" pal="lilac" face="hidden" />
                  </span>
                  Скрыт
                </button>
              )}
              {event.participants.map((p) => (
                <Link key={p.id} href={`/people/${p.id}`}>
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoThumb(p.avatarUrl, 120)} alt="" />
                  ) : (
                    <span className="av">{p.name.charAt(0).toUpperCase()}</span>
                  )}
                  {p.name}
                </Link>
              ))}
              {!isFull && st === "none" && active && (
                <button onClick={() => setJoinPhase("confirm")}>
                  <span className="av free">
                    <Ic n="plus" c="s" />
                  </span>
                  Свободно
                </button>
              )}
            </div>
          </div>

          {event.description && <p className="about">{event.description}</p>}

          {event.status === "completed" && <div className="evnote gl">Встреча завершена. Спасибо, что были вместе!</div>}
          {event.status === "cancelled" && (
            <div className="evnote gl" style={{ color: "#E0569B" }}>
              Эта встреча отменена организатором.
            </div>
          )}

          {canManage && (
            <div className="orgb">
              {event.status === "published" && pendingApplicants.length > 0 && (
                <div className="blk">
                  <div className="blk-h">
                    <b>Новые заявки</b>
                    <span className="redn">{pendingApplicants.length}</span>
                  </div>
                  {pendingApplicants.map((a) => (
                    <div key={a.id} className="apl gl">
                      <Link href={`/people/${a.applicant.id}`}>
                        {a.applicant.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoThumb(a.applicant.avatarUrl, 88)} alt="" />
                        ) : (
                          <span className="tgava" style={{ position: "static", width: 44, height: 44, borderRadius: "50%", fontSize: 18 }}>
                            {a.applicant.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </Link>
                      <div>
                        <b>
                          {a.applicant.name}, {a.applicant.age}
                        </b>
                        <span>
                          {a.applicant.ratingAvg > 0 ? `★ ${a.applicant.ratingAvg.toFixed(1).replace(".", ",")} · ` : ""}
                          {a.applicant.completedMeetingsCount} {plural(a.applicant.completedMeetingsCount, "встреча", "встречи", "встреч")}
                        </span>
                      </div>
                      <button className="sm no" disabled={processingApplicantId === a.id} onClick={() => handleApplicantDecision(a.id, "reject")}>
                        Отклонить
                      </button>
                      <button className="sm yes" disabled={processingApplicantId === a.id} onClick={() => handleApplicantDecision(a.id, "accept")}>
                        Принять
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {event.participants.length > 0 && (
                <div className="blk">
                  <div className="blk-h">
                    <b>Участники</b>
                    <span>
                      {going} из {max}
                    </span>
                  </div>
                  {event.participants.map((p) => (
                    <div key={p.id} className="apl gl">
                      <Link href={`/people/${p.id}`}>
                        {p.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoThumb(p.avatarUrl, 88)} alt="" />
                        ) : (
                          <span className="tgava" style={{ position: "static", width: 44, height: 44, borderRadius: "50%", fontSize: 18 }}>
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </Link>
                      <div>
                        <b>{p.name}</b>
                        <span>Участник</span>
                      </div>
                      {!hasStarted && (
                        <button className="sm no" disabled={removingId === p.id} onClick={() => removeParticipant(p.id)}>
                          Убрать
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="tiles2">
                {event.status === "published" ? (
                  <button className="gl" onClick={handleBoost} disabled={boosting}>
                    <Ic n="up" />
                    <b>{boosting ? "Поднимаем…" : "Поднять встречу"}</b>
                    <span>{boostMessage ?? "в начало ленты"}</span>
                  </button>
                ) : (
                  <Link className="gl" href={`/events/${event.id}/applications`} style={{ borderRadius: 20, padding: 12, display: "grid", gap: 3, color: "var(--violet)" }}>
                    <Ic n="people" />
                    <b style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>Все заявки</b>
                    <span style={{ fontSize: 12, color: "var(--grey)" }}>история и решения</span>
                  </Link>
                )}
                <Link className="gl" href={`/events/${event.id}/edit`} style={{ borderRadius: 20, padding: 12, display: "grid", gap: 3, color: "var(--violet)" }}>
                  <Ic n="edit" />
                  <b style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>Редактировать</b>
                  <span style={{ fontSize: 12, color: "var(--grey)" }}>место, время, фото</span>
                </Link>
              </div>
              {event.isBusiness && (
                <Link className="chatprev gl" href={`/events/${event.id}/tickets`}>
                  <Ic n="doc" />
                  <div>
                    <b>Билеты участников</b>
                    <span>{event.participants.length} · номера для входа</span>
                  </div>
                  <Ic n="chev" c="s" />
                </Link>
              )}
              {hasStarted ? (
                <>
                  <button className="btn v" onClick={() => setConfirmingComplete(true)}>
                    Завершить встречу
                  </button>
                  {autoCompleteLabel && (
                    <p className="hint2" style={{ textAlign: "center" }}>
                      Иначе встреча закроется сама в {autoCompleteLabel} — через 30 минут после окончания.
                    </p>
                  )}
                </>
              ) : (
                <button className="report" onClick={() => setConfirmingCancel(true)}>
                  Отменить встречу
                </button>
              )}
            </div>
          )}

          {(chatId || st === "pending" || st === "none") && !event.isBusiness && (
            <Link className="chatprev gl" href={chatId ? `/chats/${chatId}` : "#"} onClick={(e) => !chatId && e.preventDefault()}>
              <Ic n="chat" />
              <div>
                <b>Чат встречи</b>
                <span>{chatId ? "ты в чате" : "откроется, когда организатор примет заявку"}</span>
              </div>
              <Ic n={chatId ? "chev" : "lock"} c="s" />
            </Link>
          )}
        </div>
      </div>

      <div className="cta">
        <div className="l">
          <b>{costLabel}</b>
          <span>{ticket ? "оплата организатору лично" : event.isBusiness ? "вход свободный" : "по заявке организатору"}</span>
        </div>
        {ctaBtn}
      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} eventId={event.id} title={event.title} when={shareWhen} />

      <Sheet open={anonOpen} onClose={() => setAnonOpen(false)}>
        <div className="anonbox">
          <Chr shape="ball" pal="lilac" face="hidden" />
          <b>Организатор скрыл профиль</b>
          <span>Так делают, когда хотят сначала познакомиться вживую. Имя, фото и точный адрес откроются, когда организатор одобрит заявку.</span>
        </div>
        <button className="btn k" onClick={() => setAnonOpen(false)}>
          Понятно
        </button>
      </Sheet>

      <Sheet open={confirmingCancel} onClose={() => setConfirmingCancel(false)}>
        <h2 className="t">Отменить встречу?</h2>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          Участники получат уведомление. Лимит тарифа вернётся.
        </p>
        <button className="btn k" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Отменяем…" : "Да, отменить"}
        </button>
        <button className="btn o" onClick={() => setConfirmingCancel(false)}>
          Не сейчас
        </button>
      </Sheet>

      <Sheet open={confirmingComplete} onClose={() => setConfirmingComplete(false)}>
        <h2 className="t">Завершить встречу?</h2>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 14.5, lineHeight: 1.5 }}>
          Чат закроется, участники смогут оставить отзывы.
        </p>
        <button className="btn v" onClick={handleComplete} disabled={completing}>
          {completing ? "Завершаем…" : "Да, завершить"}
        </button>
        <button className="btn o" onClick={() => setConfirmingComplete(false)}>
          Не сейчас
        </button>
      </Sheet>

      <Toast text={toast} />

      <JoinFlow
        event={joinPhase ? event : null}
        phase={joinPhase}
        onConfirm={confirmJoin}
        onClose={() => {
          if (joinPhase === "done") router.push("/feed");
          setJoinPhase(null);
        }}
      />
    </section>
  );
}

const CAT_SHORT: Record<string, string> = {
  training: "Тренировка",
  cinema: "Кино",
  coffee: "Кофе",
  breakfast: "Завтрак",
  dinner: "Ужин",
  walk: "Прогулка",
  active: "Активный отдых",
  party: "Вечеринка",
  custom: "Своё предложение",
};

const COST_FULL: Record<string, string> = {
  each_pays: "Каждый за себя",
  organizer_treats: "Автор угощает",
  free: "Без расходов",
  negotiable: "По договорённости",
};

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 10;
  const h = n % 100;
  return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c;
}

function EmptyIllMini() {
  return (
    <div className="ill">
      <span style={{ left: 6, top: 36, width: 70, height: 70, position: "absolute" }}>
        <Chr shape="cloud" pal="mint" face="calm" />
      </span>
      <span style={{ left: 52, top: 0, width: 86, height: 86, position: "absolute" }}>
        <Chr shape="ball" pal="lilac" face="wow" />
      </span>
      <span style={{ left: 112, top: 52, width: 62, height: 62, position: "absolute" }}>
        <Chr shape="squ" pal="pink" face="smile" />
      </span>
    </div>
  );
}

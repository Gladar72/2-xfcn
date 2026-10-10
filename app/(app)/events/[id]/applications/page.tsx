"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ApplicantCardData } from "@/components/applications/ApplicantCard";
import { photoThumb } from "@/lib/photos/thumb";
import { EmptyIll, Ic, Screen } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

interface EventApplicationsPageProps {
  // См. пояснение в app/chats/[id]/page.tsx — params здесь плоский объект
  // (Next.js 14), а не Promise (Next.js 15). use(params) реально ронял
  // страницу с "client-side exception" сразу после первого создания встречи.
  params: { id: string };
}

export default function EventApplicationsPage({ params }: EventApplicationsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [eventTitle, setEventTitle] = useState("");
  const [seats, setSeats] = useState<{ total: number; taken: number } | null>(null);
  const [applications, setApplications] = useState<ApplicantCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/applications`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "forbidden" ? "Это не твоя встреча." : "Не удалось загрузить заявки.");
        return;
      }
      setEventTitle(data.event.title);
      setSeats({ total: data.event.seatsTotal, taken: data.event.seatsTaken });
      setApplications(data.applications);
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(applicationId: string, action: "accept" | "reject") {
    setProcessingId(applicationId);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRemove(applicantUserId: string) {
    setProcessingId(applicantUserId);
    try {
      const res = await fetch(`/api/events/${eventId}/members/${applicantUserId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await load();
      } else {
        setError(
          data.error === "event_already_started"
            ? "Встреча уже началась — убрать участника нельзя."
            : "Не получилось убрать участника."
        );
      }
    } finally {
      setProcessingId(null);
    }
  }

  const pending = applications.filter((a) => a.status === "pending");
  const processed = applications.filter((a) => a.status !== "pending");

  const STATUS: Record<string, string> = { accepted: "Принят", rejected: "Отклонена", cancelled: "Отменил сам", removed: "Убран из встречи" };
  const card = (app: ApplicantCardData, actions: React.ReactNode) => {
    const u = app.applicant;
    if (!u) return null;
    return (
      <div key={app.id} className="apl gl">
        <Link href={`/people/${u.id}`}>
          {u.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoThumb(u.avatarUrl, 88)} alt="" />
          ) : (
            <span className="hav r" style={{ width: 44, height: 44 }}>
              {u.name.charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
        <div>
          <b>
            {u.name}, {u.age}
          </b>
          <span>
            {u.ratingAvg > 0 ? `★ ${u.ratingAvg.toFixed(1).replace(".", ",")} · ` : ""}
            {u.completedMeetingsCount} встреч{app.status !== "pending" ? ` · ${STATUS[app.status] ?? ""}` : ""}
          </span>
        </div>
        {actions}
      </div>
    );
  };

  return (
    <Screen id="applications" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => goBack(router, "/my-events")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Заявки <em>на встречу</em>
      </h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5 }}>
        {eventTitle}
        {seats ? ` · занято ${seats.taken} из ${seats.total}` : ""}
      </p>
      {loading && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 64, marginTop: 10 }} />)}
      {error && (
        <div className="note gl" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {!loading && !error && applications.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <EmptyIll />
          <b>Пока никто не откликнулся</b>
          <span>Поделись встречей — так заявки придут быстрее.</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="blk" style={{ marginTop: 18 }}>
          <div className="blk-h">
            <b>Новые заявки</b>
            <span className="redn">{pending.length}</span>
          </div>
          {pending.map((app) =>
            card(
              app,
              <>
                <button className="sm no" disabled={processingId === app.id} onClick={() => handleAction(app.id, "reject")}>
                  Отклонить
                </button>
                <button className="sm yes" disabled={processingId === app.id} onClick={() => handleAction(app.id, "accept")}>
                  Принять
                </button>
              </>
            )
          )}
        </div>
      )}
      {processed.length > 0 && (
        <div className="blk" style={{ marginTop: 18 }}>
          <div className="blk-h">
            <b>Решения</b>
            <span>{processed.length}</span>
          </div>
          {processed.map((app) =>
            card(
              app,
              app.status === "accepted" && app.applicant ? (
                <button className="sm no" disabled={processingId === app.applicant.id} onClick={() => handleRemove(app.applicant!.id)}>
                  Убрать
                </button>
              ) : null
            )
          )}
        </div>
      )}
    </Screen>
  );
}

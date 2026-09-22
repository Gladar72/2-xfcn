cat > "app/(app)/events/[id]/applications/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { ApplicantCard, type ApplicantCardData } from "@/components/applications/ApplicantCard";

interface EventApplicationsPageProps {
  // См. пояснение в app/chats/[id]/page.tsx — params здесь плоский объект
  // (Next.js 14), а не Promise (Next.js 15). use(params) реально ронял
  // страницу с "client-side exception" сразу после первого создания встречи.
  params: { id: string };
}

export default function EventApplicationsPage({ params }: EventApplicationsPageProps) {
  const { id: eventId } = params;

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

  return (
    <div className="-mb-24 min-h-screen bg-background px-5 py-6">
      <h1 className="text-display mb-1">{eventTitle || "Заявки"}</h1>
      {seats && (
        <p className="mb-6 text-sm text-ink-600">
          Занято {seats.taken} из {seats.total} мест
        </p>
      )}

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && applications.length === 0 && (
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
          Пока никто не откликнулся.
        </div>
      )}

      <div className="space-y-3">
        {pending.map((app) => (
          <ApplicantCard
            key={app.id}
            application={app}
            onAccept={(id) => handleAction(id, "accept")}
            onReject={(id) => handleAction(id, "reject")}
            processing={processingId === app.id}
          />
        ))}
        {processed.map((app) => (
          <ApplicantCard
            key={app.id}
            application={app}
            onAccept={() => {}}
            onReject={() => {}}
            onRemove={handleRemove}
            processing={processingId === app.applicant?.id}
          />
        ))}
      </div>
    </div>
  );
}
ENDOFFILE

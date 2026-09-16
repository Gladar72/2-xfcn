mkdir -p "app/api/events/[id]/members/[userId]"
cat > "app/api/events/[id]/members/[userId]/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";

/**
 * DELETE /api/events/[id]/members/[userId]
 *
 * Организатор убирает уже принятого участника ДО начала встречи (не после —
 * иначе можно было бы «уводить» людей с уже прошедших встреч задним числом,
 * искажая счётчик посещённых встреч и рейтинг). Освобождает место —
 * release_event_seat сам решает, возвращать ли встречу в 'published', если
 * она была закрыта именно из-за заполненности (см. миграцию 0023).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id: eventId, userId: memberUserId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, title, event_date, event_time, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (memberUserId === currentUser.userId) {
    return NextResponse.json({ error: "cannot_remove_organizer" }, { status: 422 });
  }

  const eventStartsAt = new Date(`${event.event_date}T${event.event_time}`);
  if (eventStartsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "event_already_started" }, { status: 422 });
  }

  const { data: application } = await admin
    .from("applications")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", memberUserId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!application) return NextResponse.json({ error: "not_a_member" }, { status: 404 });

  await admin.from("applications").update({ status: "removed" }).eq("id", application.id);
  await admin.from("event_members").delete().eq("event_id", eventId).eq("user_id", memberUserId);
  await admin.rpc("release_event_seat", { p_event_id: eventId });

  const { data: removedUser } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", memberUserId)
    .maybeSingle();
  if (removedUser) {
    notifyTelegram(removedUser.telegram_id, `Организатор убрал тебя из встречи «${event.title}».`).catch(() => {});
  }

  return NextResponse.json({ status: "removed" });
}
ENDOFFILE

mkdir -p "components/applications"
cat > "components/applications/ApplicantCard.tsx" << 'ENDOFFILE'
"use client";

import { Button } from "@/components/ui/Button";

export interface ApplicantCardData {
  id: string; // applicationId
  status: "pending" | "accepted" | "rejected" | "cancelled" | "removed";
  applicant: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    bio: string | null;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
}

interface ApplicantCardProps {
  application: ApplicantCardData;
  onAccept: (applicationId: string) => void;
  onReject: (applicationId: string) => void;
  onRemove?: (applicantUserId: string) => void;
  processing?: boolean;
}

export function ApplicantCard({ application, onAccept, onReject, onRemove, processing }: ApplicantCardProps) {
  const { applicant } = application;
  if (!applicant) return null;

  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-background text-base font-semibold text-ink-600">
          {applicant.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={applicant.avatarUrl} alt={applicant.name} className="h-full w-full object-cover" />
          ) : (
            applicant.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <div className="font-medium text-ink-900">
            {applicant.name}, {applicant.age}
          </div>
          {applicant.ratingAvg > 0 && (
            <div className="text-sm text-ink-600">
              ⭐ {applicant.ratingAvg.toFixed(1)} · {applicant.completedMeetingsCount} встреч
            </div>
          )}
        </div>
      </div>

      {applicant.bio && <p className="mb-3 text-sm text-ink-600">{applicant.bio}</p>}

      {application.status === "pending" ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="w-auto flex-1"
            onClick={() => onReject(application.id)}
            disabled={processing}
          >
            Отклонить
          </Button>
          <Button className="flex-1" onClick={() => onAccept(application.id)} disabled={processing}>
            Принять
          </Button>
        </div>
      ) : (
        <>
          <div
            className={`rounded-pill px-4 py-2 text-center text-sm font-medium ${
              application.status === "accepted"
                ? "bg-accent-50 text-accent-700"
                : "bg-ink-400/10 text-ink-600"
            }`}
          >
            {application.status === "accepted"
              ? "Принят"
              : application.status === "removed"
                ? "Убран организатором"
                : "Отклонён"}
          </div>
          {application.status === "accepted" && onRemove && (
            <button
              onClick={() => onRemove(applicant.id)}
              disabled={processing}
              className="mt-2 w-full text-center text-sm font-medium text-red-600 disabled:opacity-60"
            >
              Убрать из встречи
            </button>
          )}
        </>
      )}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/events/[id]/applications"
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
    <div className="min-h-screen bg-background px-5 py-6">
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


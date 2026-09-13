import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/events/[id]/applications
 * Список откликов на встречу — видит только организатор (п.14 ТЗ).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, seats_total, seats_taken, title")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: applications, error } = await admin
    .from("applications")
    .select(
      `
      id, status, created_at,
      applicant:users(id, name, avatar_url, birth_date, bio, rating_avg, completed_meetings_count)
      `
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const items = (applications ?? []).map((app) => {
    const applicant = app.applicant as unknown as {
      id: string;
      name: string;
      avatar_url: string | null;
      birth_date: string;
      bio: string | null;
      rating_avg: number;
      completed_meetings_count: number;
    } | null;

    return {
      id: app.id,
      status: app.status,
      createdAt: app.created_at,
      applicant: applicant
        ? {
            id: applicant.id,
            name: applicant.name,
            avatarUrl: applicant.avatar_url,
            age: calculateAge(applicant.birth_date),
            bio: applicant.bio,
            ratingAvg: applicant.rating_avg,
            completedMeetingsCount: applicant.completed_meetings_count,
          }
        : null,
    };
  });

  return NextResponse.json({
    event: { id: event.id, title: event.title, seatsTotal: event.seats_total, seatsTaken: event.seats_taken },
    applications: items,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

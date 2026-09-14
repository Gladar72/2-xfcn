import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";

/**
 * GET /api/events/[id]
 * Полная информация о встрече для экрана "Детали встречи" — открывается
 * по клику на карточку в ленте или на маркер на карте.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  const { data: event, error } = await admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, seats_total, seats_taken, status, organizer_id,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, rating_avg, completed_meetings_count)
      `
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const organizerRow = event.organizer as unknown as {
    id: string;
    name: string;
    avatar_url: string | null;
    birth_date: string;
    rating_avg: number;
    completed_meetings_count: number;
  } | null;

  const { data: memberRows } = await admin
    .from("event_members")
    .select("role, user:users(id, name, avatar_url)")
    .eq("event_id", eventId)
    .eq("role", "participant");

  const participants = (memberRows ?? []).map((m) => {
    const user = m.user as unknown as { id: string; name: string; avatar_url: string | null };
    return { id: user.id, name: user.name, avatarUrl: user.avatar_url };
  });

  let viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none" = "none";
  if (currentUser) {
    if (event.organizer_id === currentUser.userId) {
      viewerStatus = "organizer";
    } else {
      const { data: application } = await admin
        .from("applications")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", currentUser.userId)
        .maybeSingle();
      if (application?.status === "accepted") viewerStatus = "accepted";
      else if (application?.status === "pending") viewerStatus = "pending";
      else if (application?.status === "rejected") viewerStatus = "rejected";
    }
  }

  return NextResponse.json({
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    trainingType: event.training_type,
    city: event.city,
    placeName: event.place_name,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    eventDate: event.event_date,
    eventTime: event.event_time,
    seatsTotal: event.seats_total,
    seatsTaken: event.seats_taken,
    status: event.status,
    organizer: organizerRow
      ? {
          id: organizerRow.id,
          name: organizerRow.name,
          avatarUrl: organizerRow.avatar_url,
          age: calculateAge(organizerRow.birth_date),
          ratingAvg: organizerRow.rating_avg,
          completedMeetingsCount: organizerRow.completed_meetings_count,
        }
      : null,
    participants,
    viewerStatus,
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

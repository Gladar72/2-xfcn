import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/admin/events */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("events")
    .select("id, title, city, status, event_date, event_time, seats_total, seats_taken, organizer:users(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({
    events: (data ?? []).map((e) => ({
      ...e,
      organizerName: (e.organizer as unknown as { name: string } | null)?.name ?? null,
    })),
  });
}

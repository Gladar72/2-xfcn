import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_EVENT_COLS, mapCityEvent } from "@/lib/city-events";

/** GET /api/city-events/:id — карточка события города (одобренного). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data } = await createAdminClient().from("city_events").select(CITY_EVENT_COLS).eq("id", id).eq("status", "approved").maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(mapCityEvent(data));
}

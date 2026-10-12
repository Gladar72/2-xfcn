import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { upcomingCityEvents } from "@/lib/city-events";

/** GET /api/city-events — «Что ещё в городе» (только одобренные). */
export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  let city = req.nextUrl.searchParams.get("city");
  if (!city) {
    const { data: me } = await admin.from("users").select("city").eq("id", currentUser.userId).maybeSingle();
    city = (me?.city as string | undefined) ?? null;
  }
  if (!city) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await upcomingCityEvents(admin, city) });
}

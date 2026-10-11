import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/me/location  { lat, lon }
 * Примерная геопозиция для «Люди рядом». Точку сразу огрубляем до сетки
 * ~500 м (3 знака ≈ 110 м по широте, шаг 0.005) — точные координаты не
 * сохраняются нигде. DELETE — перестать показывать расстояние.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const grid = (v: number) => Math.round(v / 0.005) * 0.005;
  const admin = createAdminClient();
  await admin
    .from("users")
    .update({ approx_lat: grid(lat), approx_lon: grid(lon), approx_location_at: new Date().toISOString() })
    .eq("id", currentUser.userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await createAdminClient()
    .from("users")
    .update({ approx_lat: null, approx_lon: null, approx_location_at: null })
    .eq("id", currentUser.userId);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatar } from "@/lib/photos/upload-avatar";
import { getUserPhotos } from "@/lib/photos/user-photos";

/**
 * Дополнительные фото профиля (до двух, кроме главного).
 * POST   { photoBase64 } — добавить в свободное место (1 или 2)
 * DELETE { url }         — убрать дополнительное фото
 * Ответ: { photos } — галерея целиком (главное + дополнительные).
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.photoBase64 !== "string") return NextResponse.json({ error: "missing_photo" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rows } = await admin.from("user_photos").select("position").eq("user_id", currentUser.userId).gt("position", 0);
  const taken = new Set((rows ?? []).map((r) => r.position as number));
  const free = [1, 2].find((p) => !taken.has(p));
  if (!free) return NextResponse.json({ error: "photos_limit" }, { status: 422 });

  const up = await uploadAvatar(admin, currentUser.userId, body.photoBase64);
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 422 });
  await admin.from("user_photos").insert({ user_id: currentUser.userId, url: up.publicUrl, position: free });

  const { data: me } = await admin.from("users").select("avatar_url").eq("id", currentUser.userId).maybeSingle();
  return NextResponse.json({ photos: await getUserPhotos(admin, currentUser.userId, (me?.avatar_url as string | null) ?? null) });
}

export async function DELETE(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.url !== "string") return NextResponse.json({ error: "missing_url" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("user_photos").delete().eq("user_id", currentUser.userId).eq("url", body.url).gt("position", 0);
  const { data: me } = await admin.from("users").select("avatar_url").eq("id", currentUser.userId).maybeSingle();
  return NextResponse.json({ photos: await getUserPhotos(admin, currentUser.userId, (me?.avatar_url as string | null) ?? null) });
}

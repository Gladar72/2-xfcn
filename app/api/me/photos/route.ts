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

/** Порядок передаётся целиком: первый снимок становится обложкой профиля. */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const before = body?.before;
  const photos = body?.photos;
  const valid = (urls: unknown): urls is string[] => Array.isArray(urls) && urls.length >= 2 && urls.length <= 3
    && urls.every(url => typeof url === "string" && url.length > 0) && new Set(urls).size === urls.length;
  if (!valid(before) || !valid(photos) || before.length !== photos.length || !photos.every(url => before.includes(url))) {
    return NextResponse.json({ error: "invalid_order" }, { status: 422 });
  }
  const { data, error } = await createAdminClient().rpc("reorder_profile_photos", {
    p_user_id: user.userId, p_before: before, p_after: photos,
  });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "photos_changed" }, { status: 409 });
  return NextResponse.json({ avatarUrl: photos[0], photos });
}

/** Редактирование уже сохранённого снимка, с той же проверкой, что при загрузке. */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.url !== "string" || typeof body.photoBase64 !== "string")
    return NextResponse.json({ error: "missing_photo" }, { status: 400 });
  const admin = createAdminClient({ noStore: true });
  const { data: owner, error: ownerError } = await admin.from("users").select("avatar_url").eq("id", user.userId).single();
  if (ownerError) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!(await getUserPhotos(admin, user.userId, owner.avatar_url)).includes(body.url))
    return NextResponse.json({ error: "photos_changed" }, { status: 409 });
  const up = await uploadAvatar(admin, user.userId, body.photoBase64);
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 422 });
  const { data, error } = await admin.rpc("replace_profile_photo", { p_user: user.userId, p_original: body.url, p_new: up.publicUrl });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "photos_changed" }, { status: 409 });
  const me = await admin.from("users").select("avatar_url").eq("id", user.userId).single();
  if (me.error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ avatarUrl: me.data.avatar_url, photos: await getUserPhotos(admin, user.userId, me.data.avatar_url) });
}

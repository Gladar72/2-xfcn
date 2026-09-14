import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatar } from "@/lib/photos/upload-avatar";

/**
 * POST /api/me/avatar
 * Body: { photoBase64: string } — data URL (data:image/...;base64,...)
 * Смена фото профиля в любой момент (не только при регистрации).
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.photoBase64 !== "string") {
    return NextResponse.json({ error: "missing_photo" }, { status: 400 });
  }

  const admin = createAdminClient();

  const uploadResult = await uploadAvatar(admin, currentUser.userId, body.photoBase64);
  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error }, { status: 422 });
  }

  await admin.from("users").update({ avatar_url: uploadResult.publicUrl }).eq("id", currentUser.userId);
  await admin
    .from("user_photos")
    .insert({ user_id: currentUser.userId, url: uploadResult.publicUrl, position: 0 });

  return NextResponse.json({ status: "ok", avatarUrl: uploadResult.publicUrl });
}

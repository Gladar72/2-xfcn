import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_COOKIE } from "@/lib/telegram/session";

/** GET /api/me — используется клиентом, чтобы узнать свой userId (uuid). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ userId: user.userId });
}

/**
 * DELETE /api/me — пользователь сам удаляет аккаунт (отзыв согласия по 152-ФЗ,
 * требование App Store). Удаляем фото из хранилища и строку users — профиль,
 * встречи, заявки, чаты, отзывы, подписки уходят каскадом. Платежи остаются
 * без связи с человеком (налоговый учёт, см. миграцию 0068).
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  // Фото профиля лежат в avatars/<userId>/… — удаляем, ошибки не мешают удалению аккаунта.
  try {
    const { data: files } = await admin.storage.from("avatars").list(user.userId, { limit: 1000 });
    if (files?.length) await admin.storage.from("avatars").remove(files.map((f) => `${user.userId}/${f.name}`));
  } catch (err) {
    console.error("DELETE /api/me — фото:", err);
  }

  const { error } = await admin.from("users").delete().eq("id", user.userId);
  if (error) {
    console.error("DELETE /api/me:", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE.name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

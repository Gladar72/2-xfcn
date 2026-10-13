import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/me/ping — «я в сети». Приложение вызывает раз в минуту, пока открыто;
 * по last_active_at в чате показывается «в сети» / «был(а) N минут назад».
 */
export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  // Не пишем чаще раза в 30 секунд — лишняя нагрузка на базу.
  await admin
    .from("users")
    .update({ last_active_at: now.toISOString() })
    .eq("id", currentUser.userId)
    .or(`last_active_at.is.null,last_active_at.lt.${new Date(now.getTime() - 30_000).toISOString()}`);
  return NextResponse.json({ status: "ok", at: now.toISOString() });
}

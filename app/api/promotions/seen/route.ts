import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";

/**
 * POST /api/promotions/seen { eventIds: string[] }
 * Главная сообщает, какие продвинутые встречи человек увидел в «Популярном сегодня» —
 * счётчик «увидели» на экране «Ты в популярном». Не чаще одного раза за заход на главную.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.eventIds)
    ? (body.eventIds as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20)
    : [];
  if (ids.length) await createAdminClient().rpc("promotion_bump", { p_event_ids: ids, p_field: "views" });
  return NextResponse.json({ ok: true });
}

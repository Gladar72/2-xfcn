import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/interests
 * Публичный справочник — используется на экране регистрации и в фильтрах.
 * Читаем через admin-клиент, т.к. это просто справочник без прав доступа
 * (в RLS для interests и так select разрешён всем, см. миграцию 0008).
 */
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("interests")
    .select("id, name, emoji")
    .order("name");

  if (error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ interests: data });
}

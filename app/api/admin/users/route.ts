import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/admin/users?search=... */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const search = new URL(req.url).searchParams.get("search")?.trim();
  const db = createAdminClient();

  let query = db
    .from("users")
    .select("id, telegram_id, name, city, moderation_status, rating_avg, completed_meetings_count, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({ users: data });
}

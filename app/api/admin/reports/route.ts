import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/admin/reports */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("reports")
    .select(
      `
      id, reason, details, status, created_at,
      reporter:users!reports_reporter_id_fkey(id, name),
      reported:users!reports_reported_user_id_fkey(id, name)
      `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({
    reports: (data ?? []).map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
      reporter: r.reporter as unknown as { id: string; name: string } | null,
      reported: r.reported as unknown as { id: string; name: string } | null,
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/reports/[id]
 * Body: { status: "reviewed" | "actioned" | "dismissed" }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: reportId } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status as "reviewed" | "actioned" | "dismissed" | undefined;
  if (!status) return NextResponse.json({ error: "missing_status" }, { status: 400 });

  const db = createAdminClient();
  await db
    .from("reports")
    .update({ status, reviewed_by: admin.userId, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);

  return NextResponse.json({ status: "ok" });
}

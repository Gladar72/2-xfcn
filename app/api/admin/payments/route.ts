import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/admin/payments */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("payments")
    .select("id, plan, amount, currency, status, created_at, users(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({
    payments: (data ?? []).map((p) => ({
      ...p,
      userName: (p.users as unknown as { name: string } | null)?.name ?? null,
    })),
  });
}

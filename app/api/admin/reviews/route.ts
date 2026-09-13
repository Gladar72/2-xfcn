import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/admin/reviews */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("reviews")
    .select(
      `
      id, rating, created_at,
      reviewer:users!reviews_reviewer_id_fkey(name),
      reviewee:users!reviews_reviewee_id_fkey(name)
      `
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({
    reviews: (data ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      createdAt: r.created_at,
      reviewerName: (r.reviewer as unknown as { name: string } | null)?.name ?? null,
      revieweeName: (r.reviewee as unknown as { name: string } | null)?.name ?? null,
    })),
  });
}

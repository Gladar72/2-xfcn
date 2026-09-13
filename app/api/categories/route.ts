import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/categories
 * Возвращает активные категории и типы тренировок — справочники для
 * главного экрана (сетка категорий) и мастера создания встречи.
 */
export async function GET() {
  const admin = createAdminClient();

  const [{ data: categories, error: categoriesError }, { data: trainingTypes, error: trainingError }] =
    await Promise.all([
      admin
        .from("categories")
        .select("id, slug, name, emoji")
        .eq("is_active", true)
        .order("sort_order"),
      admin
        .from("training_types")
        .select("id, slug, name, emoji")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

  if (categoriesError || trainingError) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ categories, trainingTypes });
}

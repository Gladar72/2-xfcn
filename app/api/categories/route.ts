import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cachedFeed } from "@/lib/data/feed-cache";

// Справочник меняется редко — держим в памяти сервера 10 минут
// (его запрашивает каждое открытие главной).
const CATEGORIES_TTL_MS = 10 * 60 * 1000;

/**
 * GET /api/categories
 * Возвращает активные категории и типы тренировок — справочники для
 * главного экрана (сетка категорий) и мастера создания встречи.
 */
export async function GET() {
  const admin = createAdminClient();

  const loadCategories = async () => {
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
    if (categoriesError || trainingError) throw categoriesError ?? trainingError;
    return { categories, trainingTypes };
  };

  try {
    const { categories, trainingTypes } = await cachedFeed("categories", loadCategories, CATEGORIES_TTL_MS);
    return NextResponse.json({ categories, trainingTypes });
  } catch (error) {
    console.error("GET /api/categories:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { TrainingTypeSheet } from "@/components/home/TrainingTypeSheet";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

export default function FeedPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {
        setCategories([]);
        setTrainingTypes([]);
      });
  }, []);

  return (
    <div>
      <TopBar city="Тюмень" />

      <div className="px-5 pb-2 pt-6">
        <h1 className="text-display">Что хочешь сделать сегодня?</h1>
      </div>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      <div className="mt-8 px-5">
        <h2 className="text-title mb-3">Сегодня рядом</h2>
        {/* Реальная лента встреч с ranking-алгоритмом — Этап 6 */}
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
          Сегодня пока тихо. Создайте первый план в своём городе.
        </div>
      </div>

      <TrainingTypeSheet
        open={sheetOpen}
        trainingTypes={trainingTypes}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

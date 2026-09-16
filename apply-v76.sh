cat > "components/home/CategoryGrid.tsx" << 'ENDOFFILE'
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface CategoryGridProps {
  categories: Category[];
  onTrainingPress: () => void;
}

// 3D-иконки категорий МЕСТО (новый комплект ассетов, см. бриф). emoji остаётся
// как запасной вариант, если у какой-то категории вдруг не найдётся своей иконки.
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
};

export function CategoryGrid({ categories, onTrainingPress }: CategoryGridProps) {
  const router = useRouter();
  const [checkingCategory, setCheckingCategory] = useState<string | null>(null);
  const [emptyCategory, setEmptyCategory] = useState<Category | null>(null);

  const gridCategories = categories.filter((c) => c.slug !== "custom");
  const customCategory = categories.find((c) => c.slug === "custom");

  async function handlePress(category: Category) {
    if (category.slug === "training") {
      onTrainingPress();
      return;
    }

    // Прежде чем вести в ленту, проверяем — есть ли вообще активные
    // встречи этой категории в городе пользователя. Если нет — не
    // молчаливая пустая лента, а явное сообщение прямо на главном экране.
    setCheckingCategory(category.slug);
    try {
      const res = await fetch(`/api/events?category=${category.slug}&page=0`);
      const data = await res.json().catch(() => ({ items: [] }));
      if (Array.isArray(data.items) && data.items.length === 0) {
        setEmptyCategory(category);
      } else {
        router.push(`/feed?category=${category.slug}`);
      }
    } catch {
      // При проблеме с сетью не блокируем — просто ведём в ленту как обычно.
      router.push(`/feed?category=${category.slug}`);
    } finally {
      setCheckingCategory(null);
    }
  }

  return (
    <div className="px-5">
      <div className="grid grid-cols-2 gap-3">
        {gridCategories.map((category) => {
          const iconSrc = CATEGORY_ICON[category.slug];
          return (
            <button
              key={category.id}
              onClick={() => handlePress(category)}
              disabled={checkingCategory === category.slug}
              className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98] disabled:opacity-60"
            >
              {iconSrc ? (
                <div className="relative h-11 w-11">
                  <Image src={iconSrc} alt="" fill className="object-contain" sizes="44px" />
                </div>
              ) : (
                <span className="text-2xl">{category.emoji}</span>
              )}
              <span className="text-sm font-medium leading-tight text-ink-900">
                {category.name}
              </span>
            </button>
          );
        })}

        {/* "Другое" — не категория из базы, а прямой переход в раздел
            "Встречи" (экран /search, тот же, что открывается по центру
            нижней навигации), без предустановленного фильтра категории —
            там можно выбрать любую встречу и применить любые фильтры. */}
        <button
          onClick={() => router.push("/search")}
          className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
        >
          <div className="relative h-11 w-11">
            <Image src="/brand/3d/other.png" alt="" fill className="object-contain" sizes="44px" />
          </div>
          <span className="text-sm font-medium leading-tight text-ink-900">Другое</span>
        </button>
      </div>

      {customCategory && (
        <button
          onClick={() => router.push("/create")}
          className="mt-3 flex w-full items-center gap-3 rounded-card bg-brand-gradient p-5 text-left shadow-card"
        >
          <div className="relative h-12 w-12 shrink-0">
            <Image src="/brand/3d/custom-proposal.png" alt="" fill className="object-contain" sizes="48px" />
          </div>
          <div>
            <span className="block text-base font-semibold text-white">{customCategory.name}</span>
            <span className="block text-sm text-white/80">Создай свою встречу</span>
          </div>
        </button>
      )}

      {emptyCategory && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
          onClick={() => setEmptyCategory(null)}
        >
          <div className="rounded-t-sheet bg-white p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            {CATEGORY_ICON[emptyCategory.slug] && (
              <div className="relative mx-auto mb-3 h-16 w-16">
                <Image src={CATEGORY_ICON[emptyCategory.slug]} alt="" fill className="object-contain" />
              </div>
            )}
            <h2 className="text-title mb-2">Такую встречу ещё никто не создал</h2>
            <p className="mb-5 text-sm text-ink-600">
              «{emptyCategory.name}» в твоём городе пока нет ни одной активной встречи — стань первым.
            </p>
            <button
              onClick={() => router.push(`/create?category=${emptyCategory.slug}`)}
              className="w-full rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta"
            >
              Создать первым
            </button>
            <button
              onClick={() => setEmptyCategory(null)}
              className="mt-2 w-full py-3 text-sm font-medium text-ink-600"
            >
              Не сейчас
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE

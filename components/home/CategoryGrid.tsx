"use client";

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

  const gridCategories = categories.filter((c) => c.slug !== "custom");
  const customCategory = categories.find((c) => c.slug === "custom");

  function handlePress(category: Category) {
    if (category.slug === "training") {
      onTrainingPress();
      return;
    }
    router.push(`/feed?category=${category.slug}`);
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
              className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
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
          className="mt-3 flex w-full items-center gap-3 rounded-card bg-brand-gradient p-4 text-left shadow-card"
        >
          <div className="relative h-9 w-9 shrink-0">
            <Image src="/brand/3d/custom-proposal.png" alt="" fill className="object-contain" sizes="36px" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-white">{customCategory.name}</span>
            <span className="block text-xs text-white/80">Создай свою встречу</span>
          </div>
        </button>
      )}
    </div>
  );
}

"use client";

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
        {gridCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => handlePress(category)}
            className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
          >
            <span className="text-2xl">{category.emoji}</span>
            <span className="text-sm font-medium leading-tight text-ink-900">
              {category.name}
            </span>
          </button>
        ))}
      </div>

      {customCategory && (
        <button
          onClick={() => router.push("/create?category=custom")}
          className="mt-3 flex w-full items-center gap-2 rounded-card bg-accent-50 p-4 text-left text-sm font-medium text-accent-700"
        >
          <span className="text-xl">{customCategory.emoji}</span>
          {customCategory.name}
        </button>
      )}
    </div>
  );
}

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
// "custom" ("Своё предложение") теперь тоже обычная плитка сетки — раньше была
// отдельным широким баннером под сеткой, на её месте теперь баннер "Для бизнеса".
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export function CategoryGrid({ categories, onTrainingPress }: CategoryGridProps) {
  const router = useRouter();
  const [checkingCategory, setCheckingCategory] = useState<string | null>(null);
  const [emptyCategory, setEmptyCategory] = useState<Category | null>(null);

  async function handlePress(category: Category) {
    if (category.slug === "training") {
      onTrainingPress();
      return;
    }

    // "Своё предложение" — это создание СВОЕЙ встречи, а не просмотр чужих:
    // ведём прямо в мастер создания, без проверки "пусто ли" (та проверка
    // осмысленна только для категорий, где смотрят готовые встречи других).
    if (category.slug === "custom") {
      router.push("/create");
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
        {categories.map((category) => {
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

      {/* "Для бизнеса" — на месте прежнего баннера "Своё предложение".
          Отдельный раздел (/business): свои события, свой мастер
          создания, свои лимиты по тарифу — см. lib/subscriptions/limits.ts. */}
      <button
        onClick={() => router.push("/business")}
        className="mt-3 flex w-full items-center gap-3 rounded-card bg-brand-gradient p-5 text-left shadow-card"
      >
        <div className="relative h-12 w-12 shrink-0">
          <Image src="/brand/markers/marker-business.png" alt="" fill className="object-contain" sizes="48px" />
        </div>
        <div>
          <span className="block text-base font-semibold text-white">Для бизнеса</span>
          <span className="block text-sm text-white/80">Посетить либо создать события</span>
        </div>
      </button>

      {emptyCategory && (() => {
        const iconSrc = CATEGORY_ICON[emptyCategory.slug];
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
            onClick={() => setEmptyCategory(null)}
          >
            <div className="rounded-t-sheet bg-white p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
              {iconSrc ? (
                <div className="relative mx-auto mb-3 h-14 w-14">
                  <Image src={iconSrc} alt="" fill className="object-contain" />
                </div>
              ) : (
                <span className="mb-3 block text-4xl">{emptyCategory.emoji}</span>
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
        );
      })()}
    </div>
  );
}

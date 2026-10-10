"use client";

import { useState } from "react";
import { Icon } from "@/components/brand/Icon";
import { Mosya } from "@/components/brand/Mosya";
import { Character } from "@/components/brand/AliveStage";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
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
  const [checkingCategory, setCheckingCategory] = useState<string | null>(null);
  const [emptyCategory, setEmptyCategory] = useState<Category | null>(null);
  const [spin, setSpin] = useState(false);

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

  const tiles = categories.filter((c) => c.slug !== "custom");

  return (
    <div className="px-5">
      {/* Сетка «Что планируем»: стеклянные плитки с глянцевыми 3D-иконками */}
      <div className="m-stagger grid grid-cols-4 gap-2">
        {tiles.map((category) => {
          const iconSrc = CATEGORY_ICON[category.slug];
          return (
            <button
              key={category.id}
              onClick={() => handlePress(category)}
              disabled={checkingCategory === category.slug}
              className="m-cat m-glass disabled:opacity-60"
            >
              {iconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconSrc} alt="" />
              ) : (
                <span className="text-3xl leading-[52px]">{category.emoji}</span>
              )}
              <span>{shortName(category.name)}</span>
            </button>
          );
        })}

        {/* «Другое» — полный список встреч с фильтрами (/search) */}
        <button onClick={() => router.push("/search")} className="m-cat m-glass">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cat3d/i_world.webp" alt="" />
          <span>Другое</span>
        </button>
      </div>

      {/* «Своё предложение» — крутящаяся звёздочка, ведёт в мастер создания */}
      <button
        onClick={() => {
          setSpin(true);
          setTimeout(() => router.push("/create?category=custom"), 650);
        }}
        aria-label="Создать своё событие — можно анонимно"
        className="m-own m-glass mt-2"
      >
        <span className={`m-star ${spin ? "spin" : ""}`}>
          <Character shape="star" pal="peach" face="sly" size={62} seed={11} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15.5px] font-medium">Своё предложение</b>
          <span className="block text-[13px] leading-snug text-ink-600">
            Не нашёл подходящего? Придумай сам — можно анонимно
          </span>
        </span>
        <Icon name="chev" size={18} className="text-ink-400" />
      </button>

      {/* «Для бизнеса» — афиша заведений, отдельный раздел (/business) */}
      <button onClick={() => router.push("/business")} className="m-press mt-3 flex w-full items-center gap-3 overflow-hidden rounded-[26px] p-3 pr-4 text-left text-white shadow-card-lg" style={{ background: "linear-gradient(120deg,#2A1F4E 0%,#5B3AA8 55%,#C871B6 100%)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cat3d/i_biz.webp" alt="" className="h-16 w-16 shrink-0 object-contain" />
        <span className="min-w-0 flex-1">
          <span className="m-chip m-chip-glass mb-1 h-6 px-2 text-[11px]">Афиша заведений</span>
          <b className="block text-[16px] font-medium">Для бизнеса</b>
          <span className="block text-[12.5px] leading-snug opacity-85">Концерты, дегустации, мастер-классы — или создай своё событие</span>
        </span>
        <Icon name="chev" size={18} />
      </button>

      {emptyCategory && (() => {
        const iconSrc = CATEGORY_ICON[emptyCategory.slug];
        return (
          <div
            className="m-fade-in fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(22,18,31,0.35)]"
            onClick={() => setEmptyCategory(null)}
          >
            <div className="m-sheet-in m-glass-2 rounded-t-sheet p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-ink-400/30" />
              <div className="relative mx-auto mb-2 flex h-24 w-40 items-end justify-center">
                <Mosya pose="think" size={96} />
                {iconSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc} alt="" className="absolute right-2 top-0 h-12 w-12 object-contain" />
                )}
              </div>
              <h2 className="m-title mb-2 text-[24px]">Такую встречу ещё никто <span className="m-em">не создал</span></h2>
              <p className="mb-5 text-sm text-ink-600">
                «{emptyCategory.name}» в твоём городе пока нет ни одной активной встречи — стань первым.
              </p>
              <button onClick={() => router.push(`/create?category=${emptyCategory.slug}`)} className="m-btn m-btn-v">
                Создать первым
              </button>
              <button onClick={() => setEmptyCategory(null)} className="m-btn mt-2 h-12 text-ink-600">
                Не сейчас
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/** Короткие подписи для плиток 4 в ряд («Совместная тренировка» → «Тренировка»). */
function shortName(name: string) {
  const map: Record<string, string> = {
    "Совместная тренировка": "Тренировка",
    "Попить кофе": "Кофе",
    "Совместный завтрак": "Завтрак",
    "Поужинать": "Ужин",
  };
  return map[name] ?? name;
}

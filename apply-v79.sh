mkdir -p "components/home"
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

      {emptyCategory && (() => {
        const emptyCategoryIcon = CATEGORY_ICON[emptyCategory.slug];
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
            onClick={() => setEmptyCategory(null)}
          >
            <div className="rounded-t-sheet bg-white p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
              {emptyCategoryIcon && (
                <div className="relative mx-auto mb-3 h-16 w-16">
                  <Image src={emptyCategoryIcon} alt="" fill className="object-contain" />
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
        );
      })()}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/api/geocode"
cat > "app/api/geocode/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode?lat=...&lng=...  — обратное геокодирование (точка → адрес)
 * GET /api/geocode?query=...&city=...  — прямое геокодирование (текст → варианты адресов с координатами),
 *   используется для автодополнения при ручном вводе адреса (см. AddressAutocomplete.tsx)
 *
 * Прокси к Yandex Geocoder API. Ключ (YANDEX_GEOCODER_API_KEY) — БЕЗ
 * префикса NEXT_PUBLIC_, то есть доступен только на сервере и никогда не
 * попадает в код браузера. Это платный тариф (от 20 800 ₽/мес за 1000
 * запросов/сутки) — если бы ключ был публичным, кто угодно мог бы вытащить
 * его из бандла сайта и накрутить лишних запросов за наш счёт.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const query = searchParams.get("query");
  const city = searchParams.get("city");

  const apiKey = process.env.YANDEX_GEOCODER_API_KEY;
  if (!apiKey) return NextResponse.json(query ? { suggestions: [] } : { address: null });

  if (query) {
    if (query.trim().length < 3) return NextResponse.json({ suggestions: [] });

    try {
      // Город добавляем в сам текст запроса — так надёжнее ограничивает
      // выдачу нужным городом, чем параметр rspn/bbox (без известных
      // границ города их пришлось бы высчитывать отдельно).
      const geocodeText = city ? `${city}, ${query}` : query;
      const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${encodeURIComponent(geocodeText)}&format=json&results=5&lang=ru_RU`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`GET /api/geocode?query — Yandex Geocoder ответил ${res.status}:`, body.slice(0, 300));
        return NextResponse.json({ suggestions: [] });
      }

      const data = await res.json();
      const members = data?.response?.GeoObjectCollection?.featureMember ?? [];
      const suggestions = members
        .map((m: unknown) => {
          const obj = (m as { GeoObject?: Record<string, unknown> })?.GeoObject;
          const text = (
            obj?.metaDataProperty as { GeocoderMetaData?: { text?: string } } | undefined
          )?.GeocoderMetaData?.text;
          const pos = (obj?.Point as { pos?: string } | undefined)?.pos; // "lng lat"
          if (!text || !pos) return null;
          const parts = pos.split(" ");
          const lngStr = parts[0];
          const latStr = parts[1];
          if (!lngStr || !latStr) return null;
          return { address: text, longitude: parseFloat(lngStr), latitude: parseFloat(latStr) };
        })
        .filter((s: unknown): s is { address: string; longitude: number; latitude: number } => !!s);

      return NextResponse.json({ suggestions });
    } catch {
      return NextResponse.json({ suggestions: [] });
    }
  }

  if (!lat || !lng) return NextResponse.json({ error: "missing_coordinates" }, { status: 400 });

  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${lng},${lat}&format=json&results=1&lang=ru_RU`;
    const res = await fetch(url);
    if (!res.ok) {
      // Логируем реальную причину — важно, пока ключ Геокодера свежий и
      // может быть ещё не активирован (обычно требуется до часа после
      // оплаты) или временно превышен лимит.
      const body = await res.text().catch(() => "");
      console.error(`GET /api/geocode — Yandex Geocoder ответил ${res.status}:`, body.slice(0, 300));
      return NextResponse.json({ address: null });
    }

    const data = await res.json();
    const text = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty
      ?.GeocoderMetaData?.text;

    return NextResponse.json({ address: typeof text === "string" ? text : null });
  } catch {
    return NextResponse.json({ address: null });
  }
}
ENDOFFILE


"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface TrainingTypeSheetProps {
  open: boolean;
  trainingTypes: TrainingType[];
  onClose: () => void;
}

export function TrainingTypeSheet({ open, trainingTypes, onClose }: TrainingTypeSheetProps) {
  const router = useRouter();
  const [checkingType, setCheckingType] = useState<string | null>(null);
  const [emptyType, setEmptyType] = useState<TrainingType | null>(null);

  if (!open) return null;

  // Та же проверка "пусто ли", что и для обычных категорий на главной
  // (см. CategoryGrid.tsx) — раньше здесь её не было вообще, поэтому по
  // нажатию на тип тренировки без единой встречи ничего не происходило:
  // просто открывалась пустая лента без единого пояснения.
  async function handlePress(type: TrainingType) {
    setCheckingType(type.slug);
    try {
      const res = await fetch(`/api/events?category=training&type=${type.slug}&page=0`);
      const data = await res.json().catch(() => ({ items: [] }));
      if (Array.isArray(data.items) && data.items.length === 0) {
        setEmptyType(type);
      } else {
        router.push(`/feed?category=training&type=${type.slug}`);
        onClose();
      }
    } catch {
      // При проблеме с сетью не блокируем — просто ведём в ленту как обычно.
      router.push(`/feed?category=training&type=${type.slug}`);
      onClose();
    } finally {
      setCheckingType(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full rounded-t-[28px] bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
        <h2 className="mb-4 text-title">Совместная тренировка</h2>
        <div className="grid grid-cols-2 gap-2">
          {trainingTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handlePress(type)}
              disabled={checkingType === type.slug}
              className="flex items-center gap-2 rounded-card bg-background p-3 text-left text-sm font-medium active:scale-[0.98] disabled:opacity-60"
            >
              <span className="text-lg">{type.emoji}</span>
              {type.name}
            </button>
          ))}
        </div>
      </div>

      {emptyType && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/30"
          onClick={() => setEmptyType(null)}
        >
          <div className="rounded-t-sheet bg-white p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <span className="mb-3 block text-4xl">{emptyType.emoji}</span>
            <h2 className="text-title mb-2">Такую встречу ещё никто не создал</h2>
            <p className="mb-5 text-sm text-ink-600">
              «{emptyType.name}» в твоём городе пока нет ни одной активной встречи — стань первым.
            </p>
            <button
              onClick={() => router.push(`/create?category=training&type=${emptyType.slug}`)}
              className="w-full rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta"
            >
              Создать первым
            </button>
            <button
              onClick={() => setEmptyType(null)}
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

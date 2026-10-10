"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mosya } from "@/components/brand/Mosya";
import { trainingIcon } from "@/lib/data/category-icons";

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
      <div className="m-fade-in absolute inset-0 bg-[rgba(22,18,31,0.35)]" onClick={onClose} />
      <div className="m-sheet-in m-glass-2 relative w-full rounded-t-[30px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
        <h2 className="m-title mb-4 text-[24px]">
          Совместная <span className="m-em">тренировка</span>
        </h2>
        <div className="m-stagger grid grid-cols-3 gap-2">
          {trainingTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handlePress(type)}
              disabled={checkingType === type.slug}
              className="m-cat bg-white/70 shadow-card disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trainingIcon(type.slug)} alt="" />
              <span>{type.name}</span>
            </button>
          ))}
        </div>
      </div>

      {emptyType && (
        <div
          className="m-fade-in fixed inset-0 z-[60] flex flex-col justify-end bg-[rgba(22,18,31,0.35)]"
          onClick={() => setEmptyType(null)}
        >
          <div className="m-sheet-in m-glass-2 rounded-t-sheet p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-ink-400/30" />
            <div className="relative mx-auto mb-2 flex h-24 w-40 items-end justify-center">
              <Mosya pose="think" size={96} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trainingIcon(emptyType.slug)} alt="" className="absolute right-2 top-0 h-12 w-12 object-contain" />
            </div>
            <h2 className="m-title mb-2 text-[24px]">Такую встречу ещё никто <span className="m-em">не создал</span></h2>
            <p className="mb-5 text-sm text-ink-600">
              «{emptyType.name}» в твоём городе пока нет ни одной активной встречи — стань первым.
            </p>
            <button onClick={() => router.push(`/create?category=training&type=${emptyType.slug}`)} className="m-btn m-btn-v">
              Создать первым
            </button>
            <button onClick={() => setEmptyType(null)} className="m-btn mt-2 h-12 text-ink-600">
              Не сейчас
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

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

  if (!open) return null;

  function handlePress(type: TrainingType) {
    router.push(`/feed?category=training&type=${type.slug}`);
    onClose();
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
              className="flex items-center gap-2 rounded-card bg-background p-3 text-left text-sm font-medium active:scale-[0.98]"
            >
              <span className="text-lg">{type.emoji}</span>
              {type.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

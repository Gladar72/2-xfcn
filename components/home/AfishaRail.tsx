"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";

/** «Афиша заведений» на главной: бизнес-события города крупными карточками. */
export function AfishaRail({ onApplyPress }: { onApplyPress?: (id: string) => void }) {
  const [items, setItems] = useState<EventCardData[] | null>(null);

  useEffect(() => {
    fetch("/api/events?business=true&page=0")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline justify-between px-5">
        <h2 className="m-h2">
          Афиша <span className="m-em">заведений</span>
        </h2>
        <Link href="/business" className="text-[13.5px] text-ink-400">
          Все
        </Link>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.slice(0, 6).map((e) => (
          <div key={e.id} className="w-[78%] max-w-[300px] shrink-0 snap-start">
            <EventCard event={e} onApplyPress={onApplyPress} />
          </div>
        ))}
      </div>
    </div>
  );
}

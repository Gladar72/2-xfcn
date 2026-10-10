"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { photoThumb } from "@/lib/photos/thumb";
import { interestIcon } from "@/lib/data/interests";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
  sharedInterests: string[];
  sharedCount: number;
}

/** «Люди с похожими интересами» — горизонтальная лента карточек на главной. */
export function PeopleRail() {
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => setPeople(Array.isArray(d.items) ? d.items : []))
      .catch(() => setPeople([]));
  }, []);

  if (people !== null && people.length === 0) return null;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline justify-between px-5">
        <h2 className="m-h2">Люди с похожими интересами</h2>
        <span className="text-[13.5px] text-ink-400">рядом</span>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {people === null
          ? [0, 1, 2].map((i) => <div key={i} className="m-sk h-[210px] w-[150px] shrink-0" />)
          : people.map((p) => (
              <Link
                key={p.id}
                href={`/people/${p.id}`}
                className="m-press relative h-[210px] w-[150px] shrink-0 snap-start overflow-hidden rounded-[26px] bg-brand-gradient text-white shadow-card-lg"
              >
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(p.avatarUrl, 300)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-5xl font-medium">{p.name.charAt(0).toUpperCase()}</span>
                )}
                <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(40,10,70,.72))]" />
                {p.sharedInterests[0] && (
                  <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-pill bg-white/25 py-0.5 pl-0.5 pr-2 text-[11px] backdrop-blur-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={interestIcon(p.sharedInterests[0])} alt="" className="h-5 w-5 object-contain" />
                    {p.sharedCount > 1 ? `${p.sharedCount} общих` : p.sharedInterests[0]}
                  </span>
                )}
                <span className="absolute inset-x-3 bottom-2.5">
                  <b className="block text-[16px] font-medium">
                    {p.name}, {p.age}
                  </b>
                  {p.sharedInterests.length > 0 && <span className="block truncate text-[12px] opacity-90">{p.sharedInterests.join(", ")}</span>}
                </span>
              </Link>
            ))}
      </div>
    </div>
  );
}

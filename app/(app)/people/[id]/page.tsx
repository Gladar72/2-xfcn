"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { Mosya } from "@/components/brand/Mosya";
import { RatingStar } from "@/components/ui/RatingStar";
import { interestIcon } from "@/lib/data/interests";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
import { useGuide } from "@/lib/mosya/guide";
import { peek, say } from "@/lib/mosya/peek";

interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
  bio: string | null;
  ratingAvg: number;
  completedMeetingsCount: number;
  interests: string[];
  commonInterests?: string[];
}
interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  role: "organizer" | "participant";
  category: { slug: string } | null;
  photoUrl: string | null;
}

/**
 * Профиль человека (как в прототипе): большое фото, о себе, общие
 * интересы, «Позвать на встречу» (приглашение на свою встречу в личный
 * чат + Telegram) и «Написать» (личный чат).
 */
export default function PersonPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [myEvents, setMyEvents] = useState<MyEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  useGuide("person", { when: person !== null });

  useEffect(() => {
    fetch(`/api/users/${params.id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError("Профиль не найден.") : setPerson(d)))
      .catch(() => setError("Проблема с соединением."));
  }, [params.id]);

  async function openDirect(eventId?: string) {
    if (!person || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id, eventId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.conversationId) {
        say(d.error === "event_unavailable" ? "Эта встреча уже закрыта — выбери другую" : "Не получилось — попробуй ещё раз");
        return;
      }
      if (eventId) {
        setInviteOpen(false);
        peek({ pose: "jump", text: `Позвал! ${person.name} получит приглашение в Telegram`, quick: true, low: true });
      } else router.push(`/chats/${d.conversationId}`);
    } finally {
      setBusy(false);
    }
  }

  function openInvite() {
    setInviteOpen(true);
    if (myEvents === null)
      fetch("/api/me/events?scope=upcoming")
        .then((r) => r.json())
        .then((d) => setMyEvents((d.items ?? []).filter((e: MyEvent) => e.role === "organizer")))
        .catch(() => setMyEvents([]));
  }

  if (error)
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Mosya pose="think" size={110} />
        <p className="text-sm text-ink-600">{error}</p>
        <button onClick={() => router.back()} className="text-sm font-medium text-accent">
          Назад
        </button>
      </div>
    );
  if (!person)
    return (
      <div className="space-y-3 px-5 pt-4">
        <div className="m-sk aspect-[0.9] w-full" />
        <div className="m-sk h-16" />
      </div>
    );

  const common = person.commonInterests ?? [];
  const others = person.interests.filter((i) => !common.includes(i));

  return (
    <div className="pb-36">
      <div className="relative aspect-[0.86] w-full overflow-hidden rounded-b-[36px] bg-brand-gradient text-white">
        {person.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[120px] font-medium opacity-90">{person.name.charAt(0).toUpperCase()}</span>
        )}
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(40,10,90,.25)_0%,transparent_30%,transparent_55%,rgba(30,8,60,.75)_100%)]" />
        <button
          onClick={() => router.back()}
          aria-label="Назад"
          className="m-press absolute left-4 top-[max(14px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/25 backdrop-blur-md"
        >
          <Icon name="back" size={22} />
        </button>
        <div className="absolute inset-x-5 bottom-5">
          <h1 className="text-[34px] font-medium leading-tight tracking-tight">
            {person.name}, {person.age}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {person.ratingAvg > 0 && (
              <span className="m-chip m-chip-glass">
                <RatingStar /> {Number(person.ratingAvg).toFixed(1).replace(".", ",")}
              </span>
            )}
            <span className="m-chip m-chip-glass">{person.completedMeetingsCount} встреч</span>
            {common.length > 0 && <span className="m-chip m-chip-glass">{common.length} общих интереса</span>}
          </div>
        </div>
      </div>

      <div className="m-stagger space-y-4 px-5 pt-5">
        {person.bio && (
          <div>
            <h2 className="m-h2 mb-1.5 text-[17px]">О себе</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-700">{person.bio}</p>
          </div>
        )}
        {person.interests.length > 0 && (
          <div>
            <h2 className="m-h2 mb-2 text-[17px]">{common.length ? "Общие интересы" : "Интересы"}</h2>
            <div className="flex flex-wrap gap-2">
              {[...common, ...others].map((i) => (
                <span
                  key={i}
                  className={`flex items-center gap-1.5 rounded-pill py-1 pl-1 pr-3 text-[13px] font-medium ${
                    common.includes(i) ? "bg-white/90 shadow-[inset_0_0_0_2px_#9B5CFF]" : "m-glass"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={interestIcon(i)} alt="" className="h-7 w-7 object-contain" />
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[92px] z-30 flex gap-2 px-5">
        <button onClick={() => openDirect()} disabled={busy} className="m-btn m-btn-o" style={{ width: 56, flex: "none", padding: 0 }} aria-label="Написать">
          <Icon name="chat" size={20} />
        </button>
        <button onClick={openInvite} className="m-btn m-btn-v" style={{ flex: 1, width: "auto" }}>
          <Icon name="cal" size={20} />
          Позвать на встречу
        </button>
      </div>

      {inviteOpen && (
        <div className="m-fade-in fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(22,18,31,0.35)]" onClick={() => setInviteOpen(false)}>
          <div className="m-sheet-in m-glass-2 rounded-t-[30px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="m-title mb-1 text-[24px]">
              Позвать <span className="m-em">{person.name}</span>
            </h2>
            <p className="mb-4 text-[13.5px] text-ink-600">Выбери свою встречу — приглашение придёт в личный чат и в Telegram.</p>
            {myEvents === null && <div className="m-sk h-16" />}
            {myEvents?.length === 0 && (
              <div className="text-center">
                <p className="mb-3 text-sm text-ink-600">У тебя пока нет своих встреч.</p>
                <button onClick={() => router.push("/create")} className="m-btn m-btn-v">
                  Создать встречу
                </button>
              </div>
            )}
            <div className="space-y-2">
              {myEvents?.map((e) => (
                <button key={e.id} onClick={() => openDirect(e.id)} disabled={busy} className="m-press flex w-full items-center gap-3 rounded-[20px] bg-white/80 p-2.5 text-left shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.photoUrl ?? (e.category ? CATEGORY_ICON[e.category.slug] : undefined) ?? "/brand/cat3d/i_world.webp"}
                    alt=""
                    className="h-12 w-12 rounded-[14px] object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-medium">{e.title}</b>
                    <span className="text-xs text-ink-400">
                      {new Date(e.eventDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, {e.eventTime.slice(0, 5)}
                    </span>
                  </span>
                  <Icon name="send" size={18} className="text-accent" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

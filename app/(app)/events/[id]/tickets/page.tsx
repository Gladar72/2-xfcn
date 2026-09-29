"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { photoThumb } from "@/lib/photos/thumb";

interface Ticket {
  userId: string;
  name: string;
  avatarUrl: string | null;
  ticketCode: string | null;
  checkedInAt: string | null;
}

/**
 * Билеты участников бизнес-события — для организатора на входе:
 * человек называет номер, организатор находит его (поиск по номеру или
 * имени) и отмечает «Пришёл».
 */
export default function EventTicketsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${params.id}/tickets`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(apiErrorText(body, "Не удалось загрузить билеты.", res.status));
          return;
        }
        setTitle(body.event.title);
        setTickets(body.tickets);
      })
      .catch(() => setError("Проблема с соединением — попробуй ещё раз."))
      .finally(() => setLoading(false));
  }, [params.id]);

  const filtered = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (!raw) return tickets;
    const q = normalize(query);
    return tickets.filter(
      (t) => (q.length > 0 && normalize(t.ticketCode ?? "").includes(q)) || t.name.toLowerCase().includes(raw)
    );
  }, [tickets, query]);

  const arrived = tickets.filter((t) => t.checkedInAt).length;

  async function toggle(ticket: Ticket) {
    setSavingId(ticket.userId);
    setError(null);
    try {
      const res = await fetch(`/api/events/${params.id}/tickets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: ticket.userId, checkedIn: !ticket.checkedInAt }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(apiErrorText(body, "Не удалось отметить билет.", res.status));
        return;
      }
      setTickets((prev) => prev.map((t) => (t.userId === ticket.userId ? { ...t, checkedInAt: body.checkedInAt } : t)));
    } catch {
      setError("Проблема с соединением — попробуй ещё раз.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="px-5 pb-28 pt-4">
      <div className="mb-1 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Назад">
          <Image src="/brand/3d/icon-back.png" alt="" width={22} height={22} />
        </button>
        <h1 className="text-title">Билеты</h1>
      </div>
      {title && <p className="mb-4 pl-9 text-sm text-ink-600">{title}</p>}

      {!loading && tickets.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-card bg-white p-4 shadow-card">
            <span className="text-sm text-ink-600">Пришли</span>
            <span className="text-base font-bold text-ink-900">
              {arrived} из {tickets.length}
            </span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Номер билета или имя, например 7K4P"
            className="mb-3 w-full rounded-card border border-ink-400/20 bg-white px-4 py-3 text-base outline-none focus:border-accent"
          />
        </>
      )}

      {loading && <p className="py-10 text-center text-sm text-ink-600">Загрузка...</p>}
      {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && tickets.length === 0 && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-4 h-24 w-24">
            <Image src="/mesto/assets/icons/png/ticket.png" alt="" fill className="object-contain" sizes="96px" />
          </div>
          <p className="text-sm text-ink-600">Когда ты примешь заявки, здесь появятся билеты участников.</p>
        </div>
      )}

      {!loading && tickets.length > 0 && filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-600">Билет с таким номером не найден.</p>
      )}

      <div className="space-y-2">
        {filtered.map((t) => (
          <div key={t.userId} className="flex items-center gap-3 rounded-card bg-white p-3 shadow-card">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
              {t.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoThumb(t.avatarUrl, 64)} alt="" className="h-full w-full object-cover" />
              ) : (
                t.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{t.name}</p>
              <p className="text-base font-bold tracking-wide text-accent">{t.ticketCode ?? "—"}</p>
            </div>
            <button
              onClick={() => toggle(t)}
              disabled={savingId === t.userId}
              className={`shrink-0 whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                t.checkedInAt ? "bg-[#DDF7E6] text-[#1E8E4E]" : "bg-brand-gradient text-white shadow-cta"
              }`}
            >
              {t.checkedInAt ? "✓ Пришёл" : "Отметить"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** «m-7k4p», «7K4P», «M 7K4P» → «7K4P» — чтобы искать как угодно введённый номер. */
function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^M(?=[A-Z0-9]{4}$)/, "");
}

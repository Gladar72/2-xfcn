"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/brand/Icon";
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
 * человек называет номер (MKS-007 или просто «семь»), организатор находит
 * его (поиск по номеру или имени) и отмечает «Пришёл». Номера идут по
 * порядку принятия — список удобно вести и сверять.
 */
export default function EventTicketsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | "waiting" | "arrived">("all");
  const [copied, setCopied] = useState(false);

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

  // По порядку номеров: 001, 002, 003 …
  const sorted = useMemo(
    () => [...tickets].sort((a, b) => ticketNumber(a.ticketCode) - ticketNumber(b.ticketCode)),
    [tickets]
  );

  const filtered = useMemo(() => {
    const byStatus = sorted.filter((t) =>
      show === "all" ? true : show === "arrived" ? !!t.checkedInAt : !t.checkedInAt
    );
    const raw = query.trim().toLowerCase();
    if (!raw) return byStatus;
    // Только цифры («7», «07», «007») — ищем по номеру билета.
    if (/^\d+$/.test(raw)) return byStatus.filter((t) => ticketNumber(t.ticketCode) === Number(raw));
    const q = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return byStatus.filter(
      (t) =>
        (q.length > 0 && (t.ticketCode ?? "").replace(/[^A-Z0-9]/g, "").includes(q)) ||
        t.name.toLowerCase().includes(raw)
    );
  }, [sorted, query, show]);

  function copyList() {
    const lines = sorted.map(
      (t, i) => `${i + 1}. ${t.ticketCode ?? "—"} — ${t.name} — ${t.checkedInAt ? "пришёл" : "не отмечен"}`
    );
    const text = `${title}\nПришли: ${arrived} из ${tickets.length}\n\n${lines.join("\n")}`;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setError("Не получилось скопировать — попробуй ещё раз."));
  }

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
        <button onClick={() => router.back()} aria-label="Назад" className="m-glass m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <Icon name="back" size={22} className="" />
        </button>
        <h1 className="m-title text-[28px]">Билеты</h1>
      </div>
      {title && <p className="mb-4 pl-9 text-sm text-ink-600">{title}</p>}

      {!loading && tickets.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Билетов" value={tickets.length} />
            <Stat label="Пришли" value={arrived} accent />
            <Stat label="Ждём" value={tickets.length - arrived} />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            placeholder="Номер (например, 7) или имя"
            className="mb-3 w-full rounded-card border border-ink-400/20 bg-white px-4 py-3 text-base outline-none focus:border-accent"
          />
          <div className="mb-3 flex items-center gap-2">
            {(
              [
                ["all", "Все"],
                ["waiting", "Ждём"],
                ["arrived", "Пришли"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setShow(value)}
                className={`rounded-pill px-4 py-1.5 text-sm font-medium ${
                  show === value ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
        <p className="py-6 text-center text-sm text-ink-600">
          {query.trim() ? "Билет с таким номером не найден." : "Здесь пока никого."}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((t) => (
          <div key={t.userId} className="flex items-center gap-3 rounded-card m-glass p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
              {t.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoThumb(t.avatarUrl, 64)} alt="" className="h-full w-full object-cover" />
              ) : (
                t.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold tracking-wide text-accent">{t.ticketCode ?? "—"}</p>
              <p className="truncate text-sm text-ink-900">{t.name}</p>
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

      {!loading && tickets.length > 0 && (
        <button
          onClick={copyList}
          className="mt-4 w-full rounded-pill m-glass py-3.5 text-base font-semibold text-accent"
        >
          {copied ? "Список скопирован ✓" : "Скопировать список для учёта"}
        </button>
      )}
    </div>
  );
}

/** «MKS-007» → 7. Билеты без номера — в конец списка. */
function ticketNumber(code: string | null): number {
  const match = code?.match(/(\d+)$/);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-card m-glass p-3 text-center">
      <p className={`text-title ${accent ? "text-[#1E8E4E]" : "text-ink-900"}`}>{value}</p>
      <p className="text-xs text-ink-600">{label}</p>
    </div>
  );
}

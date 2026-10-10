"use client";

import { useEffect, useMemo, useState } from "react";
import { Ic, Screen } from "@/components/proto/ui";
import { useRouter } from "next/navigation";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { photoThumb } from "@/lib/photos/thumb";
import { goBack } from "@/lib/nav/back";

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
    <Screen id="tickets" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => goBack(router, "/my-events")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <button className="sm" onClick={copyList} disabled={!tickets.length}>
          <Ic n={copied ? "check" : "copy"} c="xs" /> {copied ? "Скопировано" : "Список"}
        </button>
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Билеты <em>гостей</em>
      </h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5 }}>
        {title}
        {tickets.length ? ` · пришли ${arrived} из ${tickets.length}` : ""}
      </p>
      <label className="sfield gl" style={{ cursor: "text", marginTop: 14 }}>
        <Ic n="search" c="s" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Номер билета или имя"
          inputMode="search"
          style={{ flex: 1, border: 0, background: "none", font: "inherit", fontSize: 15, outline: "none", color: "var(--ink)", minWidth: 0 }}
        />
      </label>
      <div className="chipsrow" style={{ marginTop: 12 }}>
        {(
          [
            ["all", `Все · ${tickets.length}`],
            ["waiting", `Ждём · ${tickets.length - arrived}`],
            ["arrived", `Пришли · ${arrived}`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip ${show === k ? "on" : "gl"}`} onClick={() => setShow(k)}>
            {l}
          </button>
        ))}
      </div>
      {error && (
        <div className="note gl" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {loading && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 64 }} />)}
        {filtered.map((t) => (
          <div key={t.userId} className="apl gl">
            {t.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(t.avatarUrl, 88)} alt="" />
            ) : (
              <span className="hav r" style={{ width: 44, height: 44 }}>
                {t.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <b>{t.ticketCode ?? "—"}</b>
              <span>{t.name}</span>
            </div>
            <button className={`sm ${t.checkedInAt ? "done" : "yes"}`} disabled={savingId === t.userId} onClick={() => toggle(t)}>
              {t.checkedInAt ? (
                <>
                  <Ic n="check" c="xs" /> Пришёл
                </>
              ) : (
                "Отметить"
              )}
            </button>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="empty">
            <b>{tickets.length ? "Никого не нашли" : "Пока нет гостей"}</b>
            <span>{tickets.length ? "Проверь номер — например, 7 или MKS-007." : "Номера билетов появятся, когда ты примешь заявки."}</span>
          </div>
        )}
      </div>
    </Screen>
  );
}

/** «MKS-007» → 7. Билеты без номера — в конец списка. */
function ticketNumber(code: string | null): number {
  const match = code?.match(/(\d+)$/);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

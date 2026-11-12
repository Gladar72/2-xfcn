"use client";

import { useEffect, useRef, useState } from "react";
import { Cover, dayLong, eventIcon } from "@/components/proto/ui";
import { invitationEvents, inviteEventLabel, type InviteEvent } from "@/lib/invites/events";

export function InviteEventPicker({ value, onSelect }: { value: InviteEvent | null; onSelect: (event: InviteEvent | null) => void }) {
  const [items, setItems] = useState<InviteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(-1);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    select.current(null);
    async function read(url: string) {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error("events unavailable");
      return res.json();
    }
    Promise.all([read("/api/me/events?scope=upcoming"), read("/api/events?page=0")])
      .then(([mine, city]) => {
        if (controller.signal.aborted) return;
        const list = invitationEvents(mine.items ?? [], city.items ?? []);
        setItems(list);
        setHasMore(!!city.hasMore);
        setPage(0);
        select.current(list[0] ?? null);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); request.current = null; } });
    return () => { controller.abort(); request.current?.abort(); };
  }, [retry]);

  async function loadMore() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/events?page=${page + 1}`, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error("events unavailable");
      const data = await res.json();
      if (controller.signal.aborted) return;
      setItems(previous => invitationEvents(previous, data.items ?? []));
      setHasMore(!!data.hasMore);
      setPage(previous => previous + 1);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) { setLoading(false); request.current = null; }
    }
  }

  return <>
    <p className="muted" style={{ margin: 0, fontSize: 14 }}>Твои встречи и события города</p>
    <div role="group" aria-label="Выбери событие" style={{ display: "grid", gap: 8, maxHeight: "36dvh", overflowY: "auto", overscrollBehavior: "contain" }}>
      {items.map(event => <button key={event.id} type="button" className={`opt gl ${value?.id === event.id ? "on" : ""}`} aria-pressed={value?.id === event.id} onClick={() => onSelect(event)}>
        <Cover photoUrl={event.photoUrl} icon={eventIcon(event)} cls="ivth" thumb={100} />
        <div className="d"><b>{event.title}</b><span>{inviteEventLabel(event)} · {dayLong(event.eventDate)}, {event.eventTime.slice(0, 5)}</span>{event.placeName && <span>{event.placeName}</span>}</div>
        <span className="radio" />
      </button>)}
      {loading && <div role="status" className="muted" style={{ padding: 12 }}>Загружаем события…</div>}
      {!loading && !error && !items.length && <p className="muted">Пока нет ближайших событий. Можно создать свою встречу.</p>}
      {error && <div role="alert"><p className="muted">Не удалось загрузить события.</p><button className="btn s" onClick={() => page < 0 ? setRetry(n => n + 1) : void loadMore()}>Попробовать ещё раз</button></div>}
      {hasMore && !loading && !error && <button className="btn s" onClick={loadMore}>Показать ещё</button>}
    </div>
  </>;
}

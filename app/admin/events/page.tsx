"use client";

import { useEffect, useState } from "react";

interface AdminEvent {
  id: string;
  title: string;
  city: string;
  status: string;
  event_date: string;
  event_time: string;
  seats_total: number;
  seats_taken: number;
  organizerName: string | null;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((data) => setEvents(data.events ?? []))
      .finally(() => setLoading(false));
  }

  async function act(id: string, action: "hide" | "unhide" | "close") {
    await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  }

  if (loading) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-card">
      <table className="w-full text-sm">
        <thead className="border-b border-ink-400/10 text-left text-ink-600">
          <tr>
            <th className="p-3">Название</th>
            <th className="p-3">Организатор</th>
            <th className="p-3">Город</th>
            <th className="p-3">Дата</th>
            <th className="p-3">Места</th>
            <th className="p-3">Статус</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-ink-400/5">
              <td className="p-3">{e.title}</td>
              <td className="p-3">{e.organizerName}</td>
              <td className="p-3">{e.city}</td>
              <td className="p-3">
                {e.event_date} {e.event_time?.slice(0, 5)}
              </td>
              <td className="p-3">
                {e.seats_taken}/{e.seats_total}
              </td>
              <td className="p-3">{e.status}</td>
              <td className="flex gap-1 p-3">
                {e.status === "hidden" ? (
                  <button onClick={() => act(e.id, "unhide")} className="rounded-pill bg-background px-3 py-1 text-xs">
                    Показать
                  </button>
                ) : (
                  <button onClick={() => act(e.id, "hide")} className="rounded-pill bg-background px-3 py-1 text-xs">
                    Скрыть
                  </button>
                )}
                <button onClick={() => act(e.id, "close")} className="rounded-pill bg-background px-3 py-1 text-xs">
                  Закрыть
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

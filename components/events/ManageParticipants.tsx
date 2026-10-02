"use client";

import { useState } from "react";
import { photoThumb } from "@/lib/photos/thumb";

interface Participant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const COLLAPSED_COUNT = 5;

/**
 * Список участников для организатора с кнопкой «Убрать» — чтобы освободить
 * место во встрече (особенно когда она заполнена и ждут новые заявки).
 * Убрать можно только до начала встречи (так же проверяет сервер).
 */
export function ManageParticipants({
  eventId,
  participants,
  isFull,
  pendingCount,
  onChanged,
}: {
  eventId: string;
  participants: Participant[];
  isFull: boolean;
  pendingCount: number;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (participants.length === 0) return null;
  const visible = expanded ? participants : participants.slice(0, COLLAPSED_COUNT);

  async function remove(userId: string) {
    setRemovingId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/members/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "event_already_started"
            ? "Встреча уже началась — убрать участника нельзя."
            : "Не получилось убрать участника. Попробуй ещё раз."
        );
        return;
      }
      setConfirmId(null);
      onChanged();
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mb-3 rounded-card bg-white p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900">Участники ({participants.length})</h3>
        {isFull && (
          <span className="rounded-pill bg-ink-400/10 px-2.5 py-0.5 text-caption font-semibold text-ink-600">Заполнено</span>
        )}
      </div>
      {isFull && (
        <p className="mb-3 text-xs text-ink-600">
          Мест больше нет{pendingCount > 0 ? ` — а заявок ещё ${pendingCount}` : ""}. Чтобы взять кого-то нового, убери
          участника или увеличь количество мест в настройках встречи.
        </p>
      )}

      <div className="divide-y divide-lavender-100">
        {visible.map((p) => (
          <div key={p.id} className="py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(p.avatarUrl, 36)} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  p.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{p.name}</span>
              {confirmId !== p.id && (
                <button
                  type="button"
                  onClick={() => setConfirmId(p.id)}
                  className="shrink-0 rounded-pill bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600"
                >
                  Убрать
                </button>
              )}
            </div>
            {confirmId === p.id && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 p-2">
                <span className="flex-1 text-xs text-red-700">Убрать {p.name} из встречи и чата?</span>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="rounded-pill bg-white px-3 py-1.5 text-xs font-medium text-ink-600"
                >
                  Нет
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  disabled={removingId === p.id}
                  className="rounded-pill bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {removingId === p.id ? "Убираем…" : "Да, убрать"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {participants.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full py-1 text-center text-sm font-medium text-accent"
        >
          {expanded ? "Свернуть ⌃" : `Показать всех (${participants.length}) ⌄`}
        </button>
      )}
      {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}

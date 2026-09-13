"use client";

import { useEffect, useState } from "react";

interface AdminUser {
  id: string;
  telegram_id: number;
  name: string;
  city: string;
  moderation_status: string;
  rating_avg: number;
  completed_meetings_count: number;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  }

  async function toggleBan(user: AdminUser) {
    const action = user.moderation_status === "banned" ? "unban" : "ban";
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Поиск по имени"
          className="rounded-card border border-ink-400/20 bg-white px-4 py-2 text-sm"
        />
        <button onClick={load} className="rounded-card bg-ink-900 px-4 py-2 text-sm text-white">
          Искать
        </button>
      </div>

      {loading ? (
        <p className="text-ink-600">Загрузка...</p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-400/10 text-left text-ink-600">
              <tr>
                <th className="p-3">Имя</th>
                <th className="p-3">Город</th>
                <th className="p-3">Telegram ID</th>
                <th className="p-3">Рейтинг</th>
                <th className="p-3">Встреч</th>
                <th className="p-3">Статус</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink-400/5">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.city}</td>
                  <td className="p-3">{u.telegram_id}</td>
                  <td className="p-3">{u.rating_avg?.toFixed(1) ?? "—"}</td>
                  <td className="p-3">{u.completed_meetings_count}</td>
                  <td className="p-3">
                    <span
                      className={
                        u.moderation_status === "banned" ? "text-red-600" : "text-ink-600"
                      }
                    >
                      {u.moderation_status}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleBan(u)}
                      className="rounded-pill bg-background px-3 py-1 text-xs font-medium"
                    >
                      {u.moderation_status === "banned" ? "Разбанить" : "Забанить"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

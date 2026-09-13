"use client";

import { useEffect, useState } from "react";

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; name: string } | null;
  reported: { id: string; name: string } | null;
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/admin/reports")
      .then((r) => r.json())
      .then((data) => setReports(data.reports ?? []))
      .finally(() => setLoading(false));
  }

  async function act(id: string, status: "reviewed" | "actioned" | "dismissed") {
    await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (loading) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="space-y-3">
      {reports.length === 0 && <p className="text-ink-600">Жалоб нет.</p>}
      {reports.map((r) => (
        <div key={r.id} className="rounded-card bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-900">
              {r.reporter?.name ?? "?"} → {r.reported?.name ?? "?"}
            </span>
            <span className="rounded-pill bg-background px-2 py-0.5 text-xs">{r.status}</span>
          </div>
          <p className="text-sm text-ink-900">{r.reason}</p>
          {r.details && <p className="mt-1 text-sm text-ink-600">{r.details}</p>}
          {r.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => act(r.id, "dismissed")} className="rounded-pill bg-background px-3 py-1 text-xs">
                Отклонить
              </button>
              <button onClick={() => act(r.id, "reviewed")} className="rounded-pill bg-background px-3 py-1 text-xs">
                Рассмотрено
              </button>
              <button
                onClick={() => act(r.id, "actioned")}
                className="rounded-pill bg-accent px-3 py-1 text-xs text-white"
              >
                Принять меры
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

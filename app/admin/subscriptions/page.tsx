"use client";

import { useEffect, useState } from "react";

export default function AdminSubscriptionsPage() {
  const [counts, setCounts] = useState<{ start: number; medium: number; premium: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => r.json())
      .then((data) => setCounts(data.subscriptions));
  }, []);

  if (!counts) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="grid grid-cols-3 gap-4 max-w-xl">
      <div className="rounded-card bg-white p-4 text-center shadow-card">
        <p className="text-xs text-ink-600">START</p>
        <p className="text-2xl font-bold">{counts.start}</p>
      </div>
      <div className="rounded-card bg-white p-4 text-center shadow-card">
        <p className="text-xs text-ink-600">MEDIUM</p>
        <p className="text-2xl font-bold">{counts.medium}</p>
      </div>
      <div className="rounded-card bg-white p-4 text-center shadow-card">
        <p className="text-xs text-ink-600">PREMIUM</p>
        <p className="text-2xl font-bold">{counts.premium}</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface Metrics {
  users: { total: number; newToday: number; new7d: number; banned: number };
  dau: null;
  events: { total: number; completed: number };
  applications: { total: number; accepted: number; conversionRate: number };
  subscriptions: { start: number; medium: number; premium: number };
  payments: { succeededCount: number; revenueStars: number };
  reports: { pending: number };
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => r.json())
      .then(setMetrics);
  }, []);

  if (!metrics) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card label="Всего пользователей" value={metrics.users.total} />
      <Card label="Новых сегодня" value={metrics.users.newToday} />
      <Card label="Новых за 7 дней" value={metrics.users.new7d} />
      <Card label="Забанено" value={metrics.users.banned} />

      <Card label="Всего встреч" value={metrics.events.total} />
      <Card label="Завершено встреч" value={metrics.events.completed} />
      <Card label="Откликов" value={metrics.applications.total} />
      <Card
        label="Конверсия отклик → принят"
        value={`${Math.round(metrics.applications.conversionRate * 100)}%`}
      />

      <Card label="START" value={metrics.subscriptions.start} />
      <Card label="MEDIUM" value={metrics.subscriptions.medium} />
      <Card label="PREMIUM" value={metrics.subscriptions.premium} />
      <Card label="Жалоб в ожидании" value={metrics.reports.pending} />

      <Card label="Успешных платежей" value={metrics.payments.succeededCount} />
      <Card label="Выручка (Stars)" value={metrics.payments.revenueStars} />
      <Card label="DAU" value="—" hint="нужна аналитика, Этап 34" />
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <p className="text-xs text-ink-600">{label}</p>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface AdminPayment {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  userName: string | null;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/payments")
      .then((r) => r.json())
      .then((data) => setPayments(data.payments ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-card">
      <table className="w-full text-sm">
        <thead className="border-b border-ink-400/10 text-left text-ink-600">
          <tr>
            <th className="p-3">Пользователь</th>
            <th className="p-3">Тариф</th>
            <th className="p-3">Сумма</th>
            <th className="p-3">Статус</th>
            <th className="p-3">Дата</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-ink-400/5">
              <td className="p-3">{p.userName}</td>
              <td className="p-3">{p.plan}</td>
              <td className="p-3">
                {p.amount} {p.currency}
              </td>
              <td className="p-3">{p.status}</td>
              <td className="p-3">{new Date(p.created_at).toLocaleDateString("ru-RU")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface AdminReview {
  id: string;
  rating: number;
  createdAt: string;
  reviewerName: string | null;
  revieweeName: string | null;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/reviews")
      .then((r) => r.json())
      .then((data) => setReviews(data.reviews ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-card">
      <table className="w-full text-sm">
        <thead className="border-b border-ink-400/10 text-left text-ink-600">
          <tr>
            <th className="p-3">От кого</th>
            <th className="p-3">Кому</th>
            <th className="p-3">Оценка</th>
            <th className="p-3">Дата</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-b border-ink-400/5">
              <td className="p-3">{r.reviewerName}</td>
              <td className="p-3">{r.revieweeName}</td>
              <td className="p-3">{"⭐".repeat(r.rating)}</td>
              <td className="p-3">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

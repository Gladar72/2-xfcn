"use client";

import { useEffect, useState } from "react";

interface MiniProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
  gender: "male" | "female" | null;
  bio: string | null;
  ratingAvg: number;
  completedMeetingsCount: number;
  interests: string[];
}

export function MiniProfileSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.error) setProfile(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="rounded-t-sheet bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />

        {loading && <p className="py-8 text-center text-ink-600">Загрузка...</p>}

        {!loading && !profile && <p className="py-8 text-center text-ink-600">Не удалось загрузить профиль.</p>}

        {profile && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 h-24 w-24 overflow-hidden rounded-full bg-lavender-100 text-3xl font-semibold text-ink-600">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <h2 className="text-title">
              {profile.name}, {profile.age}
            </h2>

            <div className="mt-1 flex items-center gap-3 text-sm text-ink-600">
              <span>⭐ {profile.ratingAvg.toFixed(1)}</span>
              <span>·</span>
              <span>{profile.completedMeetingsCount} встреч</span>
              {profile.gender && <span>· {profile.gender === "male" ? "Мужчина" : "Женщина"}</span>}
            </div>

            {profile.bio && <p className="mt-3 text-sm text-ink-900">{profile.bio}</p>}

            {profile.interests.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {profile.interests.map((interest) => (
                  <span key={interest} className="rounded-pill bg-lavender-100 px-3 py-1 text-xs text-ink-600">
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

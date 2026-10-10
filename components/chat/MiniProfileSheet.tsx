"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { interestIcon } from "@/lib/data/interests";
import { Sheet } from "@/components/proto/ui";
import { photoThumb } from "@/lib/photos/thumb";

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
    <Sheet open onClose={onClose}>
      {loading && <div className="sk" style={{ width: 96, height: 96, borderRadius: "50%", justifySelf: "center" }} />}
      {!loading && !profile && <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>Не удалось загрузить профиль.</p>}
      {profile && (
        <>
          <div className="anonbox" style={{ padding: 0 }}>
            <div className="pava" style={{ width: 96, height: 96, fontSize: 36 }}>
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoThumb(profile.avatarUrl, 192)} alt="" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
            <h2 className="t" style={{ marginTop: 10 }}>
              {profile.name}
              {profile.age ? `, ${profile.age}` : ""}
            </h2>
            <span>
              {profile.ratingAvg > 0 ? `★ ${profile.ratingAvg.toFixed(1).replace(".", ",")} · ` : ""}
              {profile.completedMeetingsCount} встреч
            </span>
            {profile.bio && <p className="about" style={{ marginTop: 6 }}>{profile.bio}</p>}
          </div>
          {profile.interests.length > 0 && (
            <div className="itags" style={{ justifyContent: "center" }}>
              {profile.interests.map((i) => (
                <span key={i} className="itag gl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={interestIcon(i)} alt="" />
                  {i}
                </span>
              ))}
            </div>
          )}
          <Link className="btn v" href={`/people/${profile.id}`}>
            Открыть профиль
          </Link>
        </>
      )}
    </Sheet>
  );
}

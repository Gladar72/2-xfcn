mkdir -p "components/profile"
cat > "components/profile/AvatarViewer.tsx" << 'FILE1_EOF'
"use client";

import { useState } from "react";

interface AvatarViewerProps {
  src: string;
  alt: string;
  children: React.ReactNode;
}

/**
 * Оборачивает аватар: клик открывает фото на весь экран (тап — закрыть).
 * Круглая рамка увеличенного фото — как в Telegram (раньше был квадрат со
 * скруглёнными углами, как в Instagram, — поменяно по явному запросу
 * пользователя). Чисто фронтенд-функция, не требует изменений в БД.
 */
export function AvatarViewer({ src, alt, children }: AvatarViewerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="contents" aria-label="Открыть фото">
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-8"
          onClick={() => setOpen(false)}
        >
          <div className="aspect-square w-full max-w-sm overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="h-full w-full object-cover" />
          </div>
        </div>
      )}
    </>
  );
}
FILE1_EOF
mkdir -p "components/applications"
cat > "components/applications/ApplicantCard.tsx" << 'FILE2_EOF'
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AvatarViewer } from "@/components/profile/AvatarViewer";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";

export interface ApplicantCardData {
  id: string; // applicationId
  status: "pending" | "accepted" | "rejected" | "cancelled" | "removed";
  applicant: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    bio: string | null;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
}

interface ApplicantCardProps {
  application: ApplicantCardData;
  onAccept: (applicationId: string) => void;
  onReject: (applicationId: string) => void;
  onRemove?: (applicantUserId: string) => void;
  processing?: boolean;
}

export function ApplicantCard({ application, onAccept, onReject, onRemove, processing }: ApplicantCardProps) {
  const { applicant } = application;
  const [showProfile, setShowProfile] = useState(false);
  if (!applicant) return null;

  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background text-base font-semibold text-ink-600">
          {applicant.avatarUrl ? (
            <AvatarViewer src={applicant.avatarUrl} alt={applicant.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={applicant.avatarUrl} alt={applicant.name} className="h-full w-full object-cover" />
            </AvatarViewer>
          ) : (
            applicant.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink-900">
            {applicant.name}, {applicant.age}
          </div>
          {applicant.ratingAvg > 0 && (
            <div className="text-sm text-ink-600">
              ⭐ {applicant.ratingAvg.toFixed(1)} · {applicant.completedMeetingsCount} встреч
            </div>
          )}
        </div>
        <button
          onClick={() => setShowProfile(true)}
          className="shrink-0 rounded-pill bg-lavender-100 px-3 py-1.5 text-xs font-medium text-accent"
        >
          Профиль
        </button>
      </div>

      {applicant.bio && <p className="mb-3 text-sm text-ink-600">{applicant.bio}</p>}

      {application.status === "pending" ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="w-auto flex-1"
            onClick={() => onReject(application.id)}
            disabled={processing}
          >
            Отклонить
          </Button>
          <Button className="flex-1" onClick={() => onAccept(application.id)} disabled={processing}>
            Принять
          </Button>
        </div>
      ) : (
        <>
          <div
            className={`rounded-pill px-4 py-2 text-center text-sm font-medium ${
              application.status === "accepted"
                ? "bg-accent-50 text-accent-700"
                : "bg-ink-400/10 text-ink-600"
            }`}
          >
            {application.status === "accepted"
              ? "Принят"
              : application.status === "removed"
                ? "Убран организатором"
                : "Отклонён"}
          </div>
          {application.status === "accepted" && onRemove && (
            <button
              onClick={() => onRemove(applicant.id)}
              disabled={processing}
              className="mt-2 w-full text-center text-sm font-medium text-red-600 disabled:opacity-60"
            >
              Убрать из встречи
            </button>
          )}
        </>
      )}

      {showProfile && <MiniProfileSheet userId={applicant.id} onClose={() => setShowProfile(false)} />}
    </div>
  );
}
FILE2_EOF

"use client";

import { Button } from "@/components/ui/Button";

export interface ApplicantCardData {
  id: string; // applicationId
  status: "pending" | "accepted" | "rejected" | "cancelled";
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
  processing?: boolean;
}

export function ApplicantCard({ application, onAccept, onReject, processing }: ApplicantCardProps) {
  const { applicant } = application;
  if (!applicant) return null;

  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-background text-base font-semibold text-ink-600">
          {applicant.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={applicant.avatarUrl} alt={applicant.name} className="h-full w-full object-cover" />
          ) : (
            applicant.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <div className="font-medium text-ink-900">
            {applicant.name}, {applicant.age}
          </div>
          {applicant.ratingAvg > 0 && (
            <div className="text-sm text-ink-600">
              ⭐ {applicant.ratingAvg.toFixed(1)} · {applicant.completedMeetingsCount} встреч
            </div>
          )}
        </div>
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
        <div
          className={`rounded-pill px-4 py-2 text-center text-sm font-medium ${
            application.status === "accepted"
              ? "bg-accent-50 text-accent-700"
              : "bg-ink-400/10 text-ink-600"
          }`}
        >
          {application.status === "accepted" ? "Принят" : "Отклонён"}
        </div>
      )}
    </div>
  );
}

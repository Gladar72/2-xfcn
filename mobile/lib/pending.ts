import { api } from "./api";

/** Новая (ждущая ответа) заявка на мою встречу — для плашки «Новая заявка» и цифры на вкладке. */
export interface PendingApplications {
  count: number;
  latest: {
    applicationId: string;
    eventId: string;
    eventTitle: string;
    name: string;
    age: number | null;
    avatarUrl: string | null;
    createdAt: string;
  } | null;
}

export async function fetchPendingApplications(): Promise<PendingApplications> {
  try {
    const r = await api<PendingApplications>("/api/me/pending-applications");
    return { count: typeof r?.count === "number" ? r.count : 0, latest: r?.latest ?? null };
  } catch {
    return { count: 0, latest: null };
  }
}

import { api } from "./api";

let cached: Promise<string | null> | null = null;

/** Свой id (GET /api/me) — один запрос на запуск приложения. */
export function getMyId(): Promise<string | null> {
  if (!cached) {
    cached = api<{ userId: string }>("/api/me")
      .then((r) => r.userId)
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return cached;
}

/** После выхода из аккаунта id другого человека не должен остаться в памяти. */
export function resetMyId() {
  cached = null;
}

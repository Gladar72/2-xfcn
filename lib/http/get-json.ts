/** A failed or stalled request must not look like an empty successful result. */
export class ApiReadError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(`Request failed (${status})`);
    this.name = "ApiReadError";
  }
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const data = await response.json().catch(() => { throw new ApiReadError(response.status); });
    if (!response.ok || data?.error) throw new ApiReadError(response.status, typeof data?.error === "string" ? data.error : undefined);
    return data as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

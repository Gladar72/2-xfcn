/** Read the launch payload without decoding its signed contents a second time. */
export function readLaunchData(hash: string, search: string): string | null {
  const fragment = hash.replace(/^#/, "");
  const hashQuery = fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : fragment;
  return new URLSearchParams(hashQuery).get("tgWebAppData") ||
    new URLSearchParams(search).get("tgWebAppData") || null;
}

/** A late Telegram SDK must resume authentication, not strand the splash screen. */
export function waitForLaunchData(
  read: () => string | null,
  signal: AbortSignal,
  timeoutMs = 1500
): Promise<string | null> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + timeoutMs;
    const finish = (value: string | null) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => finish(null);
    const check = () => {
      if (signal.aborted) return finish(null);
      const value = read();
      if (value || Date.now() >= deadline) return finish(value);
      timer = setTimeout(check, 50);
    };
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}

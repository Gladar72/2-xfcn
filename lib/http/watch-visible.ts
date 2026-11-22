/** Refresh on return to the app and during foreground use. Only one request runs at a time. */
export function watchVisible(refresh: (signal: AbortSignal) => Promise<void>, interval = 30000) {
  const controller = new AbortController();
  let loading = false;
  async function run() {
    if (document.hidden || loading || controller.signal.aborted) return;
    loading = true;
    try { await refresh(controller.signal); }
    finally { loading = false; }
  }
  void run();
  const timer = window.setInterval(run, interval);
  document.addEventListener("visibilitychange", run);
  return () => {
    controller.abort();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", run);
  };
}

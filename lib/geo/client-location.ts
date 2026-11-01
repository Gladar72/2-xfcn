"use client";

/** Only an approximate ~500 m grid point is sent or kept in memory. */
const SENT_KEY = "mesto_geo_sent_at";
const UPDATED = "mesto:location-updated";
const HEARTBEAT_MS = 10 * 60e3;
const WATCH_INTERVAL_MS = 30e3;
let lastSent: { lat: number; lon: number; at: number; measuredAt: number } | null = null;
let writes: Promise<boolean> = Promise.resolve(false);

/** Never open a permission prompt during a silent refresh. */
export async function geoGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (st) return st.state === "granted";
  } catch { /* Older WebViews do not expose the Permissions API. */ }
  try {
    // In those WebViews, resume only after the user's explicit successful opt-in.
    return localStorage.getItem(SENT_KEY) !== null;
  } catch { return false; }
}

function savePosition(pos: GeolocationPosition): Promise<boolean> {
  const grid = (v: number) => Math.round(v / 0.005) * 0.005;
  const lat = grid(pos.coords.latitude);
  const lon = grid(pos.coords.longitude);
  const measuredAt = pos.timestamp;
  const task = writes.then(async () => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lastSent && measuredAt < lastSent.measuredAt) return false;
    if (lastSent && lat === lastSent.lat && lon === lastSent.lon && Date.now() - lastSent.at < HEARTBEAT_MS) return false;
    try {
      const r = await fetch("/api/me/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });
      if (!r.ok) return false;
      lastSent = { lat, lon, at: Date.now(), measuredAt };
      try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch { /* optional */ }
      window.dispatchEvent(new Event(UPDATED));
      return true;
    } catch { return false; }
  });
  writes = task;
  return task;
}

/** User gesture: obtain a fresh position, asking for permission when needed. */
export function sendMyLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => { void savePosition(pos).then((saved) => resolve(saved || (
        lastSent?.lat === Math.round(pos.coords.latitude / 0.005) * 0.005
        && lastSent?.lon === Math.round(pos.coords.longitude / 0.005) * 0.005
      ))); },
      () => resolve(false),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 15e3 }
    );
  });
}

/** Watch only while the screen is visible; refresh after moving or returning. */
export function watchMyLocation(onUpdated: () => void): () => void {
  let disposed = false;
  let starting = false;
  let generation = 0;
  let watch: number | null = null;
  let pending: GeolocationPosition | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWrite = 0;

  function flush() {
    timer = null;
    if (disposed || document.visibilityState !== "visible" || !pending) return;
    const pos = pending;
    pending = null;
    lastWrite = Date.now();
    void savePosition(pos);
  }
  function received(pos: GeolocationPosition) {
    if (disposed || document.visibilityState !== "visible") return;
    pending = pos;
    if (timer !== null) return;
    const delay = Math.max(0, WATCH_INTERVAL_MS - (Date.now() - lastWrite));
    if (delay === 0) flush();
    else timer = setTimeout(flush, delay);
  }
  function stop() {
    generation++;
    starting = false;
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
    lastWrite = 0;
  }
  async function start() {
    if (disposed || starting || watch !== null || document.visibilityState !== "visible" || !navigator.geolocation) return;
    starting = true;
    const version = generation;
    const granted = await geoGranted();
    if (disposed || version !== generation) return;
    starting = false;
    if (!granted || document.visibilityState !== "visible") return;
    watch = navigator.geolocation.watchPosition(received, (error) => {
      if (error.code === 1) {
        stop();
        try { localStorage.removeItem(SENT_KEY); } catch { /* optional */ }
      }
    }, { enableHighAccuracy: false, maximumAge: 30e3, timeout: 15e3 });
  }
  function updated() {
    if (disposed || document.visibilityState !== "visible") return;
    onUpdated();
    void start(); // Also enables watching after the explicit permission button.
  }
  function visibility() {
    stop();
    if (document.visibilityState === "visible") {
      onUpdated();
      void start();
    }
  }
  window.addEventListener(UPDATED, updated);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("focus", visibility);
  // Heartbeat also refreshes stationary users and detects a new permission.
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") {
      void geoGranted().then((granted) => { if (granted && !disposed) void sendMyLocation(); });
      void start();
    }
  }, HEARTBEAT_MS);
  void start();
  return () => {
    disposed = true;
    stop();
    clearInterval(interval);
    window.removeEventListener(UPDATED, updated);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("focus", visibility);
  };
}

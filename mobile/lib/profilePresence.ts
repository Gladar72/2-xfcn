/** Foreground activity from the existing two-minute presence window, in the viewer's local time. */
export function presenceLabel(iso?: string | null, gender?: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  const elapsed = now - timestamp;
  if (!Number.isFinite(elapsed) || elapsed < -60_000) return null;
  if (elapsed < 120_000) return "Онлайн";
  const date = new Date(timestamp);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? "сегодня"
    : date.toDateString() === yesterday.toDateString() ? "вчера"
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
  const time = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  const prefix = gender === "female" ? "Была в сети" : gender === "male" ? "Был в сети" : "Последний визит";
  return `${prefix} ${day} в ${time}`;
}

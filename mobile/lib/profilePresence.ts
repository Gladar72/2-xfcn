/** Последняя подтверждённая активность в пределах двух минут. */
export function profileIsOnline(iso?: string | null, now = Date.now()): boolean {
  if (!iso) return false;
  const timestamp = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  const elapsed = now - timestamp;
  return elapsed >= -60_000 && elapsed < 120_000;
}

/** Activity in Место, based on the existing foreground heartbeat. */
export function presenceLabel(lastActiveAt: string | null | undefined, gender?: string | null, now = Date.now()): string | null {
  if (!lastActiveAt) return null;
  const elapsed = now - Date.parse(lastActiveAt);
  if (!Number.isFinite(elapsed) || elapsed < -60_000) return null;
  if (elapsed < 120_000) return "В сети";
  const verb = gender === "female" ? "Была" : gender === "male" ? "Был" : "В сети";
  const amount = Math.floor(elapsed / (elapsed < 3_600_000 ? 60_000 : elapsed < 86_400_000 ? 3_600_000 : 86_400_000));
  const units = elapsed < 3_600_000 ? ["минуту", "минуты", "минут"] : elapsed < 86_400_000 ? ["час", "часа", "часов"] : ["день", "дня", "дней"];
  const form = amount % 100 >= 11 && amount % 100 <= 14 ? 2 : amount % 10 === 1 ? 0 : amount % 10 >= 2 && amount % 10 <= 4 ? 1 : 2;
  if (elapsed >= 30 * 86_400_000) return `${verb} больше месяца назад`;
  return `${verb} ${amount} ${units[form]} назад`;
}

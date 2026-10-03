const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** «Сегодня, 19:00» / «Завтра, 10:30» / «5 окт, 18:00» */
export function formatEventDate(dateIso: string, time: string): string {
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const hhmm = (time ?? "").slice(0, 5);
  const today = new Date();
  const date = new Date(y, m - 1, d);
  const diff = Math.round((date.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  const day = diff === 0 ? "Сегодня" : diff === 1 ? "Завтра" : `${d} ${MONTHS[m - 1]}`;
  return `${day}, ${hhmm}`;
}

/** Подпись над пином на карте: «сейчас», «через 20 мин», «через 3 ч», «19:00», «завтра 10:00», «5 окт». */
export function timePill(startsAt: string, endsAt?: string): string {
  const now = Date.now();
  const s = new Date(startsAt).getTime();
  const e = endsAt ? new Date(endsAt).getTime() : s + 2 * 3600_000;
  if (s <= now && now < e) return "сейчас";
  const mins = Math.round((s - now) / 60000);
  if (mins > 0 && mins < 60) return `через ${mins} мин`;
  if (mins >= 60 && mins < 6 * 60) return `через ${Math.round(mins / 60)} ч`;
  const d = new Date(s);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const t = new Date();
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000
  );
  if (dayDiff === 0) return hm;
  if (dayDiff === 1) return `завтра ${hm}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function seatsLeft(total: number, taken: number): string {
  const left = Math.max(0, total - taken);
  if (left === 0) return "мест нет";
  const mod10 = left % 10;
  const mod100 = left % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "место" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "места" : "мест";
  return `${left} ${word}`;
}

export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^[78]/, "").slice(0, 10);
  let out = "+7";
  if (d.length > 0) out += " " + d.slice(0, 3);
  if (d.length > 3) out += " " + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  if (d.length > 8) out += "-" + d.slice(8, 10);
  return out;
}

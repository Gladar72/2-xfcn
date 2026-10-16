/**
 * Намёки «Хочу на встречу», которые человек уже разобрал (позвал или скрыл) —
 * помним в браузере, чтобы карточка и цифра на «Встречах» не висели вечно.
 * Сами намёки живут неделю (см. /api/me/meet-hints).
 */
const KEY = "mesto_hints_done";

export function doneHints(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markHintDone(id: string) {
  try {
    const s = doneHints();
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify([...s].slice(-100)));
    window.dispatchEvent(new Event("mesto:hints"));
  } catch {
    /* хранилище недоступно — не страшно */
  }
}

/**
 * Когда напомнить организатору «никто не откликнулся — поделись событием».
 *
 *   * обычно — за 10 часов до начала;
 *   * если событие создали позже (меньше чем за 10 часов) — через 2 часа после создания;
 *   * если до начала меньше 30 минут — уже не напоминаем.
 *
 * Общая логика для бота (lib/telegram/share-nudge.ts) и карточки на странице события.
 */
export const SHARE_NUDGE_BEFORE_MS = 10 * 60 * 60 * 1000;
export const SHARE_NUDGE_AFTER_CREATE_MS = 2 * 60 * 60 * 1000;
export const SHARE_NUDGE_MIN_LEFT_MS = 30 * 60 * 1000;

export function shareNudgeAt(startMs: number, createdMs: number | null): number {
  const before = startMs - SHARE_NUDGE_BEFORE_MS;
  if (createdMs != null && createdMs > before) return createdMs + SHARE_NUDGE_AFTER_CREATE_MS;
  return before;
}

/** Пора ли напоминать прямо сейчас (без учёта откликов — их проверяет вызывающий). */
export function shareNudgeDue(startMs: number, createdMs: number | null, now = Date.now()): boolean {
  return now >= shareNudgeAt(startMs, createdMs) && startMs - now > SHARE_NUDGE_MIN_LEFT_MS;
}

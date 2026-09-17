import { MORNING_REMINDER_MESSAGES, type ReminderMessage } from "@/lib/morning-reminders/message-bank";

export interface ReminderHistoryEntry {
  messageId: string | null;
  topic: string | null;
  greetingKey: string | null;
}

/**
 * Выбирает следующее сообщение для пользователя с учётом истории (см. ТЗ,
 * раздел 3 "Разнообразие"):
 *   1. не повторяет текст, пока не использован весь банк;
 *   2. не повторяет тему, которая была в прошлый раз;
 *   3. не использует приветствие, которое было в последних 5 сообщениях.
 *
 * history — уже отправленные сообщения этому пользователю, НОВЫЕ СНАЧАЛА
 * (history[0] — самое недавнее). Правила применяются по порядку строгости;
 * если после всех трёх фильтров кандидатов не осталось — ослабляем самое
 * нестрогое правило первым (лучше повторить приветствие, чем совсем не
 * прислать сообщение), и только в совсем крайнем случае разрешаем полный
 * повтор текста.
 */
export function pickNextMessage(history: ReminderHistoryEntry[]): ReminderMessage {
  const usedMessageIds = new Set(history.map((h) => h.messageId).filter((id): id is string => !!id));
  const lastTopic = history[0]?.topic ?? null;
  const recentGreetings = new Set(
    history.slice(0, 5).map((h) => h.greetingKey).filter((g): g is string => !!g)
  );

  // Весь банк использован — начинаем заново (иначе после ~9 сообщений на
  // тему пользователь просто перестал бы получать напоминания вовсе).
  const bankExhausted = MORNING_REMINDER_MESSAGES.every((m) => usedMessageIds.has(m.id));
  const notUsedPool = bankExhausted
    ? MORNING_REMINDER_MESSAGES
    : MORNING_REMINDER_MESSAGES.filter((m) => !usedMessageIds.has(m.id));

  const attempts: Array<(m: ReminderMessage) => boolean> = [
    (m) => m.topic !== lastTopic && !recentGreetings.has(m.greetingKey),
    (m) => m.topic !== lastTopic, // ослабляем правило приветствий первым
    () => true, // в крайнем случае — любое неиспользованное сообщение
  ];

  for (const passes of attempts) {
    const candidates = notUsedPool.filter(passes);
    if (candidates.length > 0) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      if (picked) return picked;
    }
  }

  // Теоретически недостижимо (banka из 63 сообщений на 7 тем), но на
  // случай пустого банка — берём случайное сообщение вообще без фильтров.
  const fallback = MORNING_REMINDER_MESSAGES[Math.floor(Math.random() * MORNING_REMINDER_MESSAGES.length)];
  if (fallback) return fallback;
  // Совсем крайний случай — банк пуст (невозможно при текущих данных).
  throw new Error("MORNING_REMINDER_MESSAGES пуст — нечего выбирать");
}

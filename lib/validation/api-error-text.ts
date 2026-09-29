/**
 * Понятный текст ошибки для человека из ответа нашего API.
 *
 * Порядок: готовое сообщение от сервера (`message`) → известный код ошибки
 * → общий текст с кодом, чтобы даже в неожиданном случае было понятно, что
 * случилось, и было что прислать в поддержку. Раньше в приложении почти
 * везде показывалось только общее «Не получилось …» без причины.
 */
const KNOWN_ERRORS: Record<string, string> = {
  unauthorized: "Сессия истекла — закрой приложение и открой его заново через бота.",
  forbidden: "Нет доступа к этому действию.",
  not_found: "Не нашли то, что ты ищешь — возможно, это уже удалили.",
  subscription_required: "Для этого нужна активная подписка.",
  events_limit_reached: "Лимит встреч по твоему тарифу на этот период исчерпан.",
  photo_rejected: "Это фото не прошло проверку — выбери другое.",
  photo_invalid: "Не получилось прочитать фото — выбери его заново.",
  photo_too_large: "Фото слишком большое — выбери фото поменьше.",
  photo_upload_failed: "Не получилось загрузить фото. Попробуй ещё раз.",
  event_closed: "Встреча уже прошла или отменена.",
  blocked: "Ты не можешь писать в этот чат.",
  missing_init_data: "Открой приложение через Telegram-бота.",
  invalid_init_data: "Не получилось проверить вход через Telegram — открой приложение заново через бота.",
  server_misconfigured: "Сервер временно недоступен. Попробуй чуть позже.",
  // Отклик «Я иду»
  event_not_found: "Эта встреча больше не существует.",
  event_full: "Мест на эту встречу уже не осталось.",
  cannot_apply_to_own_event: "Это твоя встреча — откликаться на неё не нужно.",
  already_applied: "Ты уже откликался на эту встречу.",
  applications_limit_reached:
    "Лимит откликов по твоему тарифу на этот период исчерпан — загляни в раздел «Подписка», чтобы поднять лимит.",
  missing_event_id: "Не получилось определить встречу — обнови страницу.",
  // Билеты
  ticket_not_found: "Билета нет — возможно, участие отменено.",
  event_already_started: "Событие уже началось — отменить участие нельзя.",
  not_a_member: "Ты уже не участник этого события.",
};

export function apiErrorText(data: unknown, fallback: string, status?: number): string {
  const body = (data && typeof data === "object" ? data : {}) as { error?: unknown; message?: unknown };
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  const code = typeof body.error === "string" ? body.error : null;
  const known = code ? KNOWN_ERRORS[code] : undefined;
  if (known) return known;
  if (status === 413) return "Слишком большой файл — выбери фото поменьше.";
  const shownCode = code ?? (status ? `HTTP ${status}` : null);
  return shownCode ? `${fallback} (код ошибки: ${shownCode})` : fallback;
}
